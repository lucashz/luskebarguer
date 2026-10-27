import path from 'node:path';
import pg from 'pg';
import { buildOutreachPreview } from '../src/lib/outreach-preview.js';

const pool = new pg.Pool({
  connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
});

const leadId = '4f54fa98-ab89-4c43-818b-cef4fdc814a3'; // Cervejaria Enigma

const leadRes = await pool.query('SELECT * FROM sales_leads WHERE id = $1', [leadId]);
const lead = leadRes.rows[0];

const runId = 'c12390a3-73df-4c0c-971a-738547ecda14';
const slug = lead.metadata?.menu_slug || 'cervejaria-enigma-enigma-british';
const outputDir = path.resolve(`artifacts/outreach/automated/${runId}/${slug}-${lead.id.slice(0, 8)}`);

console.log('Regenerating preview for:', lead.business_name);
console.log('OutputDir:', outputDir);
console.log('Menu URL:', lead.metadata?.menu_url);

const res = await buildOutreachPreview({
  lead,
  photos: [],
  outputDir,
  chromePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'
});

console.log('RESULT:', res);
await pool.end();

