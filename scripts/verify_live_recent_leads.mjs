import pg from 'pg';
import { buildOutreachMetrics } from '../src/lib/outreach-metrics.js';

try { process.loadEnvFile?.('.env'); } catch {}

const dbUrl = process.env.DATABASE_URL || 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public';
const pool = new pg.Pool({ connectionString: dbUrl });

async function main() {
  const leads = (await pool.query("SELECT * FROM sales_leads WHERE source = 'google_outreach'")).rows;
  const messages = (await pool.query("SELECT * FROM sales_messages")).rows;
  const events = (await pool.query("SELECT * FROM sales_automation_events")).rows;

  const metrics = buildOutreachMetrics({
    leads,
    messages,
    events,
    runs: [],
    quotas: [],
    suppressions: [],
    companies: [],
    period: { since: new Date(Date.now() - 30 * 86400000) }
  });

  console.log(`Top 15 leads from buildOutreachMetrics.recent_leads:`);
  console.table(metrics.recent_leads.slice(0, 15).map(l => ({
    Nome: l.business_name.slice(0, 22),
    Cidade: l.city,
    Etapa: l.stage_badge,
    Tipo: l.stage_type,
    Cardápio: l.menu_url ? 'Sim' : '—',
    Cliques: l.link_clicks
  })));

  await pool.end();
}

main().catch(console.error);

