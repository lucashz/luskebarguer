import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';
import { generateStoreSlug } from '../src/lib/outreach-store-provisioning.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

const ALWAYS_OPEN_HOURS = Object.freeze(
  Object.fromEntries(
    ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
      .map((day) => [day, { open: '10:00', close: '23:00', closed: false }])
  )
);

const REFUGIO_THEME = {
  primaryColor: '#0F766E', // Elegante verde esmeralda / bistrô refinado
  secondaryColor: '#1E293B',
  backgroundColor: '#F8FAFC',
  buttonColor: '#0F766E',
  buttonTextColor: '#FFFFFF',
  selectionColor: '#CCFBF1',
  selectionTextColor: '#115E59'
};

const REFUGIO_MENU = {
  description: 'Almoço com buffet executivo, pizzas artesanais na brasa e o exclusivo espaço Refúgio do Café em Horizontina - RS.',
  coverUrl: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=85',
  categories: [
    {
      name: 'Almoço Executivo & Pratos da Casa',
      description: 'Pratos preparados com ingredientes nobres, sabor caseiro e apresentação impecável.',
      items: [
        {
          name: 'Marmitex Executivo Gourmet Especial',
          description: 'Arroz branco soltinho, feijão caseiro temperado, corte bovino nobre grelhado na brasa, fritas sequinhas, legumes na manteiga e salada fresca.',
          price: 29.9,
          tags: ['Mais Vendido', 'Almoço'],
          image_url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=1200&q=85'
        },
        {
          name: 'Filé Mignon ao Molho Madeira & Champignon',
          description: 'Medalhão de filé mignon grelhado ao ponto, redução artesanal de vinho e champignon fresco. Acompanha arroz à piamontese e batatas rústicas.',
          price: 46.0,
          tags: ['Destaque', 'Gourmet'],
          image_url: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=85'
        },
        {
          name: 'Salmão Grelhado em Crosta de Ervas',
          description: 'Posta nobre de salmão grelhada, azeite de ervas finas, arroz com amêndoas laminadas e legumes salteados na manteiga.',
          price: 49.9,
          tags: ['Especialidade'],
          image_url: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=1200&q=85'
        },
        {
          name: 'Filé à Parmegiana da Casa com Fritas',
          description: 'Filé empanado crocante, coberto com molho rústico de tomate pelado italiano e muçarela gratinada no forno a lenha.',
          price: 36.5,
          tags: ['Favorito'],
          image_url: 'https://images.unsplash.com/photo-1600891964599-f61ba0e24092?auto=format&fit=crop&w=1200&q=85'
        }
      ]
    },
    {
      name: 'Pizzas Artesanais no Forno a Lenha',
      description: 'Massa fresca de longa fermentação, molho italiano e queijos nobres selecionados.',
      items: [
        {
          name: 'Pizza Filé com Gorgonzola e Cebola Caramelizada (Grande)',
          description: 'Tiras suculentas de filé mignon, queijo gorgonzola suave, cebola caramelizada lentamente e muçarela.',
          price: 68.0,
          tags: ['Destaque', 'Pizza Gourmet'],
          image_url: 'https://images.unsplash.com/photo-1590947132387-155cc02f3212?auto=format&fit=crop&w=1200&q=85'
        },
        {
          name: 'Pizza Calabresa Gourmet Especial (Grande)',
          description: 'Calabresa artesanal fatiada, lâminas de cebola roxa marinada, muçarela e azeitonas pretas chilenas.',
          price: 56.0,
          tags: ['Mais Vendida'],
          image_url: 'https://images.unsplash.com/photo-1628840042765-356cda07504e?auto=format&fit=crop&w=1200&q=85'
        },
        {
          name: 'Pizza Quatro Queijos Nobres com Mel & Nozes (Grande)',
          description: 'Muçarela, gorgonzola suave, provolone curado, parmesão ralado na hora, finalizada com fios de mel silvestre e nozes crocantes.',
          price: 64.0,
          tags: ['Premium'],
          image_url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1200&q=85'
        },
        {
          name: 'Pizza Doce Chocolate Meio Amargo com Morangos (Média)',
          description: 'Chocolate nobre 50% cacau cremoso, morangos frescos fatiados e raspas de chocolate branco.',
          price: 44.0,
          tags: ['Sobremesa'],
          image_url: 'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?auto=format&fit=crop&w=1200&q=85'
        }
      ]
    },
    {
      name: 'Espaço Refúgio do Café & Confeitaria',
      description: 'Cafés especiais de grãos selecionados, brunch e tortas artesanais da nossa vitrine.',
      items: [
        {
          name: 'Café Expresso Especial 100% Arábica',
          description: 'Tirado na hora com crema espessa e aveludada, notas naturais de cacau e caramelo.',
          price: 6.5,
          tags: ['Café Especial'],
          image_url: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=1200&q=85'
        },
        {
          name: 'Cappuccino Italiano Clássico com Canela',
          description: 'Leite vaporizado sedoso, expresso duplo, cacau puro e canela em pó.',
          price: 11.5,
          tags: ['Favorito'],
          image_url: 'https://images.unsplash.com/photo-1534778101976-62847782c213?auto=format&fit=crop&w=1200&q=85'
        },
        {
          name: 'Fatia de Torta Holandesa Cremosa da Vitrine',
          description: 'Base crocante de biscoito com creme holandês leve e cobertura brilhante de ganache meio amargo.',
          price: 15.0,
          tags: ['Sobremesa'],
          image_url: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=1200&q=85'
        },
        {
          name: 'Cuca Colonial Artesanal de Uva com Farofa',
          description: 'Receita tradicional colonial com uvas selecionadas e farofinha crocante dourada na manteiga.',
          price: 18.0,
          tags: ['Colonial'],
          image_url: 'https://images.unsplash.com/photo-1565958011703-44f9829ba187?auto=format&fit=crop&w=1200&q=85'
        },
        {
          name: 'Croissant Francês com Queijo Brie & Damasco',
          description: 'Massa folhada amanteigada, queijo brie derretido e geleia artesanal de damasco.',
          price: 17.5,
          tags: ['Brunch'],
          image_url: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=85'
        }
      ]
    },
    {
      name: 'Bebidas, Sucos Naturais & Vinhos',
      description: 'Sucos espremidos na hora sem adição de açúcar, cervejas especiais e refrigerantes gelados.',
      items: [
        {
          name: 'Suco Natural de Laranja 500ml',
          description: '100% fruta natural espremida na hora bem gelada.',
          price: 9.0,
          tags: ['Natural'],
          image_url: 'https://images.unsplash.com/photo-1613478223719-2ab802602423?auto=format&fit=crop&w=1200&q=85'
        },
        {
          name: 'Suco Natural de Maracujá 500ml',
          description: 'Polpa fresca batida com água mineral gelada.',
          price: 9.5,
          tags: ['Refrescante'],
          image_url: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=1200&q=85'
        },
        {
          name: 'Cerveja Heineken Long Neck 330ml',
          description: 'Cerveja puro malte gelada no ponto.',
          price: 11.0,
          tags: ['Cerveja'],
          image_url: 'https://images.unsplash.com/photo-1518176258769-f227c798150e?auto=format&fit=crop&w=1200&q=85'
        },
        {
          name: 'Coca-Cola Original 2L Gelada',
          description: 'Garrafa 2 litros gelada.',
          price: 14.0,
          tags: ['2 Litros'],
          image_url: 'https://images.unsplash.com/photo-1554866585-cd94860890b7?auto=format&fit=crop&w=1200&q=85'
        }
      ]
    }
  ]
};

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const businessName = 'Refúgio Gourmet & Refúgio do Café';
    const slug = 'refugio-gourmet';
    const phone = '5555984252923';
    const address = 'Av. dos Imigrantes, 507 - Centro (em frente à Rodoviária), Horizontina - RS';
    const menuUrl = `https://taprontomenu.com.br/${slug}`;

    console.log(`Provisionando loja VIP: ${businessName} (${slug})...`);

    // 1. Empresa
    let company = (await client.query('SELECT * FROM companies WHERE name = $1 LIMIT 1', [businessName])).rows[0];
    if (!company) {
      const res = await client.query(
        "INSERT INTO companies (name, status, created_at, updated_at) VALUES ($1, 'active', now(), now()) RETURNING *",
        [businessName]
      );
      company = res.rows[0];
    }

    // 2. Loja
    let store = (await client.query('SELECT * FROM stores WHERE slug = $1 LIMIT 1', [slug])).rows[0];
    if (store) {
      const res = await client.query(
        'UPDATE stores SET name = $1, description = $2, is_active = true, updated_at = now() WHERE id = $3 RETURNING *',
        [businessName, REFUGIO_MENU.description, store.id]
      );
      store = res.rows[0];
    } else {
      const res = await client.query(
        `INSERT INTO stores (company_id, name, slug, description, public_url, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, true, now(), now()) RETURNING *`,
        [company.id, businessName, slug, REFUGIO_MENU.description, `/${slug}`]
      );
      store = res.rows[0];
    }

    // 3. Configurações
    const setting = (await client.query('SELECT * FROM store_settings WHERE store_id = $1 LIMIT 1', [store.id])).rows[0];
    const settingData = [
      store.id,
      businessName,
      slug,
      REFUGIO_MENU.description,
      phone,
      address,
      true, // is_open
      true, // accepts_delivery
      true, // accepts_pickup
      '4.00', // delivery_fee
      '25.00', // minimum_order
      ['Pix', 'Cartão na entrega', 'Dinheiro'],
      JSON.stringify(ALWAYS_OPEN_HOURS),
      JSON.stringify(REFUGIO_THEME),
      JSON.stringify({ preview: true, vip: true, source: 'vip_custom_outreach' }),
      true, // onboarding_completed
      REFUGIO_MENU.coverUrl
    ];

    if (setting) {
      await client.query(`
        UPDATE store_settings SET
          name=$2, slug=$3, description=$4, whatsapp_number=$5, address=$6,
          is_open=$7, accepts_delivery=$8, accepts_pickup=$9, delivery_fee=$10, minimum_order=$11,
          payment_methods=$12, business_hours=$13, theme_settings=$14, integration_settings=$15,
          onboarding_completed=$16, cover_url=$17, updated_at=now()
        WHERE store_id=$1
      `, settingData);
    } else {
      await client.query(`
        INSERT INTO store_settings (
          store_id, name, slug, description, whatsapp_number, address,
          is_open, accepts_delivery, accepts_pickup, delivery_fee, minimum_order,
          payment_methods, business_hours, theme_settings, integration_settings,
          onboarding_completed, cover_url, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,now(),now())
      `, settingData);
    }

    // 4. Categorias e Itens
    await client.query('DELETE FROM menu_items WHERE store_id = $1', [store.id]);
    await client.query('DELETE FROM menu_categories WHERE store_id = $1', [store.id]);

    let totalItems = 0;
    for (const [catIdx, cat] of REFUGIO_MENU.categories.entries()) {
      const catRes = await client.query(
        `INSERT INTO menu_categories (store_id, name, description, sort_order, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, true, now(), now()) RETURNING id`,
        [store.id, cat.name, cat.description, (catIdx + 1) * 10]
      );
      const categoryId = catRes.rows[0].id;

      for (const [itemIdx, item] of cat.items.entries()) {
        await client.query(
          `INSERT INTO menu_items (
            store_id, category_id, name, description, price, image_url, tags,
            is_featured, is_available, sort_order, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9, now(), now())`,
          [
            store.id,
            categoryId,
            item.name,
            item.description,
            item.price,
            item.image_url,
            item.tags || [],
            Boolean(item.tags?.includes('Mais Vendido') || item.tags?.includes('Destaque') || item.tags?.includes('Gourmet') || item.tags?.includes('Premium')),
            (itemIdx + 1) * 10
          ]
        );
        totalItems++;
      }
    }

    // 5. Cadastrar Lead VIP em sales_leads
    const metadata = {
      menu_slug: slug,
      menu_url: menuUrl,
      store_id: store.id,
      vip: true,
      owner: 'Claudia Mara Bonazza',
      cnpj: '20.586.683/0001-18',
      email: 'refugiogourmethorizontina@gmail.com',
      instagram: '@refugiogourmethz',
      telephone_fixed: '(55) 3537-4195',
      address,
      provisioned_at: new Date().toISOString(),
      menu_status: 'active',
      continuity_confirmed: false
    };

    const previewDesktop = '/var/www/artifacts/outreach/vip/refugio-gourmet/menu-preview.png';
    const previewMobile = '/var/www/artifacts/outreach/vip/refugio-gourmet/menu-preview-mobile.png';

    let lead = (await client.query('SELECT * FROM sales_leads WHERE normalized_phone = $1 LIMIT 1', [phone])).rows[0];
    if (lead) {
      await client.query(
        `UPDATE sales_leads SET
           business_name = $2, phone = $3, city = $4, state = $5, segment = $6,
           stage = 'preview_ready', metadata = $7::jsonb,
           preview_desktop_path = $8, preview_mobile_path = $9, updated_at = now()
         WHERE id = $1`,
        [lead.id, businessName, phone, 'Horizontina', 'RS', 'restaurante', JSON.stringify(metadata), previewDesktop, previewMobile]
      );
      console.log(`Lead VIP atualizado: ${lead.id}`);
    } else {
      const res = await client.query(
        `INSERT INTO sales_leads (
           business_name, phone, normalized_phone, city, state, segment, source,
           stage, metadata, preview_desktop_path, preview_mobile_path, last_validated_at, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, 'vip_direct', 'preview_ready', $7::jsonb, $8, $9, now(), now(), now())
         RETURNING *`,
        [businessName, phone, phone, 'Horizontina', 'RS', 'restaurante', JSON.stringify(metadata), previewDesktop, previewMobile]
      );
      lead = res.rows[0];
      console.log(`Lead VIP criado: ${lead.id}`);
    }

    await client.query('COMMIT');

    console.log('\n========================================');
    console.log('✅ CARDÁPIO VIP DE REFÚGIO GOURMET CONCLUÍDO!');
    console.log(`Link público: ${menuUrl}`);
    console.log(`Categorias: ${REFUGIO_MENU.categories.length}`);
    console.log(`Itens criados com imagens de alta resolução: ${totalItems}`);
    console.log(`Lead ID: ${lead.id}`);
    console.log('========================================\n');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
