import pg from 'pg';
import { randomUUID } from 'node:crypto';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 2
});

const STORE_SLUG = 'stopbeer';
const STORE_NAME = 'Stop Beer Delivery e Conveniência';
const PHONE = '5555996187833';
const ADDRESS = 'Av. dos Imigrantes, 633 – Centro, Horizontina - RS';

const categories = [
  {
    name: 'Cervejas e Chopp',
    description: 'Bebidas geladas prontas para consumo ou entrega rápida.',
    items: [
      { name: 'Heineken Long Neck 330ml', description: 'Cerveja puro malte gelada.', price: 10.0, tags: ['Mais Vendida', 'Gelada'] },
      { name: 'Corona Extra 330ml', description: 'Com rodela de limão para acompanhar.', price: 11.0, tags: ['Importada', 'Gelada'] },
      { name: 'Stella Artois Long Neck 330ml', description: 'Cerveja belga puro malte crocante e refrescante.', price: 9.5, tags: ['Puro Malte'] },
      { name: 'Brahma Duplo Malte Latão 473ml', description: 'Duplo malte cremosa e encorpada.', price: 7.5, tags: ['Latão'] },
      { name: 'Amstel Lager Latão 473ml', description: 'Puro malte europeia gelada.', price: 7.0, tags: ['Latão'] }
    ]
  },
  {
    name: 'Combos e Baldes',
    description: 'Combinações no gelo ideais para reunir os amigos.',
    items: [
      { name: 'Balde com 6 Heineken Long Neck', description: '6 long necks trincando de geladas com balde de gelo.', price: 55.0, tags: ['Combo', 'Destaque'] },
      { name: 'Combo Gin Tropical', description: '1 Garrafa de Gin + 4 Red Bull Tropical + especiarias.', price: 129.0, tags: ['Combo Especial'] },
      { name: 'Combo Vodka + Energético', description: '1 Garrafa Smirnoff + 4 Energéticos Baly 2L.', price: 79.0, tags: ['Favorito'] }
    ]
  },
  {
    name: 'Destilados e Quentes',
    description: 'Whiskies, vodkas, gins e cachaças.',
    items: [
      { name: 'Whisky Johnnie Walker Red Label 1L', description: 'Scotch whisky escocês tradicional.', price: 99.0, tags: ['Whisky'] },
      { name: 'Gin Tanqueray London Dry 750ml', description: 'Gin clássico destilado com zimbro e botânicos.', price: 119.0, tags: ['Premium'] },
      { name: 'Vodka Smirnoff 998ml', description: 'Vodka pura triplamente filtrada.', price: 48.0, tags: ['Vodka'] }
    ]
  },
  {
    name: 'Não Alcoólicos e Gelo',
    description: 'Refrigerantes, energéticos, água e gelo para acompanhar.',
    items: [
      { name: 'Energético Red Bull 250ml', description: 'Original gelado.', price: 11.0, tags: ['Energético'] },
      { name: 'Coca-Cola Original 2L', description: 'Refrigerante gelado para a família.', price: 12.0, tags: ['Refrigerante'] },
      { name: 'Coca-Cola Lata 350ml', description: 'Original gelada.', price: 5.5, tags: ['Lata'] },
      { name: 'Água Mineral sem Gás 500ml', description: 'Água mineral natural gelada.', price: 3.5, tags: ['Água'] },
      { name: 'Saco de Gelo em Cubos 5kg', description: 'Gelo filtrado de alta qualidade.', price: 15.0, tags: ['Gelo'] }
    ]
  },
  {
    name: 'Petiscos e Conveniência',
    description: 'Aperitivos, snacks e artigos de conveniência.',
    items: [
      { name: 'Amendoim Salgado Crocante 150g', description: 'Aperitivo perfeito para cerveja.', price: 8.0, tags: ['Snack'] },
      { name: 'Batata Pringles Original 114g', description: 'Batata crocante importada.', price: 16.0, tags: ['Importado'] },
      { name: 'Copo Descartável 400ml (Pacote com 50)', description: 'Copos reforçados para chopp e drinks.', price: 12.0, tags: ['Conveniência'] }
    ]
  }
];

const alwaysOpenHours = Object.fromEntries(
  ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    .map((day) => [day, { open: '17:00', close: '23:59', closed: false }])
);

const themeSettings = {
  primaryColor: '#D97706',
  secondaryColor: '#1F2937',
  backgroundColor: '#FFFBEB',
  buttonColor: '#D97706',
  buttonTextColor: '#FFFFFF',
  selectionColor: '#FEF3C7',
  selectionTextColor: '#92400E'
};

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let company = (await client.query("SELECT * FROM companies WHERE name='Stop Beer' LIMIT 1")).rows[0];
    if (!company) {
      const companyRes = await client.query(
        "INSERT INTO companies (name, status, created_at, updated_at) VALUES ($1, 'active', now(), now()) RETURNING *",
        ['Stop Beer']
      );
      company = companyRes.rows[0];
    }

    let store = (await client.query("SELECT * FROM stores WHERE slug=$1 LIMIT 1", [STORE_SLUG])).rows[0];
    if (store) {
      await client.query(
        "UPDATE stores SET name=$1, description=$2, is_active=true, updated_at=now() WHERE id=$3",
        [STORE_NAME, 'Cervejas geladas, destilados, combos, refrigerantes e conveniência em Horizontina.', store.id]
      );
    } else {
      const storeRes = await client.query(
        "INSERT INTO stores (company_id, name, slug, description, public_url, is_active, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, true, now(), now()) RETURNING *",
        [company.id, STORE_NAME, STORE_SLUG, 'Cervejas geladas, destilados, combos, refrigerantes e conveniência em Horizontina.', `/${STORE_SLUG}`]
      );
      store = storeRes.rows[0];
    }

    await client.query("DELETE FROM menu_items WHERE store_id=$1", [store.id]);
    await client.query("DELETE FROM menu_categories WHERE store_id=$1", [store.id]);

    const setting = (await client.query("SELECT * FROM store_settings WHERE store_id=$1", [store.id])).rows[0];
    const settingData = [
      store.id,
      STORE_NAME,
      STORE_SLUG,
      'Cervejas geladas, destilados, combos e conveniência em Horizontina.',
      PHONE,
      ADDRESS,
      true, // is_open
      true, // accepts_delivery
      true, // accepts_pickup
      '5.00', // delivery_fee
      '20.00', // minimum_order
      ['Pix', 'Cartão na entrega', 'Dinheiro'],
      JSON.stringify(alwaysOpenHours),
      JSON.stringify(themeSettings),
      JSON.stringify({ preview: true, source: 'personalized_outreach' }),
      true // onboarding_completed
    ];

    if (setting) {
      await client.query(`
        UPDATE store_settings SET
          name=$2, slug=$3, description=$4, whatsapp_number=$5, address=$6,
          is_open=$7, accepts_delivery=$8, accepts_pickup=$9, delivery_fee=$10, minimum_order=$11,
          payment_methods=$12, business_hours=$13, theme_settings=$14, integration_settings=$15,
          onboarding_completed=$16, updated_at=now()
        WHERE id='${setting.id}'
      `, settingData);
    } else {
      await client.query(`
        INSERT INTO store_settings (
          store_id, name, slug, description, whatsapp_number, address,
          is_open, accepts_delivery, accepts_pickup, delivery_fee, minimum_order,
          payment_methods, business_hours, theme_settings, integration_settings,
          onboarding_completed, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,now(),now())
      `, settingData);
    }

    let totalItems = 0;
    for (const [catIdx, cat] of categories.entries()) {
      const catRes = await client.query(`
        INSERT INTO menu_categories (store_id, name, description, sort_order, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, true, now(), now()) RETURNING id
      `, [store.id, cat.name, cat.description, (catIdx + 1) * 10]);
      const categoryId = catRes.rows[0].id;

      for (const [itemIdx, item] of cat.items.entries()) {
        await client.query(`
          INSERT INTO menu_items (
            store_id, category_id, name, description, price, tags,
            is_featured, is_available, sort_order, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, now(), now())
        `, [
          store.id, categoryId, item.name, item.description, item.price,
          item.tags || [], Boolean(item.tags?.includes('Mais Vendida') || item.tags?.includes('Destaque')),
          (itemIdx + 1) * 10
        ]);
        totalItems += 1;
      }
    }

    await client.query('COMMIT');
    console.log(JSON.stringify({
      ok: true,
      store_id: store.id,
      name: STORE_NAME,
      slug: STORE_SLUG,
      public_url: `https://taprontomenu.com.br/${STORE_SLUG}`,
      categories: categories.length,
      items: totalItems
    }, null, 2));
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('ERRO:', err);
  process.exit(1);
});
