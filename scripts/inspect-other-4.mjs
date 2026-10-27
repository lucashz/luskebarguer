import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';
const pool = getLocalPool();

async function main() {
  const otherIds = [
    '8785fbab-1ee7-4e6c-bf95-d017b2e3e5bc', // Marmitaria Menu
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
  `, [otherIds]);

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

