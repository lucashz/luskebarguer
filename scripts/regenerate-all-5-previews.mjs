import path from 'node:path';
import pg from 'pg';
import { buildOutreachPreview } from '../src/lib/outreach-preview.js';

const pool = new pg.Pool({
  connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
});

const targetLeads = [
  { id: '4f54fa98-ab89-4c43-818b-cef4fdc814a3', slug: 'cervejaria-enigma-enigma-british' },
  { id: 'a3897392-9e43-4bd0-9440-1fdeae55c881', slug: 'via-daros-padaria-e-confeitaria' },
  { id: 'e8b421c2-f61b-4903-b889-562171643a12', slug: 'cantina-roman' },
  { id: 'edb7c40b-e6d3-4a97-b73c-a953e41a1db7', slug: 'open-house-beer' },
  { id: 'ee482c4f-4e26-489f-82a6-4930221649a8', slug: 'bar-route-66' }
];

const runId = 'c12390a3-73df-4c0c-971a-738547ecda14';
const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

console.log('Iniciando regeneração das prévias visuais das 5 lojas com fotos 100% preenchidas...');

for (const [idx, item] of targetLeads.entries()) {
  const leadRes = await pool.query('SELECT * FROM sales_leads WHERE id = $1', [item.id]);
  const lead = leadRes.rows[0];
  if (!lead) {
    console.error(`Lead ${item.id} não encontrado!`);
    continue;
  }

  const outputDir = path.resolve(`artifacts/outreach/automated/${runId}/${item.slug}-${lead.id.slice(0, 8)}`);
  console.log(`\n[${idx + 1}/5] Regenerando para: ${lead.business_name} (${item.slug})...`);

  const preview = await buildOutreachPreview({
    lead,
    photos: [],
    outputDir,
    chromePath
  });

  console.log(`  ✓ Desktop: ${preview.desktopPath}`);
  console.log(`  ✓ Mobile:  ${preview.mobilePath}`);
}

await pool.end();
console.log('\nTodas as 5 prévias foram regeneradas com sucesso!');

