export const BRAZIL_SMALL_CITY_TARGETS = Object.freeze([
  { city: 'Horizontina', state: 'RS', population: 19389 },
  { city: 'Três de Maio', state: 'RS', population: 24678 },
  { city: 'Tenente Portela', state: 'RS', population: 13264 },
  { city: 'Lagoa Vermelha', state: 'RS', population: 27722 },
  { city: 'Santo Cristo', state: 'RS', population: 14378 },
  { city: 'Tuparendi', state: 'RS', population: 8290 },
  { city: 'Ivaiporã', state: 'PR', population: 32720 },
  { city: 'Assis Chateaubriand', state: 'PR', population: 36317 },
  { city: 'Palotina', state: 'PR', population: 35011 },
  { city: 'Dois Córregos', state: 'SP', population: 27848 },
  { city: 'Torrinha', state: 'SP', population: 9335 },
  { city: 'Pederneiras', state: 'SP', population: 44330 },
  { city: 'São Bento do Sul', state: 'SC', population: 83815, disabled: true },
  { city: 'Ituporanga', state: 'SC', population: 25837 },
  { city: 'Braço do Norte', state: 'SC', population: 33773 },
  { city: 'Pomerode', state: 'SC', population: 34846 },
  { city: 'Maravilha', state: 'SC', population: 28620 },
  { city: 'Pinhalzinho', state: 'SC', population: 21217 }
].filter((row) => !row.disabled && row.population <= 55000));

export const OUTREACH_SEGMENTS = Object.freeze([
  'restaurante',
  'lanchonete',
  'hamburgueria',
  'pizzaria',
  'marmitaria',
  'padaria',
  'cafeteria',
  'açaiteria',
  'bar'
]);
