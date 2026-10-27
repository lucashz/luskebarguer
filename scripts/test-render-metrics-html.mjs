import fs from 'node:fs';
import vm from 'node:vm';
import pg from 'pg';
import { buildOutreachMetrics } from '../src/lib/outreach-metrics.js';

const pool = new pg.Pool({
  connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@127.0.0.1:5433/cardapio?schema=public'
});

const leads = (await pool.query('SELECT * FROM sales_leads ORDER BY updated_at DESC LIMIT 5000')).rows;
const messages = (await pool.query('SELECT * FROM sales_messages ORDER BY created_at ASC LIMIT 20000')).rows;
const events = (await pool.query('SELECT * FROM sales_automation_events ORDER BY created_at ASC LIMIT 10000')).rows;
const runs = (await pool.query('SELECT * FROM sales_discovery_runs ORDER BY created_at DESC LIMIT 100')).rows;
const quotas = (await pool.query('SELECT * FROM sales_quota_usage LIMIT 20')).rows;
const suppressions = (await pool.query('SELECT * FROM sales_suppressions LIMIT 5000')).rows;
const companies = (await pool.query('SELECT * FROM companies LIMIT 2000')).rows;

const metrics = buildOutreachMetrics({
  leads,
  messages,
  events,
  runs,
  quotas,
  suppressions,
  companies,
  period: { label: '30d', since: new Date(Date.now() - 30 * 86400000) }
});

const code = fs.readFileSync('public/platform-outreach.js', 'utf8');
const sandbox = { globalThis: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

console.log('OutreachDashboard keys:', Object.keys(sandbox.globalThis.OutreachDashboard || {}));

try {
  const html = sandbox.globalThis.OutreachDashboard.renderOutreachMetricsHtml(metrics);
  console.log('renderOutreachMetricsHtml succeeded! Length:', html.length);
} catch (err) {
  console.error('renderOutreachMetricsHtml FAILED:', err);
}

await pool.end();

