import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';
import { BRAZIL_SMALL_CITY_TARGETS, OUTREACH_SEGMENTS } from '../src/data/brazil-small-cities.js';
import { resolveSearchTargetOverride, selectSearchTargets } from '../src/lib/outreach-city-selector.js';
import { sendOutreachSequence } from '../src/lib/outreach-delivery.js';
import { normalizeOutreachEvent } from '../src/lib/outreach-events.js';
import { createGoogleOutreachClient, inspectBusinessWebsite } from '../src/lib/google-outreach-client.js';
import { createGoogleBrowserOutreachClient } from '../src/lib/google-browser-outreach-client.js';
import { createOutreachDiscoveryClient, outreachCandidateLimit, outreachDiscoveryMode } from '../src/lib/outreach-discovery-client.js';
import { buildOutreachMessage } from '../src/lib/outreach-message.js';
import { runDailyOutreach } from '../src/lib/outreach-orchestrator.js';
import { buildOutreachPreview } from '../src/lib/outreach-preview.js';
import { qualifyOutreachCandidate } from '../src/lib/outreach-qualification.js';
import { OUTREACH_QUOTA_LIMITS, reserveQuota } from '../src/lib/outreach-quotas.js';
import {
  evolutionV2Request,
  evolutionV2SalesConfig,
  getEvolutionV2ConnectionState,
  getEvolutionV2WebhookState,
  probeEvolutionV2WebhookReceiver,
  sendEvolutionV2SalesMedia,
  sendEvolutionV2SalesText
} from '../src/lib/evolution-v2-sales.js';
import { isOutreachWebhookHealthy } from '../src/lib/sales-automation.js';
import { evaluateOutreachSendGate } from '../src/lib/outreach-send-policy.js';
import { normalizeSalesPhone } from '../src/lib/sales-automation.js';
import { cleanupExpiredOutreachMenus } from '../src/lib/outreach-menu-lifecycle.js';

try { process.loadEnvFile?.('.env'); } catch {}

const command = process.argv[2] || 'status';
const flags = parseFlags(process.argv.slice(3));
const pool = command === 'worker' && !bool(process.env.OUTREACH_AUTOMATION_ENABLED) ? null : getLocalPool();

try {
  const result = await execute(command, flags);
  if (result !== undefined) console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: safe(error.message), code: error.code || null }));
  process.exitCode = 1;
} finally {
  await pool?.end().catch(() => {});
}

async function execute(name, options) {
  if (name === 'status') return status();
  if (name === 'pause' || name === 'resume') return setPaused(name === 'pause', options.reason);
  if (name === 'run') {
    const dryRun = Boolean(options['dry-run']);
    if (options.now && !dryRun) throw new Error('--now só pode ser usado com --dry-run.');
    return run(dryRun, Number(options.limit || 15), options.now, {
      city: options.city,
      state: options.state,
      segment: options.segment
    });
  }
  if (name === 'worker') return worker(Boolean(options.once));
  throw new Error('Use: status | run --dry-run | worker --once | pause | resume');
}

async function status() {
  const settings = await settingsRow();
  const provider = await getEvolutionV2ConnectionState(evolutionV2SalesConfig()).catch((error) => ({ connected: false, state: 'error', error: safe(error.message) }));
  const webhookHealthy = await probeWebhookHealth();
  const quotas = (await pool.query(`select sku,reserved_units,consumed_units,limit_units from sales_quota_usage where usage_month=date_trunc('month',now())::date order by sku`)).rows;
  return {
    enabled: bool(process.env.OUTREACH_AUTOMATION_ENABLED),
    paused: Boolean(settings.paused),
    provider,
    webhook_healthy: webhookHealthy,
    last_webhook_at: settings.metadata?.outreach_last_webhook_at || null,
    quotas
  };
}

async function setPaused(paused, reason = '') {
  const result = await pool.query(`update sales_automation_settings set paused=$1,metadata=metadata||jsonb_build_object('outreach_pause_reason',$2::text),updated_at=now() where id='global' returning *`, [paused, safe(reason || (paused ? 'manual' : ''))]);
  return result.rows[0];
}

async function run(dryRun, maxContacts, nowValue = '', requestedTarget = {}) {
  if (!dryRun && !bool(process.env.OUTREACH_AUTOMATION_ENABLED)) throw new Error('OUTREACH_AUTOMATION_ENABLED está desativado.');
  const now = nowValue ? new Date(String(nowValue)) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error('Data inválida para o dry-run.');
  const targetOverride = resolveSearchTargetOverride({ ...requestedTarget, cities: BRAZIL_SMALL_CITY_TARGETS, segments: OUTREACH_SEGMENTS });
  return runDailyOutreach({ now, dryRun, maxContacts, dependencies: productionDependencies({ dryRun, targetOverride }) });
}

async function worker(once) {
  if (!bool(process.env.OUTREACH_AUTOMATION_ENABLED)) return { enabled: false, processed: 0 };
  let cycles = 0;
  do {
    try {
      await run(false, Number(process.env.OUTREACH_DAILY_LIMIT || 15));
      await processDueSequences();
      await cleanupExpiredOutreachMenus({ pool }).catch((err) => {
        console.error(JSON.stringify({ ok: false, scope: 'menu_cleanup_cycle', error: safe(err.message) }));
      });
    } catch (error) {
      await recordEvent({ event_type: 'outreach_failed', result: 'failure', details: { step: 'worker_cycle', error: safe(error.message) } }).catch(() => {});
      if (once) throw error;
      console.error(JSON.stringify({ ok: false, scope: 'outreach_worker_cycle', error: safe(error.message) }));
    }
    cycles += 1;
    if (once) break;
    await sleep(Math.max(15, Number(process.env.OUTREACH_WORKER_INTERVAL_SECONDS || 60)) * 1000);
  } while (true);
  return { cycles };
}

function productionDependencies({ dryRun, targetOverride = null }) {
  const quotaLimits = {
    ...OUTREACH_QUOTA_LIMITS,
    places_pro: Math.min(OUTREACH_QUOTA_LIMITS.places_pro, positive(process.env.GOOGLE_OUTREACH_PLACES_PRO_LIMIT, OUTREACH_QUOTA_LIMITS.places_pro)),
    places_advanced: Math.min(OUTREACH_QUOTA_LIMITS.places_advanced, positive(process.env.GOOGLE_OUTREACH_PLACES_ADVANCED_LIMIT, OUTREACH_QUOTA_LIMITS.places_advanced)),
    place_photos: Math.min(OUTREACH_QUOTA_LIMITS.place_photos, positive(process.env.GOOGLE_OUTREACH_PHOTO_LIMIT, OUTREACH_QUOTA_LIMITS.place_photos)),
    vision_label: Math.min(OUTREACH_QUOTA_LIMITS.vision_label, positive(process.env.GOOGLE_OUTREACH_VISION_LIMIT, OUTREACH_QUOTA_LIMITS.vision_label))
  };
  const discoveryMode = outreachDiscoveryMode(process.env);
  const google = createOutreachDiscoveryClient({
    env: process.env,
    apiFactory: createGoogleOutreachClient,
    browserFactory: createGoogleBrowserOutreachClient,
    apiOptions: {
      apiKey: process.env.GOOGLE_OUTREACH_API_KEY,
      timeoutMs: Number(process.env.GOOGLE_OUTREACH_TIMEOUT_MS || 10000),
      reserveQuota: (request) => reserveQuota({ ...request, client: pool, limits: quotaLimits })
    },
    browserOptions: {
      chromePath: process.env.CHROME_PATH,
      timeoutMs: Number(process.env.GOOGLE_OUTREACH_BROWSER_TIMEOUT_MS || 15000),
      maxQueries: Number(process.env.GOOGLE_OUTREACH_BROWSER_MAX_QUERIES || 30),
      minIntervalMs: Number(process.env.GOOGLE_OUTREACH_BROWSER_MIN_INTERVAL_MS || 1500)
    }
  });
  return {
    async getState() {
      const settings = await settingsRow();
      const quota = await pool.query(`select coalesce(bool_and(reserved_units<limit_units),true) available from sales_quota_usage where usage_month=date_trunc('month',now())::date`);
      return {
        paused: Boolean(settings.paused),
        quotaAvailable: discoveryMode === 'browser' || Boolean(quota.rows[0]?.available),
        webhookHealthy: dryRun || await probeWebhookHealth()
      };
    },
    async findExistingRun({ runKey, dryRun: simulated }) {
      return (await pool.query(`select r.*,(select count(*)::int from sales_automation_jobs j where j.job_type='send_sequence' and j.payload->>'runId'=r.id::text and j.status<>'cancelled') scheduled_count from sales_discovery_runs r where r.run_key=$1 limit 1`, [`${runKey}:${simulated ? 'dry' : 'live'}`])).rows[0] || null;
    },
    async startRun({ runKey, scheduledFor, dryRun: simulated }) {
      const key = `${runKey}:${simulated ? 'dry' : 'live'}`;
      return (await pool.query(`insert into sales_discovery_runs(run_key,scheduled_for,status,started_at,details) values($1,$2,'running',now(),jsonb_build_object('dry_run',$3::boolean)) on conflict(run_key) do update set status='running',started_at=now(),last_error=null,updated_at=now() returning *`, [key, scheduledFor, simulated])).rows[0];
    },
    async discoverCandidates({ targetCount, runId }) {
      const candidateLimit = outreachCandidateLimit({ mode: discoveryMode, requested: targetCount, env: process.env });
      const history = (await pool.query(`select * from sales_search_targets`)).rows;
      const targets = targetOverride ? [targetOverride] : selectSearchTargets({ cities: BRAZIL_SMALL_CITY_TARGETS, segments: OUTREACH_SEGMENTS, history, count: 5 });
      const found = new Map();
      for (const target of targets) {
        const places = await google.searchPlaces({ query: `${target.segment} em ${target.city} ${target.state}`, runId });
        for (const place of places) {
          if (found.size >= candidateLimit) break;
          found.set(place.id, { ...place, city: target.city, state: target.state, segment: target.segment });
        }
        await pool.query(`insert into sales_search_targets(city,state,population,segment,last_searched_at,search_count) values($1,$2,$3,$4,now(),1) on conflict(city,state,segment) do update set last_searched_at=now(),search_count=sales_search_targets.search_count+1,updated_at=now()`, [target.city, target.state, target.population, target.segment]);
        if (found.size >= candidateLimit) break;
      }
      return [...found.values()];
    },
    async qualifyCandidate(candidate, context) {
      const details = await google.getPlaceDetails({ placeId: candidate.id, runId: context.runId });
      const enriched = { ...candidate, ...details, city: candidate.city, state: candidate.state, segment: candidate.segment };
      const normalizedPhone = normalizeSalesPhone(details.nationalPhoneNumber || '');
      let existingLead = (await pool.query(`select * from sales_leads where google_place_id=$1 or ($2<>'' and normalized_phone=$2) order by (google_place_id=$1) desc limit 1`, [candidate.id, normalizedPhone])).rows[0] || null;
      if (!existingLead) {
        existingLead = (await pool.query(`insert into sales_leads(business_name,phone,normalized_phone,city,state,segment,source,stage,google_place_id,metadata) values($1,$2,$3,$4,$5,$6,'google_outreach','discovered',$7,jsonb_build_object('outreach_run_id',$8::text)) on conflict(google_place_id) where google_place_id is not null do update set updated_at=now() returning *`, [details.displayName?.text || candidate.displayName?.text || 'Estabelecimento', details.nationalPhoneNumber || null, normalizedPhone || null, candidate.city, candidate.state, candidate.segment, candidate.id, context.runId])).rows[0];
      }
      await recordEvent({ event_type: 'lead_discovered', run_id: context.runId, lead_id: existingLead.id, place_id: candidate.id, stage: existingLead.stage, result: 'success', details: { city: candidate.city, state: candidate.state, segment: candidate.segment } });
      if (!matchesTargetLocation(details.formattedAddress, candidate.city, candidate.state)) {
        const qualification = { qualified: false, stage: 'discarded', code: 'location_mismatch', evidence: { formatted_address: details.formattedAddress || null }, photos: [] };
        await persistDiscard(existingLead, candidate, context, qualification);
        return qualification;
      }
      const qualification = await qualifyOutreachCandidate(enriched, {
        now: context.now,
        activityMaxDays: Number(process.env.OUTREACH_ACTIVITY_MAX_DAYS || 90),
        hasPriorContact: async ({ placeId, phone }) => {
          const prior = await pool.query(`select l.id,l.stage,l.automation_status,(exists(select 1 from sales_messages m where m.lead_id=l.id and m.direction='outbound' and m.status='sent') or exists(select 1 from sales_automation_jobs j where j.lead_id=l.id and j.job_type='send_sequence' and j.status<>'cancelled')) contacted from sales_leads l where l.google_place_id=$1 or l.normalized_phone=$2 limit 1`, [placeId, phone]);
          const row = prior.rows[0];
          return Boolean(row && (row.contacted || row.automation_status !== 'active' || ['human_handoff', 'send_failed', 'opted_out', 'not_interested', 'won', 'lost'].includes(row.stage)));
        },
        isSuppressed: async ({ phone }) => Boolean((await pool.query(`select 1 from sales_suppressions where normalized_phone=$1 limit 1`, [phone])).rowCount),
        checkWhatsApp,
        searchMenu: (input) => {
          if (typeof google.searchMenu === 'function') return google.searchMenu(input);
          if (!enriched.websiteUri) throw new Error('Sem site oficial para verificar a existência de cardápio online.');
          return inspectBusinessWebsite(enriched.websiteUri);
        },
        validatePhoto: async (photo) => {
          const downloaded = await google.getPhoto({ photoName: photo.name, runId: context.runId });
          const metadata = await sharp(downloaded.bytes).metadata();
          const classification = await google.classifyFoodPhoto({ bytes: downloaded.bytes, runId: context.runId });
          photo.bytes = Buffer.from(downloaded.bytes);
          return { usable: Boolean(metadata.width && metadata.height && metadata.format && classification.isFood), kind: classification.isFood ? 'food' : 'other', labels: classification.labels, hasMenuText: classification.hasMenuText };
        }
      });
      if (!qualification.qualified) {
        await persistDiscard(existingLead, candidate, context, qualification);
        return qualification;
      }
      const patch = qualification.leadPatch;
      const saved = existingLead
        ? await pool.query(`update sales_leads set business_name=$2,phone=$3,normalized_phone=$4,city=$5,state=$6,segment=$7,stage='photos_ready',last_validated_at=$8,discard_code=null,discard_details='{}'::jsonb,metadata=metadata||jsonb_build_object('outreach_run_id',$9::text,'evidence',$10::jsonb),updated_at=now() where id=$1 returning *`, [existingLead.id, patch.business_name, patch.phone, patch.normalized_phone, patch.city, patch.state, patch.segment, patch.last_validated_at, context.runId, JSON.stringify(qualification.evidence)])
        : await pool.query(`insert into sales_leads(business_name,phone,normalized_phone,city,state,segment,source,stage,google_place_id,last_validated_at,metadata) values($1,$2,$3,$4,$5,$6,'google_outreach','photos_ready',$7,$8,jsonb_build_object('outreach_run_id',$9::text,'evidence',$10::jsonb)) returning *`, [patch.business_name, patch.phone, patch.normalized_phone, patch.city, patch.state, patch.segment, patch.google_place_id, patch.last_validated_at, context.runId, JSON.stringify(qualification.evidence)]);
      await recordEvent({ event_type: 'lead_photos_ready', run_id: context.runId, lead_id: saved.rows[0].id, place_id: candidate.id, stage: 'photos_ready', result: 'success', details: qualification.evidence });
      return { ...qualification, lead: saved.rows[0] };
    },
    async buildPreview({ lead, photos, runId }) {
      const outputDir = path.resolve(process.env.OUTREACH_ARTIFACT_DIR || 'artifacts/outreach/automated', runId, `${slug(lead.business_name)}-${lead.id.slice(0, 8)}`);
      await mkdir(outputDir, { recursive: true });
      const preview = await buildOutreachPreview({ lead, photos, outputDir, chromePath: process.env.CHROME_PATH });
      await pool.query(`update sales_leads set preview_desktop_path=$2,preview_mobile_path=$3,stage='preview_ready',updated_at=now() where id=$1`, [lead.id, preview.desktopPath, preview.mobilePath]);
      await recordEvent({ event_type: 'lead_preview_ready', run_id: runId, lead_id: lead.id, place_id: lead.google_place_id, stage: 'preview_ready', result: 'success', details: { desktop: preview.desktopPath, mobile: preview.mobilePath } });
      return preview;
    },
    async scheduleContact({ lead, preview, runId, scheduledAt, idempotencyKey }) {
      const eligible = await pool.query(`select 1 from sales_leads where id=$1 and automation_status='active' and stage not in('human_handoff','send_failed','opted_out','not_interested','won','lost')`, [lead.id]);
      if (!eligible.rowCount) throw new Error('Lead não está elegível para contato automático.');
      await pool.query(`insert into sales_automation_jobs(lead_id,job_type,idempotency_key,run_at,payload) values($1,'send_sequence',$2,$3,$4::jsonb) on conflict(idempotency_key) do nothing`, [lead.id, idempotencyKey, scheduledAt, JSON.stringify({ runId, message: buildOutreachMessage(lead), previews: preview, progress: {} })]);
      await pool.query(`update sales_leads set stage='scheduled',updated_at=now() where id=$1`, [lead.id]);
      await recordEvent({ event_type: 'lead_scheduled', run_id: runId, lead_id: lead.id, place_id: lead.google_place_id, stage: 'scheduled', result: 'success', details: { scheduled_at: scheduledAt.toISOString() } });
    },
    async completeRun({ run, status, candidates, qualified, discarded }) {
      await pool.query(`update sales_discovery_runs set status=$2,candidates_found=$3,qualified_count=$4,discarded_count=$5,preview_count=$4,sent_count=0,completed_at=now(),updated_at=now() where id=$1`, [run.id, status, candidates, qualified, discarded]);
    },
    recordEvent
  };
}

async function processDueSequences() {
  for (;;) {
    const job = await claimSequence();
    if (!job) return;
    if (job.skipped) continue;
    const lead = (await pool.query(`select * from sales_leads where id=$1`, [job.lead_id])).rows[0];
    if (!lead) { await finishJob(job.id, 'failed', 'Lead não encontrado.'); continue; }
    try {
      if (lead.automation_status !== 'active' || ['human_handoff', 'send_failed', 'opted_out', 'not_interested', 'won', 'lost'].includes(lead.stage)) {
        await finishJob(job.id, 'cancelled', 'lead_ineligible');
        continue;
      }
      const priorContact = await pool.query(`select exists(select 1 from sales_messages where lead_id=$1 and direction='outbound' and status='sent') sent,exists(select 1 from sales_automation_jobs where lead_id=$1 and job_type='send_sequence' and id<>$2 and (payload#>'{progress,text_attempt}') is not null) attempted`, [lead.id, job.id]);
      const currentContactStarted = Boolean(job.payload?.progress?.text || job.payload?.progress?.text_attempt);
      if ((priorContact.rows[0]?.sent && !currentContactStarted) || priorContact.rows[0]?.attempted) {
        await finishJob(job.id, 'cancelled', 'prior_contact_detected');
        continue;
      }
      const conversation = await ensureConversation(lead.id);
      const settings = await settingsRow();
      const providerState = await getEvolutionV2ConnectionState(evolutionV2SalesConfig());
      const webhookHealthy = await probeWebhookHealth();
      const sendGate = evaluateOutreachSendGate({
        now: new Date(), paused: Boolean(settings.paused), providerConnected: providerState.connected,
        webhookHealthy,
        lastValidatedAt: lead.last_validated_at, dailyClaimed: 0,
        dailyLimit: Number(process.env.OUTREACH_DAILY_LIMIT || 15), contactStarted: Boolean(job.payload?.progress?.text)
      });
      if (!sendGate.allowed) {
        if (sendGate.reason === 'revalidation_required') {
          const attempted = Boolean(job.payload?.progress?.text_attempt);
          await pool.query(`update sales_leads set stage=$2,automation_status=$3,stop_reason=$4,updated_at=now() where id=$1`, [lead.id, attempted ? 'human_handoff' : 'discovered', attempted ? 'paused' : 'active', attempted ? 'Envio parcial pendente de revisão manual.' : null]);
          await finishJob(job.id, 'cancelled', sendGate.reason);
        } else await finishJob(job.id, 'retry', sendGate.reason);
        continue;
      }
      const result = await sendOutreachSequence({
        lead,
        message: job.payload.message,
        previews: job.payload.previews,
        dependencies: {
          getConnection: async () => providerState,
          getWebhookHealth: async () => ({ status: webhookHealthy ? 'healthy' : 'unhealthy', lastReceivedAt: webhookHealthy ? new Date().toISOString() : null }),
          isSuppressed: async () => Boolean((await pool.query(`select 1 from sales_suppressions where normalized_phone=$1 limit 1`, [lead.normalized_phone])).rowCount),
          loadProgress: async () => job.payload.progress || {},
          saveStep: async (step, data) => { job.payload.progress = { ...(job.payload.progress || {}), [step]: data }; await pool.query(`update sales_automation_jobs set payload=$2::jsonb,updated_at=now() where id=$1`, [job.id, JSON.stringify(job.payload)]); },
          recordEvent,
          recordFailure: registerProviderFailure,
          sendText: async ({ phone, text }) => {
            const sent = await sendEvolutionV2SalesText({ phone, text }, evolutionV2SalesConfig());
            await saveOutbound(lead.id, conversation.id, text, sent.id, 'outreach_text');
            return sent;
          },
          sendMedia: async ({ phone, media, mimeType, caption, fileName }) => {
            const sent = await sendEvolutionV2SalesMedia({ phone, mediaBase64: media, mimeType, caption }, evolutionV2SalesConfig());
            await saveOutbound(lead.id, conversation.id, caption, sent.id, fileName.includes('mobile') ? 'outreach_mobile' : 'outreach_desktop');
            return sent;
          }
        }
      });
      if (result.blocked) { await finishJob(job.id, 'retry', result.reason); continue; }
      await pool.query(`update sales_leads set stage='awaiting_reply',attempt_count=attempt_count+1,last_contact_at=now(),next_followup_at=null,updated_at=now() where id=$1`, [lead.id]);
      await pool.query(`update sales_discovery_runs set sent_count=sent_count+1,updated_at=now() where id=$1`, [job.payload.runId]);
      await pool.query(`update sales_automation_settings set metadata=metadata||'{"outreach_consecutive_failures":0}'::jsonb,updated_at=now() where id='global'`);
      await finishJob(job.id, 'completed', null);
    } catch (error) {
      if (error.circuitOpen) await setPaused(true, 'three_consecutive_provider_failures');
      const ambiguous = error.code === 'OUTREACH_AMBIGUOUS_DELIVERY';
      const exhausted = Number(job.attempt_count) >= 3;
      await finishJob(job.id, ambiguous || exhausted ? 'failed' : 'retry', error.message);
      if (ambiguous) await pool.query(`update sales_leads set stage='human_handoff',automation_status='paused',stop_reason=$2,updated_at=now() where id=$1`, [lead.id, safe(error.message)]);
      else if (exhausted) await pool.query(`update sales_leads set stage='send_failed',updated_at=now() where id=$1`, [lead.id]);
    }
  }
}

async function claimSequence() {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`select pg_advisory_xact_lock(hashtext('tapronto-outreach-daily-send'))`);
    const found = await client.query(`select j.*,l.last_validated_at from sales_automation_jobs j join sales_leads l on l.id=j.lead_id where j.job_type='send_sequence' and (j.status in('pending','retry') or (j.status='claimed' and j.lock_expires_at<now())) and j.run_at<=now() order by (j.payload#>'{progress,text}') is not null desc,j.run_at for update of j skip locked limit 1`);
    if (!found.rows[0]) { await client.query('commit'); return null; }
    const candidate = found.rows[0];
    const settings = (await client.query(`select paused from sales_automation_settings where id='global'`)).rows[0] || { paused: true };
    const daily = await client.query(`select count(*)::int as count from sales_automation_jobs where job_type='send_sequence' and (run_at at time zone 'America/Sao_Paulo')::date=(now() at time zone 'America/Sao_Paulo')::date and ((payload#>'{progress,text}') is not null or status in('claimed','completed'))`);
    const gate = evaluateOutreachSendGate({
      now: new Date(), paused: Boolean(settings.paused), lastValidatedAt: candidate.last_validated_at,
      dailyClaimed: Number(daily.rows[0]?.count || 0), dailyLimit: Number(process.env.OUTREACH_DAILY_LIMIT || 15),
      contactStarted: Boolean(candidate.payload?.progress?.text)
    });
    if (!gate.allowed) {
      if (gate.reason === 'revalidation_required') {
        await client.query(`update sales_automation_jobs set status='cancelled',last_error=$2,updated_at=now() where id=$1`, [candidate.id, gate.reason]);
        const attempted = Boolean(candidate.payload?.progress?.text_attempt);
        await client.query(`update sales_leads set stage=$2,automation_status=$3,stop_reason=$4,updated_at=now() where id=$1`, [candidate.lead_id, attempted ? 'human_handoff' : 'discovered', attempted ? 'paused' : 'active', attempted ? 'Envio parcial pendente de revisão manual.' : null]);
        await client.query('commit');
        return { skipped: true };
      }
      await client.query('commit');
      return null;
    }
    const claimed = await client.query(`update sales_automation_jobs set status='claimed',attempt_count=attempt_count+1,lock_expires_at=now()+interval '5 minutes',updated_at=now() where id=$1 returning *`, [candidate.id]);
    await client.query('commit'); return claimed.rows[0];
  } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
}

async function finishJob(id, status, error) {
  const retryDelay = status === 'retry' ? `,run_at=now()+interval '5 minutes'` : '';
  await pool.query(`update sales_automation_jobs set status=$2,last_error=$3,lock_expires_at=null,updated_at=now()${retryDelay} where id=$1`, [id, status, error ? safe(error) : null]);
}

async function settingsRow() {
  return (await pool.query(`select * from sales_automation_settings where id='global'`)).rows[0] || { paused: true, metadata: {} };
}

async function probeWebhookHealth() {
  const checkedAt = new Date();
  const expectedUrl = String(process.env.SALES_EVOLUTION_V2_WEBHOOK_URL || '').trim();
  if (!expectedUrl) return false;
  try {
    const state = await getEvolutionV2WebhookState({ expectedUrl }, evolutionV2SalesConfig());
    if (state.healthy) {
      await probeEvolutionV2WebhookReceiver({ url: expectedUrl }, evolutionV2SalesConfig());
      await pool.query(`update sales_automation_settings set metadata=metadata||jsonb_build_object('outreach_webhook_last_healthy_at',$1::text),updated_at=now() where id='global'`, [checkedAt.toISOString()]);
      return true;
    }
  } catch {}
  const settings = await settingsRow();
  return isOutreachWebhookHealthy({ lastReceivedAt: settings.metadata?.outreach_webhook_last_healthy_at }, checkedAt);
}

async function recordEvent(input) {
  const event = normalizeOutreachEvent(input);
  await pool.query(`insert into sales_automation_events(lead_id,run_id,place_id,event_type,stage,attempt,result,details) values($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`, [event.lead_id, event.run_id, event.place_id, event.event_type, event.stage, event.attempt, event.result, JSON.stringify(event.details)]);
}

async function persistDiscard(lead, candidate, context, qualification) {
  const discardableStages = ['discovered', 'basic_validated', 'activity_validated', 'menu_checked', 'photos_ready', 'preview_ready', 'discarded'];
  const protectedLead = qualification.code === 'duplicate' || lead.automation_status !== 'active' || !discardableStages.includes(lead.stage);
  if (!protectedLead) {
    await pool.query(`update sales_leads set stage='discarded',discard_code=$2,discard_details=$3::jsonb,last_validated_at=$4,updated_at=now() where id=$1`, [lead.id, qualification.code, JSON.stringify(qualification.evidence || {}), context.now.toISOString()]);
  }
  await recordEvent({ event_type: 'lead_discarded', run_id: context.runId, lead_id: lead.id, place_id: candidate.id, stage: protectedLead ? lead.stage : 'discarded', result: 'success', details: { discard_code: qualification.code, ...qualification.evidence } });
}

async function checkWhatsApp(phone) {
  const config = evolutionV2SalesConfig();
  const data = await evolutionV2Request(`/chat/whatsappNumbers/${encodeURIComponent(config.instance)}`, { method: 'POST', body: JSON.stringify({ numbers: [phone] }) }, config);
  const row = Array.isArray(data) ? data[0] : data?.numbers?.[0] || data;
  return Boolean(row?.exists ?? row?.isBusiness ?? row?.jid);
}

async function registerProviderFailure() {
  const result = await pool.query(`update sales_automation_settings set metadata=jsonb_set(metadata,'{outreach_consecutive_failures}',to_jsonb(coalesce((metadata->>'outreach_consecutive_failures')::int,0)+1),true),updated_at=now() where id='global' returning (metadata->>'outreach_consecutive_failures')::int as failures`);
  return { consecutiveFailures: Number(result.rows[0]?.failures || 1) };
}

async function ensureConversation(leadId) {
  return (await pool.query(`insert into sales_conversations(lead_id) values($1) on conflict(lead_id) where status='active' do update set updated_at=now() returning *`, [leadId])).rows[0];
}

async function saveOutbound(leadId, conversationId, body, providerId, kind) {
  await pool.query(`insert into sales_messages(lead_id,conversation_id,provider_message_id,direction,body,status,requires_approval,approved_at,sent_at,metadata) values($1,$2,$3,'outbound',$4,'sent',false,now(),now(),jsonb_build_object('kind',$5::text)) on conflict(provider_message_id) do nothing`, [leadId, conversationId, providerId, body, kind]);
}

function parseFlags(args) { const result = {}; for (let index = 0; index < args.length; index += 1) { const value = args[index]; if (!value.startsWith('--')) continue; const [key, inline] = value.slice(2).split('=', 2); result[key] = inline ?? (args[index + 1] && !args[index + 1].startsWith('--') ? args[++index] : true); } return result; }
function bool(value) { return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase()); }
function positive(value, fallback) { const number = Number(value); return Number.isInteger(number) && number > 0 ? number : fallback; }
function safe(value) { return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 500); }
function slug(value) { return safe(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'lead'; }
function matchesTargetLocation(address, city, state) {
  const normalized = (value) => safe(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const haystack = normalized(address);
  return Boolean(haystack && haystack.includes(normalized(city)) && new RegExp(`(^|\\W)${normalized(state)}(\\W|$)`, 'i').test(haystack));
}
function sleep(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }
