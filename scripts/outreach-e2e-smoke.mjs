import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import sharp from 'sharp';
import { sendOutreachSequence } from '../src/lib/outreach-delivery.js';
import { buildOutreachMetrics } from '../src/lib/outreach-metrics.js';
import { buildOutreachMessage } from '../src/lib/outreach-message.js';
import { runDailyOutreach } from '../src/lib/outreach-orchestrator.js';
import { buildOutreachPreview } from '../src/lib/outreach-preview.js';
import { qualifyOutreachCandidate } from '../src/lib/outreach-qualification.js';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL é obrigatório para o smoke ponta a ponta.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
const temporary = await mkdtemp(path.join(os.tmpdir(), 'tapronto-outreach-e2e-'));
const now = new Date('2026-10-13T13:00:00.000Z');
const runKey = `e2e-${Date.now()}`;

try {
  await client.query('begin');
  const photo = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#b86b31' } }).png().toBuffer();
  const candidates = [
    { id: `${runKey}-good`, displayName: { text: 'Padaria E2E' }, nationalPhoneNumber: '11 99999-1111', city: 'Horizontina', state: 'RS', segment: 'padaria', recentPostAt: '2026-10-10T12:00:00Z', photos: [{ name: 'photo-a', bytes: photo }, { name: 'photo-b', bytes: photo }] },
    { id: `${runKey}-menu`, displayName: { text: 'Lancheria com Menu' }, nationalPhoneNumber: '11 99999-2222', city: 'Horizontina', state: 'RS', segment: 'lanchonete', recentPostAt: '2026-10-10T12:00:00Z', websiteUri: 'https://exemplo.test/cardapio', photos: [{ name: 'photo-c', bytes: photo }, { name: 'photo-d', bytes: photo }] }
  ];
  const scheduled = [];

  const result = await runDailyOutreach({ now, maxContacts: 15, dependencies: {
    getState: async () => ({ paused: false, quotaAvailable: true, webhookHealthy: true }),
    findExistingRun: async () => null,
    startRun: async () => (await client.query(`insert into sales_discovery_runs(run_key,scheduled_for,status,started_at) values($1,$2,'running',now()) returning *`, [runKey, '2026-10-13'])).rows[0],
    discoverCandidates: async ({ runId }) => {
      await insertEvent({ event_type: 'run_started', run_id: runId, result: 'success' });
      return candidates;
    },
    qualifyCandidate: async (candidate, context) => {
      const qualification = await qualifyOutreachCandidate(candidate, {
        now: context.now,
        hasPriorContact: async () => false,
        isSuppressed: async () => false,
        checkWhatsApp: async () => true,
        searchMenu: async () => [],
        validatePhoto: async () => ({ usable: true, kind: 'food' })
      });
      const patch = qualification.leadPatch;
      const phone = patch.normalized_phone || candidate.nationalPhoneNumber.replace(/\D/g, '');
      const lead = (await client.query(`insert into sales_leads(business_name,phone,normalized_phone,city,state,segment,source,stage,google_place_id,last_validated_at,discard_code,discard_details,metadata) values($1,$2,$3,$4,$5,$6,'google_outreach',$7,$8,$9,$10,$11::jsonb,jsonb_build_object('outreach_run_id',$12::text)) returning *`, [candidate.displayName.text, phone, phone, candidate.city, candidate.state, candidate.segment, qualification.stage, candidate.id, now, qualification.code, JSON.stringify(qualification.evidence), context.runId])).rows[0];
      await insertEvent({ event_type: 'lead_discovered', run_id: context.runId, lead_id: lead.id, place_id: candidate.id, stage: 'discovered', result: 'success' });
      if (!qualification.qualified) {
        await insertEvent({ event_type: 'lead_discarded', run_id: context.runId, lead_id: lead.id, place_id: candidate.id, stage: 'discarded', result: 'success', details: { code: qualification.code } });
        return qualification;
      }
      await insertEvent({ event_type: 'lead_photos_ready', run_id: context.runId, lead_id: lead.id, place_id: candidate.id, stage: 'photos_ready', result: 'success' });
      return { ...qualification, lead };
    },
    buildPreview: async ({ lead, photos, runId }) => {
      const preview = await buildOutreachPreview({
        lead, photos, outputDir: path.join(temporary, lead.id),
        capture: async ({ outputPath }) => sharp({ create: { width: 1080, height: 1350, channels: 3, background: '#ffffff' } }).png().toFile(outputPath)
      });
      await insertEvent({ event_type: 'lead_preview_ready', run_id: runId, lead_id: lead.id, place_id: lead.google_place_id, stage: 'preview_ready', result: 'success' });
      return preview;
    },
    scheduleContact: async (item) => { scheduled.push(item); },
    completeRun: async ({ run, status, candidates: found, qualified, discarded }) => { await client.query(`update sales_discovery_runs set status=$2,candidates_found=$3,qualified_count=$4,discarded_count=$5,preview_count=$4,completed_at=now() where id=$1`, [run.id, status, found, qualified, discarded]); },
    recordEvent: insertEvent
  }});

  assert.equal(result.candidates, 2);
  assert.equal(result.qualified, 1);
  assert.equal(result.discarded, 1);
  assert.equal(scheduled.length, 1);

  const { lead, preview, runId } = scheduled[0];
  const conversation = (await client.query(`insert into sales_conversations(lead_id) values($1) returning *`, [lead.id])).rows[0];
  const progress = {};
  let providerCounter = 0;
  const delivery = await sendOutreachSequence({ lead, message: buildOutreachMessage(lead), previews: preview, now, dependencies: {
    getConnection: async () => ({ connected: true }),
    getWebhookHealth: async () => ({ lastReceivedAt: now.toISOString() }),
    isSuppressed: async () => false,
    loadProgress: async () => progress,
    saveStep: async (step, data) => { progress[step] = data; },
    readFile: async () => photo,
    sendText: async ({ text }) => saveSent(text, 'outreach_text'),
    sendMedia: async ({ caption, fileName }) => saveSent(caption, fileName.includes('mobile') ? 'outreach_mobile' : 'outreach_desktop'),
    recordEvent: insertEvent,
    recordFailure: async () => ({ consecutiveFailures: 1 })
  }});
  assert.equal(delivery.contactCount, 1);

  await client.query(`insert into sales_messages(lead_id,conversation_id,provider_message_id,direction,body,intent,confidence,status,requires_approval,received_at) values($1,$2,$3,'inbound','Tenho interesse','interested',0.95,'received',false,$4)`, [lead.id, conversation.id, `${runKey}-inbound`, new Date(now.getTime() + 60_000)]);
  await insertEvent({ event_type: 'inbound_received', run_id: runId, lead_id: lead.id, place_id: lead.google_place_id, result: 'success' });
  await insertEvent({ event_type: 'interest_detected', run_id: runId, lead_id: lead.id, place_id: lead.google_place_id, result: 'success' });

  const metrics = buildOutreachMetrics({
    leads: (await client.query(`select * from sales_leads where metadata->>'outreach_run_id'=$1`, [runId])).rows,
    messages: (await client.query(`select * from sales_messages where lead_id=$1`, [lead.id])).rows,
    events: (await client.query(`select * from sales_automation_events where run_id=$1`, [runId])).rows,
    runs: (await client.query(`select * from sales_discovery_runs where id=$1`, [runId])).rows,
    period: { since: new Date('2026-10-13T00:00:00Z'), until: new Date('2026-10-14T00:00:00Z') }
  });
  assert.deepEqual({
    found: metrics.summary.found,
    qualified: metrics.summary.qualified,
    discarded: metrics.summary.discarded,
    previews: metrics.summary.previews_ready,
    sent: metrics.summary.contacts_sent,
    replies: metrics.summary.respondents,
    interested: metrics.summary.interested
  }, { found: 2, qualified: 1, discarded: 1, previews: 1, sent: 1, replies: 1, interested: 1 });

  console.log('Outreach end-to-end smoke: OK');

  async function saveSent(body, kind) {
    const id = `${runKey}-sent-${++providerCounter}`;
    await client.query(`insert into sales_messages(lead_id,conversation_id,provider_message_id,direction,body,status,requires_approval,sent_at,metadata) values($1,$2,$3,'outbound',$4,'sent',false,$5,jsonb_build_object('kind',$6::text))`, [lead.id, conversation.id, id, body, now, kind]);
    return { id };
  }

  async function insertEvent(input) {
    await client.query(`insert into sales_automation_events(lead_id,run_id,place_id,event_type,stage,attempt,result,details,created_at) values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`, [input.lead_id || null, input.run_id, input.place_id || null, input.event_type, input.stage || null, input.attempt || 0, input.result || 'success', JSON.stringify(input.details || {}), now]);
  }
} finally {
  await client.query('rollback').catch(() => {});
  client.release();
  await pool.end();
  if (temporary.startsWith(os.tmpdir()) && path.basename(temporary).startsWith('tapronto-outreach-e2e-')) await rm(temporary, { recursive: true, force: true });
}
