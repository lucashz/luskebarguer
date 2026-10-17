import { randomUUID } from 'node:crypto';

const ALWAYS_OPEN_HOURS = Object.freeze(
  Object.fromEntries(
    ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
      .map((day) => [day, { open: '10:00', close: '23:00', closed: false }])
  )
);

const THEMES_BY_SEGMENT = Object.freeze({
  restaurante: {
    primaryColor: '#EA580C',
    secondaryColor: '#1F2937',
    backgroundColor: '#FFF7ED',
    buttonColor: '#EA580C',
    buttonTextColor: '#FFFFFF',
    selectionColor: '#FFEDD5',
    selectionTextColor: '#9A3412'
  },
  padaria: {
    primaryColor: '#D97706',
    secondaryColor: '#1F2937',
    backgroundColor: '#FFFBEB',
    buttonColor: '#D97706',
    buttonTextColor: '#FFFFFF',
    selectionColor: '#FEF3C7',
    selectionTextColor: '#92400E'
  },
  pizzaria: {
    primaryColor: '#DC2626',
    secondaryColor: '#1F2937',
    backgroundColor: '#FEF2F2',
    buttonColor: '#DC2626',
    buttonTextColor: '#FFFFFF',
    selectionColor: '#FEE2E2',
    selectionTextColor: '#991B1B'
  },
  hamburgueria: {
    primaryColor: '#B45309',
    secondaryColor: '#111827',
    backgroundColor: '#FFFBEB',
    buttonColor: '#B45309',
    buttonTextColor: '#FFFFFF',
    selectionColor: '#FEF3C7',
    selectionTextColor: '#78350F'
  },
  bar: {
    primaryColor: '#2563EB',
    secondaryColor: '#1E293B',
    backgroundColor: '#EFF6FF',
    buttonColor: '#2563EB',
    buttonTextColor: '#FFFFFF',
    selectionColor: '#DBEAFE',
    selectionTextColor: '#1E40AF'
  },
  acaiteria: {
    primaryColor: '#7C3AED',
    secondaryColor: '#1F2937',
    backgroundColor: '#FAF5FF',
    buttonColor: '#7C3AED',
    buttonTextColor: '#FFFFFF',
    selectionColor: '#F3E8FF',
    selectionTextColor: '#5B21B6'
  }
});

export function generateStoreSlug(businessName) {
  const cleanName = String(businessName || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);

  return cleanName || `loja-${randomUUID().slice(0, 8)}`;
}

export function resolveSegmentMenuData(rawSegment, businessName, city, state) {
  const seg = String(rawSegment || '').toLowerCase();
  const loc = [city, state].filter(Boolean).join(' - ') || 'Brasil';

  if (seg.includes('padaria') || seg.includes('confeitaria') || seg.includes('panificadora')) {
    return {
      segmentKey: 'padaria',
      description: `Pães artesanais, cucas coloniais, tortas, salgados e cafés em ${loc}.`,
      theme: THEMES_BY_SEGMENT.padaria,
      categories: [
        {
          name: 'Pães Artesanais e Coloniais',
          description: 'Pães quentinhos assados diariamente com fermentação especial.',
          items: [
            { name: 'Pão Francês Tradicional (Kg)', description: 'Crocante por fora e macio por dentro, assado a toda hora.', price: 16.9, tags: ['Mais Vendido', 'Quentinho'] },
            { name: 'Pão de Milho Colonial Caseiro', description: 'Receita tradicional da colônia, fofinho e saboroso.', price: 12.0, tags: ['Colonial'] },
            { name: 'Pão Multigrwos Integral Especial', description: 'Com linhaça, aveia, gergelim e sementes selecionadas.', price: 14.5, tags: ['Integral / Fit'] },
            { name: 'Pão de Queijo Mineiro Recheado (100g)', description: 'Massa com queijo canastra meia cura e crosta dourada.', price: 6.5, tags: ['Destaque'] }
          ]
        },
        {
          name: 'Cucas Alemãs e Tortas',
          description: 'Confeitaria artesanal inspirada nas melhores receitas.',
          items: [
            { name: 'Cuca Alemã Tradicional de Ricota', description: 'Massa fofa coberta com ricota cremosa e farofa crocante amanteigada.', price: 26.0, tags: ['Especialidade'] },
            { name: 'Cuca Colonial de Uva e Morango', description: 'Com frutas selecionadas da estação e farofinha açucarada.', price: 28.0, tags: ['Mais Pedida'] },
            { name: 'Fatia de Torta Holandesa Cremosa', description: 'Base crocante com creme holandês leve e cobertura de ganache nobre.', price: 14.0, tags: ['Sobremesa'] },
            { name: 'Bolo Caseiro de Cenoura com Chocolate', description: 'Bolo fofinho com cobertura generosa de brigadeiro artesanal.', price: 18.0, tags: ['Café da Tarde'] }
          ]
        },
        {
          name: 'Salgados de Forno e Lanches',
          description: 'Opções quentes para café da manhã ou lanche rápido.',
          items: [
            { name: 'Folhado Integral de Frango com Catupiry', description: 'Massa folhada leve e dourada com recheio cremoso abundante.', price: 9.5, tags: ['Forno'] },
            { name: 'Enroladinho Especial de Presunto e Queijo', description: 'Massa artesanal macia com queijo muçarela derretido.', price: 8.5, tags: ['Lanche'] },
            { name: 'Pastel de Forno de Carne Suave', description: 'Massa fininha e crocante com tempero caseiro.', price: 9.0, tags: ['Assado'] },
            { name: 'Sanduíche Natural de Peito de Peru', description: 'Pão integral, pasta de ricota com ervas, alface e tomate.', price: 13.5, tags: ['Leve'] }
          ]
        },
        {
          name: 'Cafés e Bebidas',
          description: 'Cafés especiais, sucos naturais e bebidas geladas.',
          items: [
            { name: 'Café Expresso Especial 100% Arábica', description: 'Tirado na hora com crema densa e aveludada.', price: 6.0, tags: ['Café'] },
            { name: 'Cappuccino Italiano Cremoso com Canela', description: 'Com leite vaporizado e chocolate em pó especial.', price: 9.5, tags: ['Quente'] },
            { name: 'Suco Natural de Laranja 500ml', description: 'Espremido na hora sem adição de açúcar.', price: 8.5, tags: ['Natural'] },
            { name: 'Refrigerante Lata 350ml Gelado', description: 'Coca-Cola, Guaraná Antarctica ou Zero.', price: 6.0, tags: ['Gelado'] }
          ]
        }
      ]
    };
  }

  if (seg.includes('pizza')) {
    return {
      segmentKey: 'pizzaria',
      description: `Pizzas artesanais assadas no forno, massas frescas e bordas recheadas em ${loc}.`,
      theme: THEMES_BY_SEGMENT.pizzaria,
      categories: [
        {
          name: 'Pizzas Salgadas Tradicionais',
          description: 'Molho de tomate pelado italiano, muçarela especial e orégano.',
          items: [
            { name: 'Pizza Calabresa Especial (Grande 8 fatias)', description: 'Calabresa fatiada artesanal, cebola roxa marinada, muçarela e azeitonas pretas.', price: 54.0, tags: ['Mais Vendida', 'Destaque'] },
            { name: 'Pizza Frango com Catupiry Original (Grande)', description: 'Frango desfiado temperado com ervas, coberto com legítimo Catupiry.', price: 58.0, tags: ['Favorita'] },
            { name: 'Pizza Quatro Queijos Nobres (Grande)', description: 'Muçarela, provolone curado, gorgonzola suave e parmesão ralado na hora.', price: 62.0, tags: ['Premium'] },
            { name: 'Pizza Portuguesa Tradicional (Grande)', description: 'Presunto magro, ovos cozidos, ervilhas frescas, cebola, muçarela e azeitonas.', price: 56.0, tags: ['Clássica'] }
          ]
        },
        {
          name: 'Pizzas Especiais da Casa',
          description: 'Criações exclusivas com ingredientes nobres.',
          items: [
            { name: 'Pizza Filé ao Alho e Óleo com Crispy de Cebola', description: 'Tiras de filé mignon grelhadas no alho dourado, muçarela e cebola crispy.', price: 69.0, tags: ['Especial da Casa'] },
            { name: 'Pizza Bacon Supremo com Barbecue e Cream Cheese', description: 'Bacon em tiras crocantes, gotas de cream cheese Philadelphia e molho barbecue.', price: 64.0, tags: ['Destaque'] }
          ]
        },
        {
          name: 'Pizzas Doces',
          description: 'Para fechar com uma explosão de sabor.',
          items: [
            { name: 'Pizza Doce de Chocolate Preto com Morangos Frescos (Média)', description: 'Chocolate meio amargo nobre com morangos frescos fatiados e leite condensado.', price: 42.0, tags: ['Sobremesa'] },
            { name: 'Pizza Doce Romeu e Julieta Cremosa (Média)', description: 'Goiabada cremosa especial coberta com queijo muçarela e lascas de parmesão.', price: 38.0, tags: ['Doce'] }
          ]
        },
        {
          name: 'Bebidas e Cervejas',
          description: 'Refrigerantes e cervejas trincando de geladas.',
          items: [
            { name: 'Coca-Cola Original 2L Gelada', description: 'Garrafa 2L.', price: 13.0, tags: ['2 Litros'] },
            { name: 'Guaraná Antarctica 2L Gelado', description: 'Garrafa 2L.', price: 12.0, tags: ['2 Litros'] },
            { name: 'Cerveja Heineken Long Neck 330ml', description: 'Puro malte gelada.', price: 10.0, tags: ['Cerveja'] }
          ]
        }
      ]
    };
  }

  if (seg.includes('hamburguer') || seg.includes('burger')) {
    return {
      segmentKey: 'hamburgueria',
      description: `Burgers artesanais na brasa, smash burgers e batatas rústicas em ${loc}.`,
      theme: THEMES_BY_SEGMENT.hamburgueria,
      categories: [
        {
          name: 'Burgers Artesanais',
          description: 'Blend bovino 180g grelhado ao ponto, pão brioche amanteigado tostado.',
          items: [
            { name: 'Burger Clássico com Cheddar e Bacon', description: 'Pão brioche, burger 180g, cheddar inglês derretido, tiras de bacon crocante e maionese artesanal.', price: 34.0, tags: ['Mais Vendido'] },
            { name: 'Burger Costela BBQ com Cebola Caramelizada', description: 'Burger de costela bovina 180g, muçarela, cebola caramelizada lentamente e molho barbecue.', price: 36.5, tags: ['Destaque'] },
            { name: 'Smash Duplo com American Cheese', description: 'Dois smash burgers de 90g prensados com crosta crocante, queijo duplo e picles.', price: 29.9, tags: ['Smash'] }
          ]
        },
        {
          name: 'Porções e Acompanhamentos',
          description: 'Para compartilhar.',
          items: [
            { name: 'Batata Rústica com Cheddar e Crispy de Bacon (450g)', description: 'Batatas com corte especial, páprica, molho cheddar cremoso e bacon.', price: 28.0, tags: ['Porção'] },
            { name: 'Anéis de Cebola Empanados Crocantes (12 un)', description: 'Acompanha maionese verde de ervas da casa.', price: 22.0, tags: ['Petisco'] }
          ]
        },
        {
          name: 'Bebidas e Shakes',
          description: 'Milkshakes artesanais e refrigerantes.',
          items: [
            { name: 'Milkshake de Nutella com Ninho (400ml)', description: 'Sorvete artesanal batido com Nutella e leite Ninho.', price: 18.0, tags: ['Shake'] },
            { name: 'Coca-Cola Lata 350ml', description: 'Original gelada.', price: 6.0, tags: ['Refrigerante'] }
          ]
        }
      ]
    };
  }

  if (seg.includes('bar') || seg.includes('cervejaria') || seg.includes('bebida') || seg.includes('conveni') || seg.includes('distribuidora')) {
    return {
      segmentKey: 'bar',
      description: `Cervejas geladas, combos no gelo, destilados e petiscos em ${loc}.`,
      theme: THEMES_BY_SEGMENT.bar,
      categories: [
        {
          name: 'Cervejas Trincando de Geladas',
          description: 'Prontas para consumo ou entrega rápida no capricho.',
          items: [
            { name: 'Heineken Long Neck 330ml', description: 'Cerveja puro malte gelada.', price: 10.0, tags: ['Mais Vendida', 'Gelada'] },
            { name: 'Corona Extra 330ml com Limão', description: 'Acompanha rodela fresca de limão.', price: 11.0, tags: ['Importada'] },
            { name: 'Brahma Duplo Malte Latão 473ml', description: 'Duplo malte cremosa e encorpada.', price: 7.5, tags: ['Latão'] },
            { name: 'Amstel Lager Latão 473ml', description: 'Puro malte europeia gelada.', price: 7.0, tags: ['Latão'] }
          ]
        },
        {
          name: 'Combos e Baldes no Gelo',
          description: 'Combinações completas para reunir a galera.',
          items: [
            { name: 'Balde no Gelo com 6 Heineken Long Neck', description: '6 long necks estupidamente geladas com balde de gelo.', price: 55.0, tags: ['Combo', 'Destaque'] },
            { name: 'Combo Gin Tropical Especial', description: '1 Garrafa Gin + 4 Energéticos Red Bull Tropical + especiarias.', price: 129.0, tags: ['Combo'] },
            { name: 'Combo Vodka Smirnoff + Energéticos 2L', description: '1 Garrafa Smirnoff + 2 Energéticos Baly 2L.', price: 79.0, tags: ['Favorito'] }
          ]
        },
        {
          name: 'Petiscos e Conveniência',
          description: 'Gelo filtrado, aperitivos e artigos de conveniência.',
          items: [
            { name: 'Saco de Gelo Filtrado em Cubos 5kg', description: 'Gelo cristalino de alta qualidade.', price: 15.0, tags: ['Gelo'] },
            { name: 'Amendoim Salgado Crocante 150g', description: 'Aperitivo perfeito para cerveja.', price: 8.0, tags: ['Snack'] },
            { name: 'Batata Pringles Original 114g', description: 'Batata crocante importada.', price: 16.0, tags: ['Importado'] }
          ]
        }
      ]
    };
  }

  // Padrão: Restaurante / Lanchonete / Marmitaria
  return {
    segmentKey: 'restaurante',
    description: `Almoço caseiro, marmitex executivo, pratos na chapa, lanches e porções em ${loc}.`,
    theme: THEMES_BY_SEGMENT.restaurante,
    categories: [
      {
        name: 'Almoço e Marmitex',
        description: 'Pratos quentes e marmitex preparados na hora com sabor caseiro.',
        items: [
          { name: 'Marmitex Executivo Tradicional', description: 'Arroz branco soltinho, feijão caseiro, bife bovino acebolado, fritas e salada fresca.', price: 26.0, tags: ['Mais Vendido', 'Almoço'] },
          { name: 'Filé à Parmegiana com Fritas', description: 'Filé empanado crocante, coberto com molho artesanal de tomate e muçarela gratinada. Acompanha arroz e fritas.', price: 32.0, tags: ['Destaque'] },
          { name: 'Bife a Cavalo Especial', description: 'Bife grelhado suculento com dois ovos fritos na manteiga, arroz, feijão tropeiro e farofa crocante.', price: 28.5, tags: ['Favorito'] },
          { name: 'Frango Grelhado com Legumes na Manteiga', description: 'Peito de frango temperado no alecrim e limão, legumes salteados e arroz integral.', price: 25.0, tags: ['Fit / Leve'] },
          { name: 'Feijoada Completa da Casa', description: 'Feijoada tradicional com carnes nobres, arroz, couve refogada, vinagrete, farofa e laranja.', price: 34.0, tags: ['Tradição'] }
        ]
      },
      {
        name: 'Lanches e Porções',
        description: 'Burgers artesanais e porções para curtir o fim de tarde e a noite.',
        items: [
          { name: 'X-Especial da Casa Completo', description: 'Pão brioche tostado, hambúrguer artesanal 180g, cheddar duplo, bacon crocante, ovo e maionese defumada.', price: 29.9, tags: ['Especial'] },
          { name: 'X-Bacon Supremo com Queijo Derretido', description: 'Burger 160g, fatias generosas de bacon crocante, queijo muçarela, cebola dourada e barbecue.', price: 27.5, tags: ['Burger'] },
          { name: 'Batata Frita com Cheddar e Bacon (500g)', description: 'Batata frita rústica crocante, coberta com cheddar cremoso e cubos de bacon.', price: 28.0, tags: ['Porção'] },
          { name: 'Frango a Passarinho Crocante (700g)', description: 'Pedaços de frango crocante temperados no alho dourado e salsinha fresca.', price: 38.0, tags: ['Petisco'] }
        ]
      },
      {
        name: 'Bebidas e Sucos Naturais',
        description: 'Sucos naturais espremidos na hora, refrigerantes e cervejas geladas.',
        items: [
          { name: 'Coca-Cola Original 2L Gelada', description: 'Garrafa 2 litros gelada.', price: 13.0, tags: ['2 Litros'] },
          { name: 'Coca-Cola Lata 350ml Gelada', description: 'Lata 350ml gelada.', price: 6.0, tags: ['Lata'] },
          { name: 'Suco Natural de Laranja 500ml', description: '100% natural, espremido na hora.', price: 9.0, tags: ['Suco Natural'] },
          { name: 'Suco Natural de Maracujá 500ml', description: 'Polpa fresca batida gelada.', price: 9.5, tags: ['Refrescante'] },
          { name: 'Cerveja Heineken Long Neck 330ml', description: 'Cerveja puro malte gelada.', price: 10.0, tags: ['Cerveja'] },
          { name: 'Água Mineral sem Gás 500ml', description: 'Garrafa 500ml gelada.', price: 4.0, tags: ['Água'] }
        ]
      },
      {
        name: 'Sobremesas Caseiras',
        description: 'Doces artesanais para fechar com chave de ouro.',
        items: [
          { name: 'Pudim de Leite Condensado Tradicional', description: 'Fatia generosa de pudim cremoso sem furinhos com calda dourada de caramelo.', price: 8.5, tags: ['Sobremesa'] },
          { name: 'Mousse de Maracujá Cremoso com Calda', description: 'Mousse aerado com calda fresca de maracujá e sementes.', price: 8.0, tags: ['Sobremesa'] }
        ]
      }
    ]
  };
}

export async function provisionOutreachStore({ lead = {}, pool, baseUrl = 'https://taprontomenu.com.br' }) {
  if (!pool) throw new Error('Pool do banco de dados é obrigatório para provisionar a loja.');
  const businessName = String(lead.business_name || lead.name || '').trim();
  if (!businessName) throw new Error('Nome do estabelecimento é obrigatório.');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Slug único
    let candidateSlug = lead.metadata?.menu_slug || generateStoreSlug(businessName);
    const existingStoreCheck = await client.query('SELECT id, slug FROM stores WHERE slug = $1 LIMIT 1', [candidateSlug]);
    if (existingStoreCheck.rows[0] && lead.metadata?.store_id && existingStoreCheck.rows[0].id !== lead.metadata.store_id) {
      candidateSlug = `${candidateSlug}-${lead.id.slice(0, 4)}`;
    }

    const menuData = resolveSegmentMenuData(lead.segment, businessName, lead.city, lead.state);
    const phone = lead.normalized_phone || lead.phone || '';
    const address = [lead.city, lead.state].filter(Boolean).join(' - ') || 'Centro';

    // 2. Empresa garantida
    let company = (await client.query('SELECT * FROM companies WHERE name = $1 LIMIT 1', [businessName])).rows[0];
    if (!company) {
      const companyRes = await client.query(
        "INSERT INTO companies (name, status, created_at, updated_at) VALUES ($1, 'active', now(), now()) RETURNING *",
        [businessName]
      );
      company = companyRes.rows[0];
    }

    // 3. Loja criada ou atualizada
    let store = null;
    if (lead.metadata?.store_id) {
      store = (await client.query('SELECT * FROM stores WHERE id = $1 LIMIT 1', [lead.metadata.store_id])).rows[0];
    }
    if (!store) {
      store = (await client.query('SELECT * FROM stores WHERE slug = $1 LIMIT 1', [candidateSlug])).rows[0];
    }

    if (store) {
      const updated = await client.query(
        'UPDATE stores SET name = $1, slug = $2, description = $3, is_active = true, updated_at = now() WHERE id = $4 RETURNING *',
        [businessName, candidateSlug, menuData.description, store.id]
      );
      store = updated.rows[0];
    } else {
      const created = await client.query(
        `INSERT INTO stores (company_id, name, slug, description, public_url, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, true, now(), now()) RETURNING *`,
        [company.id, businessName, candidateSlug, menuData.description, `/${candidateSlug}`]
      );
      store = created.rows[0];
    }

    // 4. Configurações da loja
    const setting = (await client.query('SELECT * FROM store_settings WHERE store_id = $1 LIMIT 1', [store.id])).rows[0];
    const settingData = [
      store.id,
      businessName,
      candidateSlug,
      menuData.description,
      phone,
      address,
      true, // is_open
      true, // accepts_delivery
      true, // accepts_pickup
      '4.00', // delivery_fee
      '20.00', // minimum_order
      ['Pix', 'Cartão na entrega', 'Dinheiro'],
      JSON.stringify(ALWAYS_OPEN_HOURS),
      JSON.stringify(menuData.theme),
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
        WHERE store_id=$1
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

    // 5. Categorias e Itens
    await client.query('DELETE FROM menu_items WHERE store_id = $1', [store.id]);
    await client.query('DELETE FROM menu_categories WHERE store_id = $1', [store.id]);

    let totalItems = 0;
    for (const [catIdx, cat] of menuData.categories.entries()) {
      const catRes = await client.query(
        `INSERT INTO menu_categories (store_id, name, description, sort_order, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, true, now(), now()) RETURNING id`,
        [store.id, cat.name, cat.description, (catIdx + 1) * 10]
      );
      const categoryId = catRes.rows[0].id;

      for (const [itemIdx, item] of cat.items.entries()) {
        await client.query(
          `INSERT INTO menu_items (
            store_id, category_id, name, description, price, tags,
            is_featured, is_available, sort_order, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, now(), now())`,
          [
            store.id,
            categoryId,
            item.name,
            item.description,
            item.price,
            item.tags || [],
            Boolean(item.tags?.includes('Mais Vendido') || item.tags?.includes('Mais Vendida') || item.tags?.includes('Destaque') || item.tags?.includes('Especial')),
            (itemIdx + 1) * 10
          ]
        );
        totalItems += 1;
      }
    }

    const menuUrl = `${baseUrl.replace(/\/+$/, '')}/${candidateSlug}`;

    // 6. Atualizar metadados do lead
    const updatedMetadata = {
      ...(lead.metadata || {}),
      store_id: store.id,
      menu_slug: candidateSlug,
      menu_url: menuUrl,
      continuity_confirmed: false,
      menu_status: 'active',
      provisioned_at: new Date().toISOString()
    };

    if (lead.id) {
      await client.query(
        'UPDATE sales_leads SET metadata = $2::jsonb, updated_at = now() WHERE id = $1',
        [lead.id, JSON.stringify(updatedMetadata)]
      );
    }

    await client.query('COMMIT');
    return {
      ok: true,
      storeId: store.id,
      slug: candidateSlug,
      menuUrl,
      categoriesCount: menuData.categories.length,
      itemsCount: totalItems
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
