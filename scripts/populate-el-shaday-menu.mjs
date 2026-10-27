import pg from 'pg';

try { process.loadEnvFile?.('.env'); } catch {}

const STORE_ID = '4ccc7239-6634-4134-846d-858449c84f54';

// Imagens verificadas Unsplash Food alta resolução
const IMAGES = {
  // Burgers Artesanais
  el_burger: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=85',
  el_salada: 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=1200&q=85',
  el_onion: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=1200&q=85',
  el_barbecue: 'https://images.unsplash.com/photo-1553979459-d2229ba7433b?auto=format&fit=crop&w=1200&q=85',
  el_calabresa: 'https://images.unsplash.com/photo-1572802419224-296b0aeee0d9?auto=format&fit=crop&w=1200&q=85',
  el_bacon: 'https://images.unsplash.com/photo-1553979459-d2229ba7433b?auto=format&fit=crop&w=1200&q=85',
  el_onion_bacon: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=1200&q=85',
  el_duplo: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=1200&q=85',

  // Frango Empanado
  el_chicken: 'https://images.unsplash.com/photo-1625813506062-0aeb1d7a094b?auto=format&fit=crop&w=1200&q=85',
  el_chicken_salada: 'https://images.unsplash.com/photo-1625813506062-0aeb1d7a094b?auto=format&fit=crop&w=1200&q=85',
  el_chicken_bacon: 'https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=1200&q=85',
  el_chicken_bacon_salada: 'https://images.unsplash.com/photo-1625813506062-0aeb1d7a094b?auto=format&fit=crop&w=1200&q=85',
  el_chicken_onion: 'https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=1200&q=85',
  el_chicken_duplo: 'https://images.unsplash.com/photo-1625813506062-0aeb1d7a094b?auto=format&fit=crop&w=1200&q=85',

  // Tradicionais
  x_burger: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=85',
  x_salada: 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=1200&q=85',
  x_egg: 'https://images.unsplash.com/photo-1561758033-d89a9ad46330?auto=format&fit=crop&w=1200&q=85',
  x_egg_salada: 'https://images.unsplash.com/photo-1561758033-d89a9ad46330?auto=format&fit=crop&w=1200&q=85',
  x_bacon: 'https://images.unsplash.com/photo-1553979459-d2229ba7433b?auto=format&fit=crop&w=1200&q=85',
  x_bacon_salada: 'https://images.unsplash.com/photo-1553979459-d2229ba7433b?auto=format&fit=crop&w=1200&q=85',
  x_egg_bacon: 'https://images.unsplash.com/photo-1561758033-d89a9ad46330?auto=format&fit=crop&w=1200&q=85',
  x_egg_bacon_salada: 'https://images.unsplash.com/photo-1561758033-d89a9ad46330?auto=format&fit=crop&w=1200&q=85',
  x_veg: 'https://images.unsplash.com/photo-1520072959219-c595dc870360?auto=format&fit=crop&w=1200&q=85',
  x_omelete: 'https://images.unsplash.com/photo-1520072959219-c595dc870360?auto=format&fit=crop&w=1200&q=85',
  x_triplo: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=1200&q=85',
  x_duplo_salada: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=1200&q=85',
  x_tudo: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=1200&q=85',
  x_triplo_bacon: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=1200&q=85',

  // Frango em Cubos
  x_frango: 'https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=1200&q=85',
  x_frango_salada: 'https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=1200&q=85',
  x_frango_bacon: 'https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=1200&q=85',
  x_frango_bacon_salada: 'https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=1200&q=85',
  x_frango_catupiry: 'https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=1200&q=85',
  x_frango_cheddar: 'https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=1200&q=85',
  x_frango_tudo: 'https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=1200&q=85',

  // Hot Dogs
  dog_simples: 'https://images.unsplash.com/photo-1619740455993-9e612b1af08a?auto=format&fit=crop&w=1200&q=85',
  dog_vinagrete: 'https://images.unsplash.com/photo-1612392062631-94dd858cba88?auto=format&fit=crop&w=1200&q=85',
  dog_calabresa: 'https://images.unsplash.com/photo-1541214113241-21578d2d9b62?auto=format&fit=crop&w=1200&q=85',
  dog_bacon: 'https://images.unsplash.com/photo-1619740455993-9e612b1af08a?auto=format&fit=crop&w=1200&q=85',
  dog_frango: 'https://images.unsplash.com/photo-1612392062631-94dd858cba88?auto=format&fit=crop&w=1200&q=85',
  dog_tudo: 'https://images.unsplash.com/photo-1541214113241-21578d2d9b62?auto=format&fit=crop&w=1200&q=85',

  // Combos
  combo_individual: 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=1200&q=85',
  combo_dogs: 'https://images.unsplash.com/photo-1619740455993-9e612b1af08a?auto=format&fit=crop&w=1200&q=85',
  combo_dogs_5: 'https://images.unsplash.com/photo-1612392062631-94dd858cba88?auto=format&fit=crop&w=1200&q=85',
  combo_xtudo: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=1200&q=85',
  combo_xsalada: 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=1200&q=85',
  combo_xsalada_cheddar: 'https://images.unsplash.com/photo-1585238342024-78d387f4a707?auto=format&fit=crop&w=1200&q=85',
  combo_xbacon: 'https://images.unsplash.com/photo-1553979459-d2229ba7433b?auto=format&fit=crop&w=1200&q=85',
  combo_xbacon_cheddar: 'https://images.unsplash.com/photo-1585238342024-78d387f4a707?auto=format&fit=crop&w=1200&q=85',

  // Porções
  fritas: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=1200&q=85',
  fritas_cheddar: 'https://images.unsplash.com/photo-1585238342024-78d387f4a707?auto=format&fit=crop&w=1200&q=85',
  onion_rings: 'https://images.unsplash.com/photo-1541592106381-b31e9677c0e5?auto=format&fit=crop&w=1200&q=85',

  // Molhos & Adicionais
  molho_shaday: 'https://images.unsplash.com/photo-1582169296194-e4d644c48063?auto=format&fit=crop&w=1200&q=85',
  maionese_verde: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=85',
  add_bacon: 'https://images.unsplash.com/photo-1553979459-d2229ba7433b?auto=format&fit=crop&w=1200&q=85',
  add_burger: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=85',
  add_queijo: 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=1200&q=85',
  add_ovo: 'https://images.unsplash.com/photo-1561758033-d89a9ad46330?auto=format&fit=crop&w=1200&q=85',

  // Bebidas
  refrigerante_lata: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=1200&q=85',
  refrigerante_garrafa: 'https://images.unsplash.com/photo-1554866585-cd94860890b7?auto=format&fit=crop&w=1200&q=85',
  cerveja: 'https://images.unsplash.com/photo-1518176258769-f227c798150e?auto=format&fit=crop&w=1200&q=85',
  suco: 'https://images.unsplash.com/photo-1613478223719-2ab802602423?auto=format&fit=crop&w=1200&q=85',
  agua: 'https://images.unsplash.com/photo-1548839140-29a749e1bc4e?auto=format&fit=crop&w=1200&q=85'
};

const CATEGORIES = [
  {
    name: 'Combos da Galera',
    description: 'Combos promocionais econômicos com refrigerante e batata frita.',
    items: [
      { name: 'Combo Individual', desc: '1x Salada + Batata individual 50g + Coca-Cola Lata 350ml.', price: 30.00, img: IMAGES.combo_individual, featured: true },
      { name: 'Combo 1 (3 Dogs Tudo + Refri 2L)', desc: '3x Dogs Tudo no Pão de Burger + Refrigerante 2 Litros GRÁTIS!', price: 85.00, img: IMAGES.combo_dogs, featured: true },
      { name: 'Combo 2 (5 Dogs Simples + Refri 2L)', desc: '5x Dogs Simples no Pão de Burger + Refrigerante 2 Litros GRÁTIS!', price: 74.00, img: IMAGES.combo_dogs_5 },
      { name: 'Combo 3 (3 X-Tudo + Refri 2L)', desc: '3x X-Tudo completos + Refrigerante 2 Litros GRÁTIS!', price: 96.00, img: IMAGES.combo_xtudo, featured: true },
      { name: 'Combo 4 (2 X-Salada + Fritas + Refri 2L)', desc: '2x X-Salada + Batata Frita Simples + Refrigerante 2 Litros GRÁTIS!', price: 59.00, img: IMAGES.combo_xsalada },
      { name: 'Combo 5 (2 X-Salada + Fritas Cheddar Bacon + Refri 2L)', desc: '2x X-Salada + Batata com Cheddar e Bacon + Refrigerante 2 Litros GRÁTIS!', price: 64.00, img: IMAGES.combo_xsalada_cheddar },
      { name: 'Combo 6 (2 X-Bacon Salada + Fritas + Refri 2L)', desc: '2x X-Bacon Salada + Batata Frita Simples + Refrigerante 2 Litros GRÁTIS!', price: 69.00, img: IMAGES.combo_xbacon },
      { name: 'Combo 7 (2 X-Bacon Salada + Fritas Cheddar Bacon + Refri 2L)', desc: '2x X-Bacon Salada + Batata com Cheddar e Bacon + Refrigerante 2 Litros GRÁTIS!', price: 75.00, img: IMAGES.combo_xbacon_cheddar, featured: true }
    ]
  },
  {
    name: 'Artesanais Made in El Shaday',
    description: 'Hambúrgueres artesanais bovinos de 150g no pão brioche ou australiano.',
    items: [
      { name: 'EL Burger', desc: 'Pão de Brioche, Hambúrguer Artesanal 150g, Queijo Prato e Molho El Shaday.', price: 27.00, img: IMAGES.el_burger },
      { name: 'EL Salada', desc: 'Pão de Brioche, Hambúrguer Artesanal 150g, Queijo Prato, Alface, Tomate, Picles crocante, Cebola e Molho El Shaday.', price: 32.00, img: IMAGES.el_salada, featured: true },
      { name: 'EL Onion', desc: 'Pão Australiano, Hambúrguer Artesanal 150g, Cheddar cremoso, Cebola ao Molho Shoyu e Molho El Shaday.', price: 32.00, img: IMAGES.el_onion },
      { name: 'EL Barbecue', desc: 'Pão de Brioche, Hambúrguer Artesanal 150g, Queijo Prato, Cebola com Molho Barbecue, Bacon crocante e Molho El Shaday.', price: 34.00, img: IMAGES.el_barbecue },
      { name: 'EL Calabresa', desc: 'Pão de Brioche, Hambúrguer Artesanal 150g, Queijo Prato, Calabresa fatiada, Catupiry original e Molho El Shaday.', price: 32.00, img: IMAGES.el_calabresa },
      { name: 'EL Bacon', desc: 'Pão de Brioche, Hambúrguer Artesanal 150g, Creme de Cheddar, Queijo Prato, fatias de Bacon crocante e Molho El Shaday.', price: 36.00, img: IMAGES.el_bacon, featured: true },
      { name: 'EL Onion Cheddar Bacon', desc: 'Pão Australiano, Hambúrguer Artesanal 150g, Cheddar cremoso, Onion Rings crocantes e Molho El Shaday.', price: 36.00, img: IMAGES.el_onion_bacon },
      { name: 'EL Duplo Cheddar Bacon', desc: 'Pão de Brioche, 2x Hambúrguer Artesanal 150g (300g), Cheddar duplo, Queijo Prato, Bacon fatiado e Molho El Shaday.', price: 45.00, img: IMAGES.el_duplo, featured: true }
    ]
  },
  {
    name: 'Artesanais de Frango Empanado',
    description: 'Filé de frango empanado crocante de 100g no pão brioche dourado.',
    items: [
      { name: 'EL Chicken', desc: 'Pão de brioche, filé de frango empanado crocante, queijo prato e molho el shaday.', price: 28.00, img: IMAGES.el_chicken },
      { name: 'EL Chicken Salada', desc: 'Pão de brioche, filé de frango empanado, queijo prato, catupiry cremoso, alface, tomate, cebola crua e molho el shaday.', price: 31.00, img: IMAGES.el_chicken_salada },
      { name: 'EL Chicken Bacon', desc: 'Pão de brioche, filé de frango empanado 100g, queijo prato, bacon crocante, maionese de bacon artesanal e molho el shaday.', price: 32.00, img: IMAGES.el_chicken_bacon, featured: true },
      { name: 'EL Chicken Bacon Salada', desc: 'Pão de brioche, filé de frango empanado, queijo prato, bacon crocante, catupiry, alface, tomate, cebola crua e molho el shaday.', price: 34.00, img: IMAGES.el_chicken_bacon_salada },
      { name: 'EL Chicken Onion Bacon', desc: 'Pão de brioche, filé de frango empanado, queijo prato, bacon, molho barbecue, onion rings crocantes e molho el shaday.', price: 36.00, img: IMAGES.el_chicken_onion },
      { name: 'EL Chicken Duplo', desc: 'Pão de brioche, 2x Filé de Frango Empanado 100g, 2x Queijo Prato, 2x Bacon crocante e Molho El Shaday.', price: 44.00, img: IMAGES.el_chicken_duplo, featured: true }
    ]
  },
  {
    name: 'Hambúrgueres Tradicionais (90g)',
    description: 'Clássicos prensados na chapa bem quentinhos.',
    items: [
      { name: 'X-Burger', desc: 'Pão tradicional, hambúrguer bovino prensado, queijo prato derretido e molho El Shaday.', price: 18.00, img: IMAGES.x_burger },
      { name: 'X-Salada', desc: 'Pão tradicional, hambúrguer bovino, queijo prato derretido, alface fresca, tomate e molho El Shaday.', price: 21.00, img: IMAGES.x_salada },
      { name: 'X-Egg', desc: 'Pão tradicional, hambúrguer bovino, ovo frito no ponto, queijo prato e molho El Shaday.', price: 21.00, img: IMAGES.x_egg },
      { name: 'X-Egg Salada', desc: 'Pão tradicional, hambúrguer bovino, ovo frito, queijo prato, alface, tomate e molho El Shaday.', price: 23.00, img: IMAGES.x_egg_salada },
      { name: 'X-Bacon', desc: 'Pão tradicional, hambúrguer bovino, queijo prato derretido, tiras de bacon crocante e molho El Shaday.', price: 24.00, img: IMAGES.x_bacon },
      { name: 'X-Bacon Salada', desc: 'Pão tradicional, hambúrguer bovino, queijo prato, bacon crocante, alface, tomate e molho El Shaday.', price: 26.00, img: IMAGES.x_bacon_salada },
      { name: 'X-Egg Bacon', desc: 'Pão tradicional, hambúrguer bovino, ovo frito, queijo prato, bacon crocante e molho El Shaday.', price: 28.00, img: IMAGES.x_egg_bacon },
      { name: 'X-Egg Bacon Salada', desc: 'Pão tradicional, hambúrguer 90g, queijo prato, bacon, ovo frito, alface, tomate e molho El Shaday.', price: 30.00, img: IMAGES.x_egg_bacon_salada },
      { name: 'X-Veg (Vegetariano)', desc: 'Pão tradicional, cheddar cremoso, milho verde, batata palha fininha, alface crocante, tomate e molho El Shaday.', price: 26.00, img: IMAGES.x_veg },
      { name: 'X-Omelete (Vegetariano)', desc: 'Pão tradicional, omelete especial com 4 ovos, queijo prato, milho, batata palha, alface, tomate e molho El Shaday.', price: 28.00, img: IMAGES.x_omelete },
      { name: 'X-Triplo Burger Cheddar', desc: 'Pão tradicional, 3 hambúrgueres bovinos prensados, cheddar cremoso e molho El Shaday.', price: 32.00, img: IMAGES.x_triplo },
      { name: 'X-Duplo Bacon Salada', desc: 'Pão tradicional, 2 hambúrgueres 90g, 2 queijos prato, 2 porções de bacon, alface, tomate e molho El Shaday.', price: 32.00, img: IMAGES.x_duplo_salada },
      { name: 'X-Tudo', desc: 'Pão tradicional, hambúrguer, calabresa fatiada, bacon crocante, ovo frito, queijo prato, cheddar, alface e tomate.', price: 34.00, img: IMAGES.x_tudo, featured: true },
      { name: 'X-Triplo Burger Cheddar Bacon', desc: 'Pão tradicional, 3 hambúrgueres bovinos, cheddar abundante, bacon crocante e molho El Shaday.', price: 35.00, img: IMAGES.x_triplo_bacon }
    ]
  },
  {
    name: 'Hambúrgueres de Frango em Cubos',
    description: 'Filé de frango em cubos grelhado e temperado na chapa.',
    items: [
      { name: 'X-Frango', desc: 'Pão tradicional, frango em cubos grelhado, queijo prato derretido e molho El Shaday.', price: 22.00, img: IMAGES.x_frango },
      { name: 'X-Frango Salada', desc: 'Pão tradicional, frango em cubos grelhado, queijo prato, alface fresca, tomate e molho El Shaday.', price: 25.00, img: IMAGES.x_frango_salada },
      { name: 'X-Frango Bacon', desc: 'Pão tradicional, frango em cubos grelhado, tiras de bacon crocante, queijo prato e molho El Shaday.', price: 26.00, img: IMAGES.x_frango_bacon },
      { name: 'X-Frango Bacon Salada', desc: 'Pão tradicional, frango em cubos grelhado, bacon crocante, queijo prato, alface, tomate e molho El Shaday.', price: 27.00, img: IMAGES.x_frango_bacon_salada },
      { name: 'X-Frango Milho Catupiry Salada', desc: 'Pão tradicional, frango em cubos, queijo prato, Catupiry original legítimo, milho verde, alface, tomate e molho El Shaday.', price: 29.00, img: IMAGES.x_frango_catupiry, featured: true },
      { name: 'X-Frango Cheddar Bacon Salada', desc: 'Pão tradicional, frango em cubos, queijo prato, Cheddar cremoso, tiras de bacon, alface, tomate e molho El Shaday.', price: 30.00, img: IMAGES.x_frango_cheddar },
      { name: 'X-Frango Tudo', desc: 'Pão tradicional, frango em cubos grelhado, queijo prato, bacon crocante, calabresa, milho, alface, tomate e molho El Shaday.', price: 36.00, img: IMAGES.x_frango_tudo, featured: true }
    ]
  },
  {
    name: 'Hot Dogs (Pão de Burger)',
    description: 'Todos os nossos Hot Dogs são montados com todo capricho no Pão de Hambúrguer.',
    items: [
      { name: 'Dog Simples', desc: 'Pão de hambúrguer, 2 salsichas selecionadas, batata palha fininha, milho, ketchup, mostarda e molho El Shaday.', price: 16.00, img: IMAGES.dog_simples },
      { name: 'Dog Vinagrete', desc: 'Pão de hambúrguer, 2 salsichas, batata palha, milho, vinagrete caseiro fresco, ketchup, mostarda e molho El Shaday.', price: 21.00, img: IMAGES.dog_vinagrete },
      { name: 'Dog Calabresa', desc: 'Pão de hambúrguer, 2 salsichas, batata palha, cheddar cremoso, calabresa fatiada na chapa, ketchup, mostarda e molho El Shaday.', price: 23.00, img: IMAGES.dog_calabresa },
      { name: 'Dog Bacon', desc: 'Pão de hambúrguer, 2 salsichas, cheddar cremoso, fatias de bacon crocante, batata palha, ketchup, mostarda e molho El Shaday.', price: 24.00, img: IMAGES.dog_bacon, featured: true },
      { name: 'Dog Frango', desc: 'Pão de hambúrguer, 2 salsichas, batata palha, cheddar cremoso, frango em cubos grelhado, ketchup, mostarda e molho El Shaday.', price: 26.00, img: IMAGES.dog_frango },
      { name: 'Dog Tudo', desc: 'Pão de hambúrguer, 2 salsichas, fatias de bacon, calabresa, vinagrete caseiro, batata palha, cheddar, ketchup, mostarda e molho El Shaday.', price: 32.00, img: IMAGES.dog_tudo, featured: true }
    ]
  },
  {
    name: 'Porções Crocantes',
    description: 'Batatas fritas e anéis de cebola sequinhos e crocantes.',
    items: [
      { name: 'Batata Frita Simples (120g)', desc: 'Batatas fritas sequinhas e crocantes (porção individual 120g).', price: 10.00, img: IMAGES.fritas },
      { name: 'Batata Frita Simples (250g)', desc: 'Porção média de batatas fritas crocantes e douradas (250g).', price: 20.00, img: IMAGES.fritas },
      { name: 'Batata Frita c/ Cheddar e Bacon (120g)', desc: 'Batata frita crocante 120g coberta com cheddar cremoso (ou queijo prato) e bacon crocante (ou calabresa).', price: 15.00, img: IMAGES.fritas_cheddar },
      { name: 'Batata Frita c/ Cheddar e Bacon (250g)', desc: 'Batata frita crocante 250g com generosa cobertura de cheddar cremoso e bacon crocante.', price: 30.00, img: IMAGES.fritas_cheddar, featured: true },
      { name: 'Batata Frita c/ Cheddar e Bacon (500g)', desc: 'Porção família 500g de batatas crocantes com muito cheddar e bacon crocante abundante.', price: 45.00, img: IMAGES.fritas_cheddar, featured: true },
      { name: 'Onion Rings Crocantes (6 unidades)', desc: '6 anéis de cebola selecionados empanados e super crocantes.', price: 10.00, img: IMAGES.onion_rings },
      { name: 'Onion Rings Crocantes (12 unidades)', desc: '12 anéis de cebola dourados e crocantes para petiscar.', price: 18.00, img: IMAGES.onion_rings }
    ]
  },
  {
    name: 'Molhos Especiais da Casa',
    description: 'Potes individuais com nossas receitas exclusivas de molho.',
    items: [
      { name: 'Molho Especial El Shaday (Pote)', desc: 'Pote individual com a clássica receita secreta do molho El Shaday.', price: 1.50, img: IMAGES.molho_shaday },
      { name: 'Maionese Verde Artesanal (Pote)', desc: 'Pote individual de maionese verde artesanal cremosa com tempero verde especial.', price: 1.50, img: IMAGES.maionese_verde }
    ]
  },
  {
    name: 'Bebidas Geladas',
    description: 'Refrigerantes, cervejas, sucos e água bem geladinhos.',
    items: [
      { name: 'Coca-Cola Lata 350ml', desc: 'Lata 350ml trincando de gelada.', price: 8.00, img: IMAGES.refrigerante_lata },
      { name: 'Coca-Cola Zero Lata 350ml', desc: 'Lata 350ml sem açúcar gelada.', price: 8.00, img: IMAGES.refrigerante_lata },
      { name: 'Guaraná Antarctica Lata 350ml', desc: 'Lata 350ml gelada.', price: 8.00, img: IMAGES.refrigerante_lata },
      { name: 'Fanta Laranja / Sprite Lata 350ml', desc: 'Lata 350ml gelada.', price: 8.00, img: IMAGES.refrigerante_lata },
      { name: 'Cerveja Skol Lata 350ml', desc: 'Cerveja Skol geladíssima.', price: 7.00, img: IMAGES.cerveja },
      { name: 'Cerveja Antarctica Boa Lata 350ml', desc: 'Cerveja Antarctica Boa geladíssima.', price: 7.00, img: IMAGES.cerveja },
      { name: 'Coca-Cola Garrafa 1 Litro', desc: 'Garrafa 1 Litro gelada.', price: 12.00, img: IMAGES.refrigerante_garrafa },
      { name: 'Coca-Cola Zero Garrafa 1 Litro', desc: 'Garrafa 1 Litro sem açúcar gelada.', price: 12.00, img: IMAGES.refrigerante_garrafa },
      { name: 'Guaraná Antarctica Garrafa 1 Litro', desc: 'Garrafa 1 Litro gelada.', price: 12.00, img: IMAGES.refrigerante_garrafa },
      { name: 'Refrigerante Kuat 2 Litros', desc: 'Garrafa 2 Litros tamanho família gelada.', price: 12.00, img: IMAGES.refrigerante_garrafa },
      { name: 'Fanta Laranja / Sprite 2 Litros', desc: 'Garrafa 2 Litros tamanho família gelada.', price: 15.00, img: IMAGES.refrigerante_garrafa },
      { name: 'Coca-Cola Garrafa 2 Litros', desc: 'Garrafa 2 Litros tamanho família gelada.', price: 18.00, img: IMAGES.refrigerante_garrafa },
      { name: 'Suco Natural 450ml', desc: 'Garrafinha de suco 450ml gelada.', price: 8.00, img: IMAGES.suco },
      { name: 'Suco Natural 1 Litro', desc: 'Garrafa de suco 1 Litro gelada.', price: 12.00, img: IMAGES.suco },
      { name: 'Água Mineral sem Gás 510ml', desc: 'Garrafinha 510ml sem gás.', price: 3.00, img: IMAGES.agua },
      { name: 'Água Mineral com Gás 510ml', desc: 'Garrafinha 510ml com gás.', price: 6.00, img: IMAGES.agua }
    ]
  }
];

// 19 Adicionais / Acréscimos do Cardápio El Shaday
const MODIFIERS = [
  { name: 'Cebola', price: 1.50 },
  { name: 'Tomate', price: 2.00 },
  { name: 'Milho', price: 2.00 },
  { name: 'Alface', price: 2.00 },
  { name: 'Ovo frito', price: 3.00 },
  { name: 'Batata Palha', price: 3.00 },
  { name: 'Picles', price: 3.00 },
  { name: 'Queijo Prato', price: 5.00 },
  { name: 'Calabresa fatiada', price: 5.00 },
  { name: 'Cheddar cremoso', price: 5.00 },
  { name: 'Catupiry original', price: 5.00 },
  { name: 'Salsicha extra', price: 5.00 },
  { name: 'Onion Rings (anéis de cebola)', price: 5.00 },
  { name: 'Hambúrguer 90g tradicional', price: 6.00 },
  { name: 'Vinagrete caseiro', price: 6.00 },
  { name: 'Bacon crocante', price: 7.00 },
  { name: 'Frango em cubos', price: 7.00 },
  { name: 'Hambúrguer Artesanal 150g', price: 9.00 },
  { name: 'Filé de Frango Empanado 100g', price: 9.00 }
];

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log('=== ATUALIZANDO CARDÁPIO DA EL SHADAY HAMBURGUERIA ===\n');

  try {
    await client.query('BEGIN');

    // 1. Limpar produtos, categorias e modificadores antigos
    console.log('1. Removendo itens genéricos e placeholders antigos...');
    await client.query('DELETE FROM menu_modifiers WHERE store_id = $1', [STORE_ID]);
    await client.query('DELETE FROM menu_modifier_groups WHERE store_id = $1', [STORE_ID]);
    await client.query('DELETE FROM menu_items WHERE store_id = $1', [STORE_ID]);
    await client.query('DELETE FROM menu_categories WHERE store_id = $1', [STORE_ID]);

    // 2. Atualizar capa e descrição da loja
    console.log('2. Atualizando dados da loja e capa...');
    await client.query(`
      UPDATE stores 
      SET 
        description = 'Lanches artesanais, frango empanado, hot dogs e porções preparados com ingredientes selecionados em Botucatu.',
        updated_at = NOW()
      WHERE id = $1
    `, [STORE_ID]);

    await client.query(`
      UPDATE store_settings
      SET
        cover_url = 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=1200&q=85',
        updated_at = NOW()
      WHERE store_id = $1
    `, [STORE_ID]);

    // 3. Inserir Categorias e Itens
    console.log('3. Inserindo categorias e itens 100% fiéis ao PDF...');
    let totalItems = 0;
    const burgerItemIds = [];

    for (let cIdx = 0; cIdx < CATEGORIES.length; cIdx++) {
      const cat = CATEGORIES[cIdx];
      const catRes = await client.query(`
        INSERT INTO menu_categories (store_id, name, description, sort_order, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, true, NOW(), NOW())
        RETURNING id
      `, [STORE_ID, cat.name, cat.description, cIdx + 1]);

      const catId = catRes.rows[0].id;
      console.log(`  -> Categoria criada: [${cIdx + 1}] ${cat.name}`);

      for (let iIdx = 0; iIdx < cat.items.length; iIdx++) {
        const item = cat.items[iIdx];
        const isFeatured = item.featured || false;

        const itemRes = await client.query(`
          INSERT INTO menu_items (
            store_id, category_id, name, description, price, image_url, 
            is_featured, is_available, sort_order, tags, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, $9, NOW(), NOW())
          RETURNING id
        `, [
          STORE_ID,
          catId,
          item.name,
          item.desc,
          item.price,
          item.img,
          isFeatured,
          iIdx + 1,
          isFeatured ? ['Mais Vendido', 'Destaque'] : []
        ]);

        const itemId = itemRes.rows[0].id;
        totalItems++;

        // Se for burger ou hot dog, guardar para vincular adicionais
        if (cIdx >= 1 && cIdx <= 5) {
          burgerItemIds.push(itemId);
        }
      }
    }

    // 4. Inserir Grupo de Modificadores (Turbine seu Lanche) para lanches
    console.log(`\n4. Vinculando os 19 adicionais do PDF aos lanches e hot dogs...`);
    for (const itemId of burgerItemIds) {
      const grpRes = await client.query(`
        INSERT INTO menu_modifier_groups (
          store_id, menu_item_id, name, description, min_choices, max_choices, is_required, sort_order, created_at, updated_at
        )
        VALUES ($1, $2, 'Turbine seu Lanche (Adicionais)', 'Escolha adicionais para deixar seu lanche ainda mais completo', 0, 10, false, 1, NOW(), NOW())
        RETURNING id
      `, [STORE_ID, itemId]);

      const grpId = grpRes.rows[0].id;

      for (let mIdx = 0; mIdx < MODIFIERS.length; mIdx++) {
        const mod = MODIFIERS[mIdx];
        await client.query(`
          INSERT INTO menu_modifiers (
            store_id, group_id, name, price_delta, is_available, sort_order, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, true, $5, NOW(), NOW())
        `, [STORE_ID, grpId, mod.name, mod.price, mIdx + 1]);
      }
    }

    await client.query('COMMIT');
    console.log(`\n✅ SUCESSO ABSOLUTO! Inseridas ${CATEGORIES.length} categorias e ${totalItems} produtos com 100% de fotos e opcionais.`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro na transação:', err);
    throw err;
  } finally {
    await client.end();
  }
}

main().catch(console.error);
