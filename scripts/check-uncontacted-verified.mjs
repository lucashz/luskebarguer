import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';
const pool = getLocalPool();

async function main() {
  const localExcludedCities = [
    'Horizontina', 'Três de Maio', 'Santa Rosa', 'Tucunduva', 
    'Crissiumal', 'Santo Ângelo', 'Ijuí', 'Doutor Maurício Cardoso'
  ];

  // Verified WhatsApp leads from our previous test:
  const verifiedPhones = [
    '5514981616922', // Inverno D'Italia
    '5549988233302', // Open House Beer
    '5549988399698', // Bar Route 66
    '5549999068021', // Cervejaria Enigma
    '5549998409741', // Açai V Mix
    '5549999255447', // The Best Açaí Maravilha
    '5549988352778', // Açaí Ten
    '5549999033257', // Eskimó Maravilha SC
    '5554999093935', // Bar 52 by Alvaro Cyrino
    '5554999474850', // Baraios Bar
    '5554999334238', // Avenida Café
    '5554999869465', // D'Angelo Café e Restaurante
    '555433582715',  // Cantina Roman
    '555433581112',  // Via Daros Padaria
    '554836582126',  // Panificadora Kuerten
    '554836582391',  // Cabana Grill
    '554334724413',  // Restaurante Chotti
    '5548996875080'  // Marmitaria Menu
  ];

  const res = await pool.query(`
    SELECT l.id, l.business_name, l.phone, l.city, l.state, l.stage,
           (SELECT count(*) FROM sales_messages m WHERE m.lead_id = l.id) as msg_count,
           (SELECT count(*) FROM sales_automation_jobs j WHERE j.lead_id = l.id AND j.status = 'completed') as completed_jobs,
           l.metadata->>'menu_slug' as slug,
           EXISTS(SELECT 1 FROM stores s WHERE s.slug = l.metadata->>'menu_slug') as store_exists
    FROM sales_leads l
    WHERE l.phone = ANY($1::text[])
      AND l.city NOT IN (${localExcludedCities.map((_, i) => `$${i + 2}`).join(', ')})
    ORDER BY (SELECT count(*) FROM sales_messages m WHERE m.lead_id = l.id) ASC, l.business_name ASC
  `, [verifiedPhones, ...localExcludedCities]);

  console.log(`Leads verificados no WhatsApp e histórico de contato:`);
  console.table(res.rows.map(r => ({
    name: r.business_name,
    city: `${r.city}/${r.state}`,
    phone: r.phone,
    msg_count: Number(r.msg_count),
    completed_jobs: Number(r.completed_jobs),
    slug: r.slug || 'NENHUM',
    store_exists: r.store_exists,
    uncontacted: Number(r.msg_count) === 0 && Number(r.completed_jobs) === 0
  })));

  const uncontacted = res.rows.filter(r => Number(r.msg_count) === 0 && Number(r.completed_jobs) === 0);
  console.log(`\nTOTAL DE LEADS 100% INÉDITOS (0 MENSAGENS, 0 JOBS COMPLETOS): ${uncontacted.length}`);
  console.table(uncontacted.map(u => ({
    name: u.business_name,
    city: `${u.city}/${u.state}`,
    phone: u.phone,
    slug: u.slug || 'PRECISA PROVISIONAR',
    store_exists: u.store_exists
  })));

  await pool.end();
}

main().catch(console.error);

