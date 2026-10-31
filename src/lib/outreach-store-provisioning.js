import { randomUUID } from 'node:crypto';

const ALWAYS_OPEN_HOURS = Object.freeze(
  Object.fromEntries(
    ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
      .map((day) => [day, { open: '10:00', close: '23:00', closed: false }])
  )
);

export const THEMES_BY_SEGMENT = Object.freeze({
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
  },
  cafeteria: {
    primaryColor: '#854D0E',
    secondaryColor: '#1F2937',
    backgroundColor: '#FEFCE8',
    buttonColor: '#854D0E',
    buttonTextColor: '#FFFFFF',
    selectionColor: '#FEF08A',
    selectionTextColor: '#713F12'
  },
  marmitaria: {
    primaryColor: '#15803D',
    secondaryColor: '#1F2937',
    backgroundColor: '#F0FDF4',
    buttonColor: '#15803D',
    buttonTextColor: '#FFFFFF',
    selectionColor: '#DCFCE7',
    selectionTextColor: '#166534'
  }
});

export const FALLBACK_SEGMENT_IMAGES = Object.freeze({
  padaria: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1200&q=85',
  pizzaria: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1200&q=85',
  hamburgueria: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=85',
  bar: 'https://images.unsplash.com/photo-1518176258769-f227c798150e?auto=format&fit=crop&w=1200&q=85',
  acaiteria: 'https://images.unsplash.com/photo-1590301157890-4810ed352733?auto=format&fit=crop&w=1200&q=85',
  cafeteria: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=1200&q=85',
  marmitaria: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=1200&q=85',
  restaurante: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=1200&q=85'
});

export const SEGMENT_COVER_URLS = Object.freeze({
  padaria: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1200&q=85',
  pizzaria: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1200&q=85',
  hamburgueria: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=1200&q=85',
  bar: 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=1200&q=85',
  acaiteria: 'https://images.unsplash.com/photo-1590301157890-4810ed352733?auto=format&fit=crop&w=1200&q=85',
  cafeteria: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=1200&q=85',
  marmitaria: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=1200&q=85',
  restaurante: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=85'
});

export function resolveProductIllustration(itemName, categoryName = '', segmentKey = 'restaurante') {
  const text = `${itemName || ''} ${categoryName || ''}`.toLowerCase();

  // 1. Combos e Baldes de Bebidas
  if (text.includes('balde')) {
    return 'https://upload.wikimedia.org/wikipedia/commons/f/f4/Bucket_of_beer_on_ice.jpg';
  }
  if (text.includes('gin')) {
    return 'https://images.unsplash.com/photo-1560512823-829485b8bf24?auto=format&fit=crop&w=1200&q=85';
  }
  if (text.includes('combo') || text.includes('vodka') || text.includes('whisky') || text.includes('smirnoff')) {
    return 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?auto=format&fit=crop&w=1200&q=85';
  }

  // 2. Cervejas e Chopes
  if (text.includes('corona') || text.includes('limao') || text.includes('limão')) {
    return 'https://images.unsplash.com/photo-1567696911980-2eed69a46042?auto=format&fit=crop&w=1200&q=85';
  }
  if (text.includes('heineken') || text.includes('long neck')) {
    return 'https://images.unsplash.com/photo-1518176258769-f227c798150e?auto=format&fit=crop&w=1200&q=85';
  }
  if (text.includes('brahma') || text.includes('amstel') || text.includes('latao') || text.includes('latão') || text.includes('lager') || text.includes('cerveja') || text.includes('chopp')) {
    return 'https://images.unsplash.com/photo-1535958636474-b021ee887b13?auto=format&fit=crop&w=1200&q=85';
  }

  // 3. Petiscos, Gelo e Conveniência
  if (text.includes('gelo')) {
    return 'https://upload.wikimedia.org/wikipedia/commons/a/af/Ice_cubes.jpg';
  }
  if (text.includes('amendoim') || text.includes('castanha') || text.includes('snack')) {
    return 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?auto=format&fit=crop&w=1200&q=85';
  }
  if (text.includes('pringles') || text.includes('chips')) {
    return 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?auto=format&fit=crop&w=1200&q=85';
  }
  if (text.includes('batata') || text.includes('fritas')) {
    if (text.includes('cheddar') || text.includes('bacon')) {
      return 'https://images.unsplash.com/photo-1630384060421-cb20d0e0649d?auto=format&fit=crop&w=1200&q=85';
    }
    return 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=1200&q=85';
  }
  if (text.includes('passarinho')) {
    return 'https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=1200&q=85';
  }

  // 4. Refeições e Pratos Quentes
  if (text.includes('parmegiana')) {
    return 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=85';
  }
  if (text.includes('marmitex') || text.includes('executivo')) {
    return 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=1200&q=85';
  }
  if (text.includes('bife') || text.includes('carne') || text.includes('cavalo')) {
    return 'https://images.unsplash.com/photo-1600891964599-f61ba0e24092?auto=format&fit=crop&w=1200&q=85';
  }
  if (text.includes('frango grelhado') || text.includes('legumes')) {
    return 'https://images.unsplash.com/photo-1532550907401-a500c9a57435?auto=format&fit=crop&w=1200&q=85';
  }
  if (text.includes('feijoada')) {
    return 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=1200&q=85';
  }
  if (text.includes('peixe') || text.includes('tilapia') || text.includes('tilápia') || text.includes('frito') || text.includes('salmao') || text.includes('salmão') || text.includes('camarao') || text.includes('camarão')) {
    return 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=1200&q=85';
  }

  // 5. Hambúrgueres e Lanches
  if (text.includes('burger') || text.includes('hamburguer') || text.includes('x-')) {
    if (text.includes('bacon')) {
      return 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=1200&q=85';
    }
    return 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=85';
  }

  // 6. Bebidas Não-Alcoólicas
  if (text.includes('coca') || text.includes('refrigerante') || text.includes('guarana') || text.includes('guaraná')) {
    if (text.includes('lata')) {
      return 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=1200&q=85';
    }
    return 'https://images.unsplash.com/photo-1554866585-cd94860890b7?auto=format&fit=crop&w=1200&q=85';
  }
  if (text.includes('suco')) {
    if (text.includes('laranja')) {
      return 'https://images.unsplash.com/photo-1613478223719-2ab802602423?auto=format&fit=crop&w=1200&q=85';
    }
    return 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=1200&q=85';
  }
  if (text.includes('agua') || text.includes('água')) {
    return 'https://images.unsplash.com/photo-1523362628745-0c100150b504?auto=format&fit=crop&w=1200&q=85';
  }

  // 7. Sobremesas e Confeitaria
  if (text.includes('pudim')) {
    return 'https://images.unsplash.com/photo-1528975604071-b4dc52a2d18c?auto=format&fit=crop&w=1200&q=85';
  }
  if (text.includes('mousse') || text.includes('sobremesa')) {
    return 'https://images.unsplash.com/photo-1587314168485-3236d6710814?auto=format&fit=crop&w=1200&q=85';
  }
  if (text.includes('cuca') || text.includes('torta') || text.includes('bolo')) {
    return 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=1200&q=85';
  }
  if (text.includes('pao') || text.includes('pão')) {
    return 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1200&q=85';
  }
  if (text.includes('pizza')) {
    return 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1200&q=85';
  }
  if (text.includes('acai') || text.includes('açaí')) {
    return 'https://images.unsplash.com/photo-1590301157890-4810ed352733?auto=format&fit=crop&w=1200&q=85';
  }
  if (text.includes('cafe') || text.includes('café') || text.includes('cappuccino')) {
    return 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=1200&q=85';
  }

  return FALLBACK_SEGMENT_IMAGES[segmentKey] || FALLBACK_SEGMENT_IMAGES.restaurante;
}

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
  const seg = `${String(rawSegment || '')} ${String(businessName || '')}`.toLowerCase();
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
            { name: 'Pão Francês Tradicional (Kg)', description: 'Crocante por fora e macio por dentro, assado a toda hora.', price: 16.9, tags: ['Mais Vendido', 'Quentinho'], image_url: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1200&q=85' },
            { name: 'Pão de Milho Colonial Caseiro', description: 'Receita tradicional da colônia, fofinho e saboroso.', price: 12.0, tags: ['Colonial'], image_url: 'https://images.unsplash.com/photo-1549931319-a545dcf3bc73?auto=format&fit=crop&w=1200&q=85' },
            { name: 'Pão Multigrãos Integral Especial', description: 'Com linhaça, aveia, gergelim e sementes selecionadas.', price: 14.5, tags: ['Integral / Fit'], image_url: 'https://images.unsplash.com/photo-1589367920969-ab8e050bbb04?auto=format&fit=crop&w=1200&q=85' },
            { name: 'Pão de Queijo Mineiro Recheado (100g)', description: 'Massa com queijo canastra meia cura e crosta dourada.', price: 6.5, tags: ['Destaque'], image_url: 'https://images.unsplash.com/photo-1598143153452-4945f2030ae3?auto=format&fit=crop&w=1200&q=85' }
          ]
        },
        {
          name: 'Cucas Alemãs e Tortas',
          description: 'Confeitaria artesanal inspirada nas melhores receitas.',
          items: [
            { name: 'Cuca Alemã Tradicional de Ricota', description: 'Massa fofa coberta com ricota cremosa e farofa crocante amanteigada.', price: 26.0, tags: ['Especialidade'], image_url: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=1200&q=85' },
            { name: 'Cuca Colonial de Uva e Morango', description: 'Com frutas selecionadas da estação e farofinha açucarada.', price: 28.0, tags: ['Mais Pedida'], image_url: 'https://images.unsplash.com/photo-1565958011703-44f9829ba187?auto=format&fit=crop&w=1200&q=85' },
            { name: 'Fatia de Torta Holandesa Cremosa', description: 'Base crocante com creme holandês leve e cobertura de ganache nobre.', price: 14.0, tags: ['Sobremesa'], image_url: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=1200&q=85' },
            { name: 'Bolo Caseiro de Cenoura com Chocolate', description: 'Bolo fofinho com cobertura generosa de brigadeiro artesanal.', price: 18.0, tags: ['Café da Tarde'], image_url: 'https://images.unsplash.com/photo-1606890737304-57a1ca8a5b62?auto=format&fit=crop&w=1200&q=85' }
          ]
        },
        {
          name: 'Salgados de Forno e Lanches',
          description: 'Opções quentes para café da manhã ou lanche rápido.',
          items: [
            { name: 'Folhado Integral de Frango com Catupiry', description: 'Massa folhada leve e dourada com recheio cremoso abundante.', price: 9.5, tags: ['Forno'], image_url: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=1200&q=85' },
            { name: 'Enroladinho Especial de Presunto e Queijo', description: 'Massa artesanal macia com queijo muçarela derretido.', price: 8.5, tags: ['Lanche'], image_url: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=85' },
            { name: 'Pastel de Forno de Carne Suave', description: 'Massa fininha e crocante com tempero caseiro.', price: 9.0, tags: ['Assado'], image_url: 'https://images.unsplash.com/photo-1608039829572-78524f79c4c7?auto=format&fit=crop&w=1200&q=85' },
            { name: 'Sanduíche Natural de Peito de Peru', description: 'Pão integral, pasta de ricota com ervas, alface e tomate.', price: 13.5, tags: ['Leve'], image_url: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=1200&q=85' }
          ]
        },
        {
          name: 'Cafés e Bebidas',
          description: 'Cafés especiais, sucos naturais e bebidas geladas.',
          items: [
            { name: 'Café Expresso Especial 100% Arábica', description: 'Tirado na hora com crema densa e aveludada.', price: 6.0, tags: ['Café'], image_url: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=1200&q=85' },
            { name: 'Cappuccino Italiano Cremoso com Canela', description: 'Com leite vaporizado e chocolate em pó especial.', price: 9.5, tags: ['Quente'], image_url: 'https://images.unsplash.com/photo-1534778101976-62847782c213?auto=format&fit=crop&w=1200&q=85' },
            { name: 'Suco Natural de Laranja 500ml', description: 'Espremido na hora sem adição de açúcar.', price: 8.5, tags: ['Natural'], image_url: 'https://images.unsplash.com/photo-1613478223719-2ab802602423?auto=format&fit=crop&w=1200&q=85' },
            { name: 'Refrigerante Lata 350ml Gelado', description: 'Coca-Cola, Guaraná Antarctica ou Zero.', price: 6.0, tags: ['Gelado'], image_url: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=1200&q=85' }
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
            { name: 'Pizza Calabresa Especial (Grande 8 fatias)', description: 'Calabresa fatiada artesanal, cebola roxa marinada, muçarela e azeitonas pretas.', price: 54.0, tags: ['Mais Vendida', 'Destaque'], image_url: 'https://images.unsplash.com/photo-1628840042765-356cda07504e?auto=format&fit=crop&w=1200&q=85' },
            { name: 'Pizza Frango com Catupiry Original (Grande)', description: 'Frango desfiado temperado com ervas, coberto com legítimo Catupiry.', price: 58.0, tags: ['Favorita'], image_url: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=1200&q=85' },
            { name: 'Pizza Quatro Queijos Nobres (Grande)', description: 'Muçarela, provolone curado, gorgonzola suave e parmesão ralado na hora.', price: 62.0, tags: ['Premium'], image_url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1200&q=85' },
            { name: 'Pizza Portuguesa Tradicional (Grande)', description: 'Presunto magro, ovos cozidos, ervilhas frescas, cebola, muçarela e azeitonas.', price: 56.0, tags: ['Clássica'], image_url: 'https://images.unsplash.com/photo-1571407970349-bc81e7e96d47?auto=format&fit=crop&w=1200&q=85' }
          ]
        },
        {
          name: 'Pizzas Especiais da Casa',
          description: 'Criações exclusivas com ingredientes nobres.',
          items: [
            { name: 'Pizza Filé ao Alho e Óleo com Crispy de Cebola', description: 'Tiras de filé mignon grelhadas no alho dourado, muçarela e cebola crispy.', price: 69.0, tags: ['Especial da Casa'], image_url: 'https://images.unsplash.com/photo-1590947132387-155cc02f3212?auto=format&fit=crop&w=1200&q=85' },
            { name: 'Pizza Bacon Supremo com Barbecue e Cream Cheese', description: 'Bacon em tiras crocantes, gotas de cream cheese Philadelphia e molho barbecue.', price: 64.0, tags: ['Destaque'], image_url: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=1200&q=85' }
          ]
        },
        {
          name: 'Pizzas Doces',
          description: 'Para fechar com uma explosão de sabor.',
          items: [
            { name: 'Pizza Doce de Chocolate Preto com Morangos Frescos (Média)', description: 'Chocolate meio amargo nobre com morangos frescos fatiados e leite condensado.', price: 42.0, tags: ['Sobremesa'], image_url: 'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?auto=format&fit=crop&w=1200&q=85' },
            { name: 'Pizza Doce Romeu e Julieta Cremosa (Média)', description: 'Goiabada cremosa especial coberta com queijo muçarela e lascas de parmesão.', price: 38.0, tags: ['Doce'], image_url: 'https://images.unsplash.com/photo-1588315029754-2dd089d39a1a?auto=format&fit=crop&w=1200&q=85' }
          ]
        },
        {
          name: 'Bebidas e Cervejas',
          description: 'Refrigerantes e cervejas trincando de geladas.',
          items: [
            { name: 'Coca-Cola Original 2L Gelada', description: 'Garrafa 2L.', price: 13.0, tags: ['2 Litros'], image_url: 'https://images.unsplash.com/photo-1554866585-cd94860890b7?auto=format&fit=crop&w=1200&q=85' },
            { name: 'Guaraná Antarctica 2L Gelado', description: 'Garrafa 2L.', price: 12.0, tags: ['2 Litros'], image_url: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=1200&q=85' },
            { name: 'Cerveja Heineken Long Neck 330ml', description: 'Puro malte gelada.', price: 10.0, tags: ['Cerveja'], image_url: 'https://images.unsplash.com/photo-1518176258769-f227c798150e?auto=format&fit=crop&w=1200&q=85' }
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
            { name: 'Burger Clássico com Cheddar e Bacon', description: 'Pão brioche, burger 180g, cheddar inglês derretido, tiras de bacon crocante e maionese artesanal.', price: 34.0, tags: ['Mais Vendido'], image_url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=85' },
            { name: 'Burger Costela BBQ com Cebola Caramelizada', description: 'Burger de costela bovina 180g, muçarela, cebola caramelizada lentamente e molho barbecue.', price: 36.5, tags: ['Destaque'], image_url: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=1200&q=85' },
            { name: 'Smash Duplo com American Cheese', description: 'Dois smash burgers de 90g prensados com crosta crocante, queijo duplo e picles.', price: 29.9, tags: ['Smash'], image_url: 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=1200&q=85' }
          ]
        },
        {
          name: 'Porções e Acompanhamentos',
          description: 'Para compartilhar.',
          items: [
            { name: 'Batata Rústica com Cheddar e Crispy de Bacon (450g)', description: 'Batatas com corte especial, páprica, molho cheddar cremoso e bacon.', price: 28.0, tags: ['Porção'], image_url: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=1200&q=85' },
            { name: 'Anéis de Cebola Empanados Crocantes (12 un)', description: 'Acompanha maionese verde de ervas da casa.', price: 22.0, tags: ['Petisco'], image_url: 'https://images.unsplash.com/photo-1639024471283-03518883512d?auto=format&fit=crop&w=1200&q=85' }
          ]
        },
        {
          name: 'Bebidas e Shakes',
          description: 'Milkshakes artesanais e refrigerantes.',
          items: [
            { name: 'Milkshake de Nutella com Ninho (400ml)', description: 'Sorvete artesanal batido com Nutella e leite Ninho.', price: 18.0, tags: ['Shake'], image_url: 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=1200&q=85' },
            { name: 'Coca-Cola Lata 350ml', description: 'Original gelada.', price: 6.0, tags: ['Refrigerante'], image_url: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=1200&q=85' }
          ]
        }
      ]
    };
  }

  if (seg.includes('bar') || seg.includes('cervejaria') || seg.includes('bebida') || seg.includes('conveni') || seg.includes('distribuidora') || seg.includes('adega') || seg.includes('petiscaria')) {
    return {
      segmentKey: 'bar',
      description: `Cervejas geladas, combos no gelo, destilados e petiscos em ${loc}.`,
      theme: THEMES_BY_SEGMENT.bar,
      categories: [
        {
          name: 'Cervejas Trincando de Geladas',
          description: 'Prontas para consumo ou entrega rápida no capricho.',
          items: [
            { name: 'Heineken Long Neck 330ml', description: 'Cerveja puro malte gelada.', price: 10.0, tags: ['Mais Vendida', 'Gelada'], image_url: 'https://images.unsplash.com/photo-1518176258769-f227c798150e?auto=format&fit=crop&w=1200&q=85' },
            { name: 'Corona Extra 330ml com Limão', description: 'Acompanha rodela fresca de limão.', price: 11.0, tags: ['Importada'], image_url: 'https://images.unsplash.com/photo-1567696911980-2eed69a46042?auto=format&fit=crop&w=1200&q=85' },
            { name: 'Brahma Duplo Malte Latão 473ml', description: 'Duplo malte cremosa e encorpada.', price: 7.5, tags: ['Latão'], image_url: 'https://images.unsplash.com/photo-1535958636474-b021ee887b13?auto=format&fit=crop&w=1200&q=85' },
            { name: 'Amstel Lager Latão 473ml', description: 'Puro malte europeia gelada.', price: 7.0, tags: ['Latão'], image_url: 'https://images.unsplash.com/photo-1575037614876-c38a4d44f5b8?auto=format&fit=crop&w=1200&q=85' }
          ]
        },
        {
          name: 'Combos e Baldes no Gelo',
          description: 'Combinações completas para reunir a galera.',
          items: [
            { name: 'Balde no Gelo com 6 Heineken Long Neck', description: '6 long necks estupidamente geladas com balde de gelo.', price: 55.0, tags: ['Combo', 'Destaque'], image_url: 'https://images.unsplash.com/photo-1584225064785-c62a8b43d148?auto=format&fit=crop&w=1200&q=85' },
            { name: 'Combo Gin Tropical Especial', description: '1 Garrafa Gin + 4 Energéticos Red Bull Tropical + especiarias.', price: 129.0, tags: ['Combo'], image_url: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=1200&q=85' },
            { name: 'Combo Vodka Smirnoff + Energéticos 2L', description: '1 Garrafa Smirnoff + 2 Energéticos Baly 2L.', price: 79.0, tags: ['Favorito'], image_url: 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?auto=format&fit=crop&w=1200&q=85' }
          ]
        },
        {
          name: 'Petiscos e Conveniência',
          description: 'Gelo filtrado, aperitivos e artigos de conveniência.',
          items: [
            { name: 'Saco de Gelo Filtrado em Cubos 5kg', description: 'Gelo cristalino de alta qualidade.', price: 15.0, tags: ['Gelo'], image_url: 'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=1200&q=85' },
            { name: 'Amendoim Salgado Crocante 150g', description: 'Aperitivo perfeito para cerveja.', price: 8.0, tags: ['Snack'], image_url: 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?auto=format&fit=crop&w=1200&q=85' },
            { name: 'Batata Pringles Original 114g', description: 'Batata crocante importada.', price: 16.0, tags: ['Importado'], image_url: 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?auto=format&fit=crop&w=1200&q=85' }
          ]
        }
      ]
    };
  }

  if (seg.includes('acai') || seg.includes('açai') || seg.includes('sorvete') || seg.includes('sorveteria')) {
    return {
      segmentKey: 'acaiteria',
      description: `Açaí artesanal, barcas completas, sorvetes nobres e adicionais especiais em ${loc}.`,
      theme: THEMES_BY_SEGMENT.acaiteria,
      categories: [
        {
          name: 'Tigelas e Copos de Açaí',
          description: 'Açaí puro batido cremoso com acompanhamentos selecionados.',
          items: [
            { name: 'Tigela Tradicional de Açaí 500ml', description: 'Com banana fatiada, granola crocante artesanal, leite condensado e leite em pó.', price: 24.0, tags: ['Mais Vendido'], image_url: 'https://images.unsplash.com/photo-1590301157890-4810ed352733?auto=format&fit=crop&w=1200&q=85' },
            { name: 'Copo Especial de Açaí com Nutella e Morango 400ml', description: 'Camadas generosas de Nutella pura, morangos frescos picados e leite Ninho.', price: 26.5, tags: ['Destaque'], image_url: 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=1200&q=85' },
            { name: 'Barca de Açaí Especial para Compartilhar (1 Litro)', description: 'Barca recheada com açaí cremoso, frutas frescas da estação e 4 adicionais à escolha.', price: 54.0, tags: ['Especial'], image_url: 'https://images.unsplash.com/photo-1590301157890-4810ed352733?auto=format&fit=crop&w=1200&q=85' }
          ]
        },
        {
          name: 'Sorvetes e Shakes Artesanais',
          description: 'Sabores cremosos e refrescantes.',
          items: [
            { name: 'Pote de Sorvete Artesanal 1L', description: 'Sabores tradicionais e especiais da casa.', price: 29.0, tags: ['Sorvete'], image_url: 'https://images.unsplash.com/photo-1497034825429-c343d7c6a68f?auto=format&fit=crop&w=1200&q=85' },
            { name: 'Milkshake de Frutas Vermelhas 400ml', description: 'Sorvete batido com geleia artesanal de amora, framboesa e morango.', price: 18.0, tags: ['Shake'], image_url: 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=1200&q=85' }
          ]
        },
        {
          name: 'Smoothies e Bebidas',
          description: 'Refrescâncias naturais preparadas na hora.',
          items: [
            { name: 'Smoothie Cremoso de Açaí com Banana 500ml', description: 'Açaí batido com banana fresca e água de coco.', price: 16.0, tags: ['Smoothie'], image_url: 'https://images.unsplash.com/photo-1590301157890-4810ed352733?auto=format&fit=crop&w=1200&q=85' },
            { name: 'Água Mineral sem Gás 500ml', description: 'Garrafa 500ml gelada.', price: 4.0, tags: ['Água'], image_url: 'https://images.unsplash.com/photo-1523362628745-0c100150b504?auto=format&fit=crop&w=1200&q=85' }
          ]
        }
      ]
    };
  }

  if (seg.includes('cafe') || seg.includes('cafeteria')) {
    return {
      segmentKey: 'cafeteria',
      description: `Cafés especiais moídos na hora, brunch, tortas e acompanhamentos em ${loc}.`,
      theme: THEMES_BY_SEGMENT.cafeteria,
      categories: [
        {
          name: 'Cafés e Bebidas Quentes',
          description: 'Grãos selecionados com torra fresca.',
          items: [
            { name: 'Café Expresso Especial 100% Arábica', description: 'Tirado na hora com crema densa e notas achocolatadas.', price: 6.5, tags: ['Destaque'], image_url: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=1200&q=85' },
            { name: 'Cappuccino Italiano Clássico com Canela', description: 'Leite vaporizado aveludado com cacau puro e canela.', price: 11.0, tags: ['Favorito'], image_url: 'https://images.unsplash.com/photo-1534778101976-62847782c213?auto=format&fit=crop&w=1200&q=85' },
            { name: 'Mocha de Chocolate Meio Amargo', description: 'Expresso duplo, ganache de chocolate e leite vaporizado.', price: 13.5, tags: ['Especial'], image_url: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=1200&q=85' }
          ]
        },
        {
          name: 'Salgados e Brunch',
          description: 'Massa folhada e salgados nobres.',
          items: [
            { name: 'Croissant Francês com Queijo e Presunto', description: 'Massa folhada crocante recheada e dourada no forno.', price: 15.0, tags: ['Lanche'], image_url: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=85' },
            { name: 'Pão de Queijo Mineiro Artesanal', description: 'Receita tradicional com crosta crocante e queijo derretido.', price: 7.0, tags: ['Quentinho'], image_url: 'https://images.unsplash.com/photo-1598143153452-4945f2030ae3?auto=format&fit=crop&w=1200&q=85' }
          ]
        },
        {
          name: 'Doces e Confeitaria',
          description: 'Tortas finas e sobremesas da vitrine.',
          items: [
            { name: 'Fatia de Torta Holandesa Cremosa', description: 'Base amanteigada com creme especial e cobertura de chocolate.', price: 14.5, tags: ['Sobremesa'], image_url: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=1200&q=85' },
            { name: 'Bolo Caseiro de Cenoura com Chocolate', description: 'Bolo fofinho coberto com brigadeiro cremoso.', price: 12.0, tags: ['Doce'], image_url: 'https://images.unsplash.com/photo-1606890737304-57a1ca8a5b62?auto=format&fit=crop&w=1200&q=85' }
          ]
        }
      ]
    };
  }

  if (seg.includes('marmit')) {
    return {
      segmentKey: 'marmitaria',
      description: `Marmitex caseiro com tempero de mãe, porções generosas e entrega rápida em ${loc}.`,
      theme: THEMES_BY_SEGMENT.marmitaria,
      categories: [
        {
          name: 'Marmitex do Dia',
          description: 'Cardápio quente e fresco feito com ingredientes selecionados.',
          items: [
            { name: 'Marmitex Tradicional Completo (Grande)', description: 'Arroz soltinho, feijão caseiro temperado, bife bovino acebolado, fritas crocantes e salada.', price: 26.0, tags: ['Mais Vendido', 'Almoço'], image_url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=1200&q=85' },
            { name: 'Marmitex Filé de Frango Grelhado com Legumes', description: 'Peito de frango suculento no limão e ervas, arroz integral, feijão e legumes na manteiga.', price: 24.5, tags: ['Fit / Leve'], image_url: 'https://images.unsplash.com/photo-1532550907401-a500c9a57435?auto=format&fit=crop&w=1200&q=85' },
            { name: 'Marmitex Parmegiana de Carne com Fritas', description: 'Filé bovino empanado, coberto com molho caseiro de tomate e queijo gratinado.', price: 30.0, tags: ['Destaque'], image_url: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=85' },
            { name: 'Feijoada Completa da Casa (Individual)', description: 'Feijoada com carnes nobres, arroz, couve refogada, vinagrete, farofa crocante e laranja.', price: 32.0, tags: ['Especial'], image_url: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=1200&q=85' }
          ]
        },
        {
          name: 'Guarnições e Porções Extras',
          description: 'Para acompanhar seu prato.',
          items: [
            { name: 'Porção Extra de Fritas Crocantes (300g)', description: 'Batata frita douradinha e sequinha.', price: 14.0, tags: ['Porção'], image_url: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=1200&q=85' },
            { name: 'Farofa Especial da Casa (200g)', description: 'Farofa crocante com bacon e temperos.', price: 8.0, tags: ['Acompanhamento'], image_url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=1200&q=85' }
          ]
        },
        {
          name: 'Bebidas e Sobremesas',
          description: 'Acompanhamentos ideais para o almoço.',
          items: [
            { name: 'Coca-Cola Lata 350ml Gelada', description: 'Refrigerante gelado.', price: 6.0, tags: ['Lata'], image_url: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=1200&q=85' },
            { name: 'Suco Natural de Laranja 500ml', description: '100% natural, espremido na hora.', price: 8.5, tags: ['Natural'], image_url: 'https://images.unsplash.com/photo-1613478223719-2ab802602423?auto=format&fit=crop&w=1200&q=85' },
            { name: 'Pudim de Leite Condensado Caseiro', description: 'Fatia cremosa tradicional com calda dourada.', price: 8.0, tags: ['Sobremesa'], image_url: 'https://images.unsplash.com/photo-1528975604071-b4dc52a2d18c?auto=format&fit=crop&w=1200&q=85' }
          ]
        }
      ]
    };
  }

  // Padrão: Restaurante / Lanchonete
  return {
    segmentKey: 'restaurante',
    description: `Almoço caseiro, marmitex executivo, pratos na chapa, lanches e porções em ${loc}.`,
    theme: THEMES_BY_SEGMENT.restaurante,
    categories: [
      {
        name: 'Almoço e Pratos Principais',
        description: 'Pratos quentes e marmitex preparados na hora com sabor caseiro.',
        items: [
          { name: 'Marmitex Executivo Tradicional', description: 'Arroz branco soltinho, feijão caseiro, bife bovino acebolado, fritas e salada fresca.', price: 26.0, tags: ['Mais Vendido', 'Almoço'], image_url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=1200&q=85' },
          { name: 'Filé à Parmegiana com Fritas', description: 'Filé empanado crocante, coberto com molho artesanal de tomate e muçarela gratinada. Acompanha arroz e fritas.', price: 32.0, tags: ['Destaque'], image_url: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=85' },
          { name: 'Bife a Cavalo Especial', description: 'Bife grelhado suculento com dois ovos fritos na manteiga, arroz, feijão tropeiro e farofa crocante.', price: 28.5, tags: ['Favorito'], image_url: 'https://images.unsplash.com/photo-1600891964599-f61ba0e24092?auto=format&fit=crop&w=1200&q=85' },
          { name: 'Frango Grelhado com Legumes na Manteiga', description: 'Peito de frango temperado no alecrim e limão, legumes salteados e arroz integral.', price: 25.0, tags: ['Fit / Leve'], image_url: 'https://images.unsplash.com/photo-1532550907401-a500c9a57435?auto=format&fit=crop&w=1200&q=85' },
          { name: 'Feijoada Completa da Casa', description: 'Feijoada tradicional com carnes nobres, arroz, couve refogada, vinagrete, farofa e laranja.', price: 34.0, tags: ['Tradição'], image_url: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=1200&q=85' }
        ]
      },
      {
        name: 'Lanches e Porções',
        description: 'Burgers artesanais e porções para curtir o fim de tarde e a noite.',
        items: [
          { name: 'X-Especial da Casa Completo', description: 'Pão brioche tostado, hambúrguer artesanal 180g, cheddar duplo, bacon crocante, ovo e maionese defumada.', price: 29.9, tags: ['Especial'], image_url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=85' },
          { name: 'X-Bacon Supremo com Queijo Derretido', description: 'Burger 160g, fatias generosas de bacon crocante, queijo muçarela, cebola dourada e barbecue.', price: 27.5, tags: ['Burger'], image_url: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=1200&q=85' },
          { name: 'Batata Frita com Cheddar e Bacon (500g)', description: 'Batata frita rústica crocante, coberta com cheddar cremoso e cubos de bacon.', price: 28.0, tags: ['Porção'], image_url: 'https://images.unsplash.com/photo-1630384060421-cb20d0e0649d?auto=format&fit=crop&w=1200&q=85' },
          { name: 'Frango a Passarinho Crocante (700g)', description: 'Pedaços de frango crocante temperados no alho dourado e salsinha fresca.', price: 38.0, tags: ['Petisco'], image_url: 'https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=1200&q=85' }
        ]
      },
      {
        name: 'Bebidas e Sucos Naturais',
        description: 'Sucos naturais espremidos na hora, refrigerantes e cervejas geladas.',
        items: [
          { name: 'Coca-Cola Original 2L Gelada', description: 'Garrafa 2 litros gelada.', price: 13.0, tags: ['2 Litros'], image_url: 'https://images.unsplash.com/photo-1554866585-cd94860890b7?auto=format&fit=crop&w=1200&q=85' },
          { name: 'Coca-Cola Lata 350ml Gelada', description: 'Lata 350ml gelada.', price: 6.0, tags: ['Lata'], image_url: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=1200&q=85' },
          { name: 'Suco Natural de Laranja 500ml', description: '100% natural, espremido na hora.', price: 9.0, tags: ['Suco Natural'], image_url: 'https://images.unsplash.com/photo-1613478223719-2ab802602423?auto=format&fit=crop&w=1200&q=85' },
          { name: 'Suco Natural de Maracujá 500ml', description: 'Polpa fresca batida gelada.', price: 9.5, tags: ['Refrescante'], image_url: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=1200&q=85' },
          { name: 'Cerveja Heineken Long Neck 330ml', description: 'Cerveja puro malte gelada.', price: 10.0, tags: ['Cerveja'], image_url: 'https://images.unsplash.com/photo-1518176258769-f227c798150e?auto=format&fit=crop&w=1200&q=85' },
          { name: 'Água Mineral sem Gás 500ml', description: 'Garrafa 500ml gelada.', price: 4.0, tags: ['Água'], image_url: 'https://images.unsplash.com/photo-1523362628745-0c100150b504?auto=format&fit=crop&w=1200&q=85' }
        ]
      },
      {
        name: 'Sobremesas Caseiras',
        description: 'Doces artesanais para fechar com chave de ouro.',
        items: [
          { name: 'Pudim de Leite Condensado Tradicional', description: 'Fatia generosa de pudim cremoso sem furinhos com calda dourada de caramelo.', price: 8.5, tags: ['Sobremesa'], image_url: 'https://images.unsplash.com/photo-1528975604071-b4dc52a2d18c?auto=format&fit=crop&w=1200&q=85' },
          { name: 'Mousse de Maracujá Cremoso com Calda', description: 'Mousse aerado com calda fresca de maracujá e sementes.', price: 8.0, tags: ['Sobremesa'], image_url: 'https://images.unsplash.com/photo-1587314168485-3236d6710814?auto=format&fit=crop&w=1200&q=85' }
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
    const coverUrl = SEGMENT_COVER_URLS[menuData.segmentKey] || SEGMENT_COVER_URLS.restaurante;

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
      true, // onboarding_completed
      coverUrl
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
        const itemImage = item.image_url || resolveProductIllustration(item.name, cat.name, menuData.segmentKey);
        if (!itemImage) {
          throw new Error(`REGRA VIOLADA: Item "${item.name}" não pode ser inserido sem imagem de alta resolução.`);
        }
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
            itemImage,
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
