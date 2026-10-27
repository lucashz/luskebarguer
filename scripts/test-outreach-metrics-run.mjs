import pg from 'pg';
import { buildOutreachMetrics } from '../src/lib/outreach-metrics.js';

const pool = new pg.Pool({
  connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@127.0.0.1:5433/cardapio?schema=public'
});

try {
  const leads = (await pool.query('SELECT * FROM sales_leads ORDER BY updated_at DESC LIMIT 5000')).rows;
  const messages = (await pool.query('SELECT * FROM sales_messages ORDER BY created_at ASC LIMIT 20000')).rows;
  const events = (await pool.query('SELECT * FROM sales_automation_events ORDER BY created_at ASC LIMIT 10000')).rows;
  const runs = (await pool.query('SELECT * FROM sales_discovery_runs ORDER BY created_at DESC LIMIT 100')).rows;
  const quotas = (await pool.query('SELECT * FROM sales_quota_usage LIMIT 20')).rows;
  const suppressions = (await pool.query('SELECT * FROM sales_suppressions LIMIT 5000')).rows;
  const companies = (await pool.query('SELECT * FROM companies LIMIT 2000')).rows;

  console.log(`Loaded ${leads.length} leads, ${messages.length} messages, ${events.length} events.`);

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

  console.log('buildOutreachMetrics succeeded!');
  console.log('Recent leads count:', metrics.recent_leads?.length);
  console.log('Sample recent lead:', metrics.recent_leads?.[0]);
} catch (err) {
  console.error('buildOutreachMetrics ERROR:', err);
} finally {
  await pool.end();
}
