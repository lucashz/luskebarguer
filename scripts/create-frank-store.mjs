import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 2
});

const STORE_SLUG = 'frank';
const STORE_NAME = 'Panificadora Frank';
const PHONE = '5555996872259';
const ADDRESS = 'Rua Buricá, 564 – Centro, Horizontina - RS';

const categories = [
  {
    name: 'Pães Artesanais e Fornada',
    description: 'Receitas tradicionais de família, fermentação natural e casca crocante.',
    items: [
      { name: 'Pão Francês Crocante', description: 'O clássico pão d’água com casca bem estaladiça e miolo leve.', price: 1.0, slug: 'frank-pao-frances', tags: ['Mais Vendido', 'Fornada'] },
      { name: 'Pão de Centeio Colonial', description: 'Pão rústico escuro de centeio, tradicional da colonização alemã.', price: 13.0, slug: 'frank-pao-centeio', tags: ['Colonial'] },
      { name: 'Pão Sovado Especial', description: 'Pão sovado fofo, levemente adocicado e perfeito para o café.', price: 12.0, slug: 'frank-pao-sovado', tags: ['Tradicional'] },
      { name: 'Pão de Forma Multigrãos', description: 'Fatiado com sementes de girassol, linhaça e gergelim.', price: 14.5, slug: 'frank-pao-multigraos', tags: ['Integral'] }
    ]
  },
  {
    name: 'Cucas Coloniais e Confeitaria Alemã',
    description: 'Cucas artesanais com massa fofa amanteigada e farofas especiais.',
    items: [
      { name: 'Cuca de Ricota Doce (Käsekuchen)', description: 'Receita típica colonial alemã de ricota temperada e farofa crocante.', price: 22.0, slug: 'frank-cuca-ricota', tags: ['Tradição Alemã', 'Destaque'] },
      { name: 'Cuca de Canela e Açúcar', description: 'Massa macia com cobertura tradicional abundante de canela e açúcar.', price: 18.0, slug: 'frank-cuca-canela', tags: ['Clássica'] },
      { name: 'Cuca de Frutas Vermelhas', description: 'Recheio de amoras, morangos e mirtilos com farofa doce.', price: 24.0, slug: 'frank-cuca-frutas-vermelhas', tags: ['Especial'] }
    ]
  },
  {
    name: 'Tortas e Doces Finos',
    description: 'Tortas decoradas sob encomenda e fatias individuais.',
    items: [
      { name: 'Torta Marta Rocha Clássica', description: 'Pão de ló branco e chocolate, suspiro crocante, nata e fios de ovos.', price: 18.0, slug: 'frank-torta-marta-rocha', tags: ['Mais Pedida', 'Confeitaria'] },
      { name: 'Tortinha de Limão com Merengue', description: 'Massa sablée crocante, creme de limão siciliano e merengue tostado.', price: 11.0, slug: 'frank-tortinha-limao', tags: ['Individual'] },
      { name: 'Torta de Morango com Ninho', description: 'Fatia recheada com morangos frescos e mousse de Leite Ninho.', price: 16.0, slug: 'frank-torta-morango-ninho', tags: ['Destaque'] }
    ]
  },
  {
    name: 'Salgados e Lanches de Forno',
    description: 'Lanches quentinhos e opções para encomendas de festa.',
    items: [
      { name: 'Pastelão de Forno de Frango', description: 'Recheio farto de frango desfiado com tempero verde e catupiry.', price: 8.5, slug: 'frank-pastelao-frango', tags: ['Assado', 'Favorito'] },
      { name: 'Folhado de Frango com Catupiry', description: 'Massa folhada francesa crocante e muito recheio cremoso.', price: 9.0, slug: 'frank-folhado-frango', tags: ['Folhado'] },
      { name: 'Quiche de Alho Poró com Queijo', description: 'Torta salgada individual com recheio cremoso de alho poró dourado.', price: 9.5, slug: 'frank-quiche-alho-poro', tags: ['Especial'] },
      { name: 'Cento de Salgados para Festas', description: '100 mini salgadinhos fritos na hora (coxinhas, risoles e bolinhas de queijo).', price: 95.0, slug: 'frank-cento-salgados', tags: ['Encomenda', 'Festa'] }
    ]
  },
  {
    name: 'Bebidas e Cafés',
    description: 'Cafés moídos na hora e bebidas selecionadas.',
    items: [
      { name: 'Café Filtrado Gourmet', description: 'Café coado na hora com grãos 100% arábica de torra média.', price: 5.5, slug: 'frank-cafe-filtrado', tags: ['Café'] },
      { name: 'Chocolate Quente Cremoso', description: 'Chocolate europeu cremoso e espesso servido bem quentinho.', price: 10.0, slug: 'frank-chocolate-quente', tags: ['Cremoso'] },
      { name: 'Suco de Uva Integral 300ml', description: 'Suco puro de uva tinta da serra gaúcha, sem adição de açúcar.', price: 8.5, slug: 'frank-suco-uva', tags: ['Integral'] }
    ]
  }
];

const businessHours = Object.fromEntries(
  ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    .map((day) => [day, { open: '07:30', close: '19:30', closed: false }])
    .concat([['sunday', { open: '08:00', close: '12:00', closed: false }]])
);

const themeSettings = {
  primaryColor: '#9A3412', // Warm rustic reddish brown
  secondaryColor: '#431407',
  backgroundColor: '#FFF7ED', // Soft warm peach/orange tint
  buttonColor: '#9A3412',
  buttonTextColor: '#FFFFFF',
  selectionColor: '#FFEDD5',
  selectionTextColor: '#7C2D12'
};

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let company = (await client.query("SELECT * FROM companies WHERE name='Panificadora Frank' LIMIT 1")).rows[0];
    if (!company) {
      const companyRes = await client.query(
        "INSERT INTO companies (name, status, created_at, updated_at) VALUES ($1, 'active', now(), now()) RETURNING *",
        ['Panificadora Frank']
      );
      company = companyRes.rows[0];
    }

    let store = (await client.query("SELECT * FROM stores WHERE slug=$1 LIMIT 1", [STORE_SLUG])).rows[0];
    if (store) {
      await client.query(
        "UPDATE stores SET name=$1, description=$2, is_active=true, updated_at=now() WHERE id=$3",
        [STORE_NAME, 'Pães de fermentação natural, cucas coloniais típicas, tortas finas, cento de salgados e café colonial em Horizontina.', store.id]
      );
    } else {
      const storeRes = await client.query(
        "INSERT INTO stores (company_id, name, slug, description, public_url, is_active, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, true, now(), now()) RETURNING *",
        [company.id, STORE_NAME, STORE_SLUG, 'Pães de fermentação natural, cucas coloniais típicas, tortas finas, cento de salgados e café colonial em Horizontina.', `/${STORE_SLUG}`]
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
      'Pães de fermentação natural, cucas coloniais típicas, tortas finas, cento de salgados e café colonial em Horizontina.',
      PHONE,
      ADDRESS,
      true, // is_open
      true, // accepts_delivery
      true, // accepts_pickup
      '4.50', // delivery_fee
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

    // Atualiza sales_leads para Panificadora Frank
    await client.query(`
      UPDATE sales_leads
      SET stage='photos_ready', discard_code=null, discard_details='{}'::jsonb,
          metadata=metadata || jsonb_build_object('menu_url', 'https://taprontomenu.com.br/frank', 'store_id', $2::text),
          updated_at=now()
      WHERE phone=$1 or id='10b95c34-06bd-4c2c-83e6-db07dd0fe86d'
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

