import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 2
});

const STORE_SLUG = 'altissimo';
const STORE_NAME = 'Padaria Alt\u00EDssimo';
const PHONE = '5555991318127';
const ADDRESS = 'Rua Balduíno Schneider, 1482 – Horizontina - RS';

const categories = [
  {
    name: 'Pães Coloniais e Tradicionais',
    description: 'Fornadas quentinhas todos os dias com fermentação e carinho.',
    items: [
      { name: 'Pão Francês Tradicional', description: 'Crocante por fora, miolo macio e quentinho na hora.', price: 1.0, slug: 'altissimo-pao-frances', tags: ['Mais Vendido', 'Fornada'] },
      { name: 'Pão Caseiro Colonial', description: 'Receita tradicional da colônia, massa fofa e sabor caseiro.', price: 12.0, slug: 'altissimo-pao-caseiro', tags: ['Colonial'] },
      { name: 'Pão de Queijo Mineiro', description: 'Feito com queijo curado, assado na hora, crocante e puxa queijo.', price: 4.5, slug: 'altissimo-pao-de-queijo', tags: ['Quentinho'] },
      { name: 'Pão de Milho Artesanal', description: 'Pão de milho fofinho com crosta dourada e leve toque adocicado.', price: 14.0, slug: 'altissimo-pao-de-milho', tags: ['Artesanal'] }
    ]
  },
  {
    name: 'Cucas Coloniais Típicas',
    description: 'Receitas tradicionais alemãs com farofa crocante e recheio generoso.',
    items: [
      { name: 'Cuca de Requeijão Colonial', description: 'A favorita de Horizontina: requeijão cremoso e farofa amanteigada.', price: 22.0, slug: 'altissimo-cuca-requeijao', tags: ['Mais Pedida', 'Destaque'] },
      { name: 'Cuca de Uva Tradicional', description: 'Massa macia com uvas frescas e cobertura crocante.', price: 20.0, slug: 'altissimo-cuca-uva', tags: ['Tradição Alemã'] },
      { name: 'Cuca de Maçã com Canela', description: 'Recheio de maçãs caramelizadas com toque suave de canela.', price: 20.0, slug: 'altissimo-cuca-maca', tags: ['Especial'] },
      { name: 'Cuca de Goiabada', description: 'Goiabada cremosa em pedaços com farofa crocante.', price: 18.0, slug: 'altissimo-cuca-goiabada', tags: ['Clássica'] }
    ]
  },
  {
    name: 'Salgados e Lanches',
    description: 'Salgados assados e fritos para seu lanche ou café da tarde.',
    items: [
      { name: 'Pastel de Forno Frango com Catupiry', description: 'Massa leve e dourada com recheio cremoso e farto.', price: 8.0, slug: 'altissimo-pastel-forno-frango', tags: ['Assado', 'Favorito'] },
      { name: 'Coxinha com Frango Desfiado', description: 'Coxinha tradicional com casquinha crocante e tempero da casa.', price: 7.5, slug: 'altissimo-coxinha-frango', tags: ['Salgado'] },
      { name: 'Enroladinho de Presunto e Queijo', description: 'Massa folhada douradinha recheada com queijo mussarela derretido e presunto.', price: 7.5, slug: 'altissimo-enroladinho-presunto-queijo', tags: ['Assado'] },
      { name: 'Empada de Palmito', description: 'Massa podre amanteigada que derrete na boca com palmito cremoso.', price: 8.0, slug: 'altissimo-empada-palmito', tags: ['Assado'] }
    ]
  },
  {
    name: 'Confeitaria e Doces',
    description: 'Tortas finas, bolos e sobremesas feitas com ingredientes selecionados.',
    items: [
      { name: 'Torta Alemã Clássica', description: 'Fatia generosa com camadas de biscoito, creme suave holandês e cobertura de chocolate puro.', price: 16.0, slug: 'altissimo-torta-alema', tags: ['Destaque', 'Confeitaria'] },
      { name: 'Bolo Nega Maluca com Brigadeiro', description: 'Fatia de bolo de chocolate bem molhadinho com calda cremosa de brigadeiro.', price: 12.0, slug: 'altissimo-bolo-nega-maluca', tags: ['Chocolate'] },
      { name: 'Rocambole de Doce de Leite', description: 'Massa de pão de ló leve enrolada com recheio farto de doce de leite caseiro.', price: 15.0, slug: 'altissimo-rocambole-doce-de-leite', tags: ['Doce Caseiro'] },
      { name: 'Sonho de Creme de Baunilha', description: 'Massa fofa e leve recheada com creme de confeiteiro e polvilhada com açúcar.', price: 6.0, slug: 'altissimo-sonho-creme', tags: ['Tradicional'] }
    ]
  },
  {
    name: 'Cafeteria e Bebidas',
    description: 'Cafés especiais, cappuccinos e bebidas para acompanhar.',
    items: [
      { name: 'Café Expresso Curto / Longo', description: 'Expresso encorpado preparado na hora com grãos nobres selecionados.', price: 6.0, slug: 'altissimo-cafe-expresso', tags: ['Café'] },
      { name: 'Cappuccino Cremoso com Canela', description: 'Café expresso, leite vaporizado, espuma aveludada e toque de canela.', price: 9.0, slug: 'altissimo-cappuccino', tags: ['Especialidade'] },
      { name: 'Suco de Laranja Natural 400ml', description: 'Extraído na hora da fruta fresca, sem conservantes, servido bem gelado.', price: 10.0, slug: 'altissimo-suco-laranja', tags: ['Natural'] }
    ]
  }
];

const businessHours = Object.fromEntries(
  ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    .map((day) => [day, { open: '08:00', close: '19:00', closed: false }])
    .concat([['sunday', { open: '08:30', close: '11:30', closed: false }]])
);

const themeSettings = {
  primaryColor: '#B45309', // Amber 700 - Warm bakery amber
  secondaryColor: '#78350F', // Warm brown
  backgroundColor: '#FFFBEB', // Light warm cream
  buttonColor: '#B45309',
  buttonTextColor: '#FFFFFF',
  selectionColor: '#FEF3C7',
  selectionTextColor: '#78350F'
};

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let company = (await client.query("SELECT * FROM companies WHERE name='Padaria Altíssimo' LIMIT 1")).rows[0];
    if (!company) {
      const companyRes = await client.query(
        "INSERT INTO companies (name, status, created_at, updated_at) VALUES ($1, 'active', now(), now()) RETURNING *",
        ['Padaria Altíssimo']
      );
      company = companyRes.rows[0];
    }

    let store = (await client.query("SELECT * FROM stores WHERE slug=$1 LIMIT 1", [STORE_SLUG])).rows[0];
    if (store) {
      await client.query(
        "UPDATE stores SET name=$1, description=$2, is_active=true, updated_at=now() WHERE id=$3",
        [STORE_NAME, 'Pães coloniais quentinhos, cucas tradicionais alemãs, salgados assados, tortas finas e cafeteria em Horizontina.', store.id]
      );
    } else {
      const storeRes = await client.query(
        "INSERT INTO stores (company_id, name, slug, description, public_url, is_active, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, true, now(), now()) RETURNING *",
        [company.id, STORE_NAME, STORE_SLUG, 'Pães coloniais quentinhos, cucas tradicionais alemãs, salgados assados, tortas finas e cafeteria em Horizontina.', `/${STORE_SLUG}`]
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
      'Pães coloniais quentinhos, cucas tradicionais alemãs, salgados assados, tortas finas e cafeteria em Horizontina.',
      PHONE,
      ADDRESS,
      true, // is_open
      true, // accepts_delivery
      true, // accepts_pickup
      '4.00', // delivery_fee
      '15.00', // minimum_order
      ['Pix', 'Cartão na entrega', 'Dinheiro'],
      JSON.stringify(businessHours),
      JSON.stringify(themeSettings),
      JSON.stringify({ preview: true, source: 'personalized_outreach' }),
      true // onboarding_completed
    ];

    if (setting) {
      await client.query(`
        UPDATE store_settings SET
          name=$1, slug=$2, description=$3, whatsapp_number=$4, address=$5,
          is_open=$6, accepts_delivery=$7, accepts_pickup=$8, delivery_fee=$9, minimum_order=$10,
          payment_methods=$11, business_hours=$12, theme_settings=$13, integration_settings=$14,
          onboarding_completed=$15, updated_at=now()
        WHERE id=$16
      `, [...settingData.slice(1), setting.id]);
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
        const imageUrl = `/uploads/products/${item.slug}.webp`;
        await client.query(`
          INSERT INTO menu_items (
            store_id, category_id, name, description, price, tags,
            image_url, is_featured, is_available, sort_order, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9, now(), now())
        `, [
          store.id, categoryId, item.name, item.description, item.price,
          item.tags || [], imageUrl,
          Boolean(item.tags?.includes('Mais Vendido') || item.tags?.includes('Mais Pedida') || item.tags?.includes('Destaque')),
          (itemIdx + 1) * 10
        ]);
        totalItems += 1;
      }
    }

    // Atualiza sales_leads para Padaria Altíssimo
    await client.query(`
      UPDATE sales_leads
      SET stage='photos_ready', discard_code=null, discard_details='{}'::jsonb,
          metadata=metadata || jsonb_build_object('menu_url', 'https://taprontomenu.com.br/altissimo', 'store_id', $2::text),
          updated_at=now()
      WHERE phone=$1 or id='f2dd2698-59f5-475f-b0d4-8741b8def417'
    `, [PHONE, store.id]);

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
