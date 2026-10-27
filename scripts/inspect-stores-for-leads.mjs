import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';
const pool = getLocalPool();

async function main() {
  const ids = [
    '801c4f07-89bc-41df-926b-e623ba5b3697', // Inverno D'Italia
    'edb7c40b-e6d3-4a97-b73c-a953e41a1db7', // Open House Beer
    'ee482c4f-4e26-489f-82a6-4930221649a8', // Bar Route 66
    '4f54fa98-ab89-4c43-818b-cef4fdc814a3', // Cervejaria Enigma
    'dbf6a718-4c4e-4b8d-9d25-4de7d2af6a69', // Açai V Mix
    '73fad018-0f44-40d4-9d98-f2811fbed51e', // The Best Açaí Maravilha
    '5d9394de-647d-4daa-9873-8399168869fd', // Açaí Ten
    '4dae8f8b-79e8-4330-a437-1555c0004d6d', // Eskimó Maravilha SC
    'fffcf804-1c26-46d3-b5b9-760e8a102d46', // Bar 52 by Alvaro Cyrino
    'a7b5f672-400d-4464-becc-286f231ff752', // Baraios Bar
    'ed5b92a1-fcd4-4b46-9615-5a70ad588d5e', // Avenida Café
    'fa8f2f77-742a-44e0-aec1-e586c82cb8d4', // D'Angelo Café e Restaurante
    '8785fbab-1ee7-4e6c-bf95-d017b2e3e5bc', // Marmitaria Menu
    'e8b421c2-f61b-4903-b889-562171643a12', // Cantina Roman
    'a3897392-9e43-4bd0-9440-1fdeae55c881', // Via Daros Padaria
    'eb7b68c9-0a86-4fdf-9730-a5fb989396eb', // Panificadora Kuerten
    '86544373-12ce-4e12-b2d9-e3d1bc84260d', // Cabana Grill Restaurante
    '5fccd1e8-d1cf-4188-b2e1-456cb016d9b4'  // Restaurante Chotti
  ];

  const res = await pool.query(`
    SELECT l.id, l.business_name, l.city, l.phone, l.metadata->>'menu_slug' as slug,
           s.id as store_exists, l.preview_desktop_path, l.preview_mobile_path
    FROM sales_leads l
    LEFT JOIN stores s ON s.slug = (l.metadata->>'menu_slug')
    WHERE l.id = ANY($1::uuid[])
    ORDER BY (s.id IS NOT NULL) DESC, l.business_name ASC
  `, [ids]);

  console.table(res.rows.map(r => ({
    name: r.business_name,
    city: r.city,
    phone: r.phone,
    slug: r.slug || 'NENHUM',
    loja_no_banco: Boolean(r.store_exists),
    tem_previa_desktop: Boolean(r.preview_desktop_path),
    tem_previa_mobile: Boolean(r.preview_mobile_path)
  })));

  await pool.end();
}

main().catch(console.error);

