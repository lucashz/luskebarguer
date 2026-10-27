import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');

try { process.loadEnvFile?.('.env'); } catch {}

// Banco curado de imagens Unsplash por categoria/palavra-chave
const FOOD_IMAGE_CATALOG = {
  // Lanches & Burgers
  burger_bacon: 'https://images.unsplash.com/photo-1553979459-d2229ba7433b?auto=format&fit=crop&w=1200&q=85',
  burger_smash: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=1200&q=85',
  burger_artesanal: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=85',
  burger_salada: 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=1200&q=85',
  burger_egg: 'https://images.unsplash.com/photo-1561758033-d89a9ad46330?auto=format&fit=crop&w=1200&q=85',
  burger_veg: 'https://images.unsplash.com/photo-1520072959219-c595dc870360?auto=format&fit=crop&w=1200&q=85',
  chicken_crispy: 'https://images.unsplash.com/photo-1625813506062-0aeb1d7a094b?auto=format&fit=crop&w=1200&q=85',
  chicken_cubos: 'https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=1200&q=85',

  // Hot Dogs
  hot_dog_classico: 'https://images.unsplash.com/photo-1619740455993-9e612b1af08a?auto=format&fit=crop&w=1200&q=85',
  hot_dog_tudo: 'https://images.unsplash.com/photo-1541214113241-21578d2d9b62?auto=format&fit=crop&w=1200&q=85',
  hot_dog_especial: 'https://images.unsplash.com/photo-1612392062631-94dd858cba88?auto=format&fit=crop&w=1200&q=85',

  // Porções
  batata_frita: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=1200&q=85',
  batata_cheddar_bacon: 'https://images.unsplash.com/photo-1585238342024-78d387f4a707?auto=format&fit=crop&w=1200&q=85',
  onion_rings: 'https://images.unsplash.com/photo-1541592106381-b31e9677c0e5?auto=format&fit=crop&w=1200&q=85',
  petiscos_frango: 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?auto=format&fit=crop&w=1200&q=85',

  // Pizzas
  pizza_calabresa: 'https://images.unsplash.com/photo-1628840042765-356cda07504e?auto=format&fit=crop&w=1200&q=85',
  pizza_queijo: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1200&q=85',
  pizza_margherita: 'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?auto=format&fit=crop&w=1200&q=85',

  // Marmitex & Refeições
  marmitex: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=1200&q=85',
  parmegiana: 'https://images.unsplash.com/photo-1600891964599-f61ba0e24092?auto=format&fit=crop&w=1200&q=85',

  // Bebidas
  refrigerante_lata: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=1200&q=85',
  refrigerante_garrafa: 'https://images.unsplash.com/photo-1554866585-cd94860890b7?auto=format&fit=crop&w=1200&q=85',
  cerveja: 'https://images.unsplash.com/photo-1518176258769-f227c798150e?auto=format&fit=crop&w=1200&q=85',
  suco: 'https://images.unsplash.com/photo-1613478223719-2ab802602423?auto=format&fit=crop&w=1200&q=85',
  agua: 'https://images.unsplash.com/photo-1548839140-29a749e1bc4e?auto=format&fit=crop&w=1200&q=85',

  // Molhos & Extras
  molho_especial: 'https://images.unsplash.com/photo-1582169296194-e4d644c48063?auto=format&fit=crop&w=1200&q=85',
  maionese_verde: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=85'
};

export function matchFoodImage(name = '', category = '') {
  const text = `${name} ${category}`.toLowerCase();

  // Bebidas
  if (/água|agua/i.test(text)) return FOOD_IMAGE_CATALOG.agua;
  if (/suco/i.test(text)) return FOOD_IMAGE_CATALOG.suco;
  if (/cerveja|skol|brahma|heineken|amstel|boa/i.test(text)) return FOOD_IMAGE_CATALOG.cerveja;
  if (/lata|350ml/i.test(text) && /coca|fanta|sprite|guaraná|guarana/i.test(text)) return FOOD_IMAGE_CATALOG.refrigerante_lata;
  if (/refrigerante|coca|fanta|sprite|guaraná|guarana|kuat|2l|1l|litro/i.test(text)) return FOOD_IMAGE_CATALOG.refrigerante_garrafa;

  // Porções
  if (/onion|anel|anéis/i.test(text)) return FOOD_IMAGE_CATALOG.onion_rings;
  if (/frita|batata/i.test(text) && /cheddar|bacon/i.test(text)) return FOOD_IMAGE_CATALOG.batata_cheddar_bacon;
  if (/frita|batata/i.test(text)) return FOOD_IMAGE_CATALOG.batata_frita;

  // Hot Dogs
  if (/dog|hot\s*dog/i.test(text)) {
    if (/tudo|completo|bacon/i.test(text)) return FOOD_IMAGE_CATALOG.hot_dog_tudo;
    return FOOD_IMAGE_CATALOG.hot_dog_classico;
  }

  // Frango
  if (/chicken|empanado|frango empanado/i.test(text)) return FOOD_IMAGE_CATALOG.chicken_crispy;
  if (/frango/i.test(text)) return FOOD_IMAGE_CATALOG.chicken_cubos;

  // Burgers
  if (/bacon/i.test(text)) return FOOD_IMAGE_CATALOG.burger_bacon;
  if (/duplo|triplo|smash|monstro/i.test(text)) return FOOD_IMAGE_CATALOG.burger_smash;
  if (/egg|ovo/i.test(text)) return FOOD_IMAGE_CATALOG.burger_egg;
  if (/veg|vegetariano|omelete/i.test(text)) return FOOD_IMAGE_CATALOG.burger_veg;
  if (/salada/i.test(text)) return FOOD_IMAGE_CATALOG.burger_salada;
  if (/burger|hamburguer|hambúrguer/i.test(text)) return FOOD_IMAGE_CATALOG.burger_artesanal;

  // Molhos
  if (/maionese verde/i.test(text)) return FOOD_IMAGE_CATALOG.maionese_verde;
  if (/molho/i.test(text)) return FOOD_IMAGE_CATALOG.molho_especial;

  // Fallback seguro de alta resolução
  return FOOD_IMAGE_CATALOG.burger_artesanal;
}

console.log('✓ Food Image Matcher carregado com sucesso!');
