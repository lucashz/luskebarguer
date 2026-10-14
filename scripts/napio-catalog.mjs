const closed = { open: '18:00', close: '22:00', closed: true };
const evening = { open: '18:00', close: '22:00', closed: false };

export const NAPIO_CATALOG = {
  store: {
    name: 'Nápio Lanches',
    slug: 'napio-lanches',
    description: 'Xis, porções, bifes e sanduíches em Horizontina.',
    address: 'Rua Dahne de Abreu, 980 - Horizontina/RS',
    page_title: 'Nápio Lanches | Horizontina',
    business_hours: {
      sunday: { ...closed },
      monday: { ...closed },
      tuesday: { ...closed },
      wednesday: { ...evening },
      thursday: { ...evening },
      friday: { ...evening },
      saturday: {
        open: '10:00',
        close: '22:00',
        closed: false,
        intervals: [
          { open: '10:00', close: '14:00' },
          { open: '18:00', close: '22:00' }
        ]
      }
    },
    theme_settings: {
      primaryColor: '#A6121D',
      secondaryColor: '#F5A000',
      backgroundColor: '#FFF8EA',
      buttonColor: '#A6121D',
      buttonTextColor: '#FFFFFF',
      selectionColor: '#7CB342',
      selectionTextColor: '#FFFFFF'
    }
  },
  assets: {
    logo: { source: 'NAPIO4.png', crop: { left: 29, top: 19, width: 210, height: 105 }, fit: 'contain' },
    cover: { source: 'NAPIO4.png', crop: { left: 0, top: 0, width: 951, height: 671 }, fit: 'cover' },
    xis: { source: 'NAPIO2.png', crop: { left: 13, top: 103, width: 80, height: 78 } },
    bife: { source: 'NAPIO1.png', crop: { left: 19, top: 18, width: 80, height: 76 } },
    picadao: { source: 'NAPIO1.png', crop: { left: 19, top: 401, width: 80, height: 77 } },
    polenta: { source: 'NAPIO1.png', crop: { left: 19, top: 594, width: 80, height: 76 } },
    batata: { source: 'NAPIO1.png', crop: { left: 19, top: 690, width: 80, height: 76 } },
    tilapia: { source: 'NAPIO2.png', crop: { left: 13, top: 7, width: 80, height: 77 } },
    sanduiche: { source: 'NAPIO2.png', crop: { left: 13, top: 103, width: 80, height: 78 } }
  },
  categories: [
    {
      name: 'Xis',
      items: [
        ['X Salada', 'Carne moída, queijo, ovo, milho, ervilha, salada, catchup e maionese.', 25],
        ['X da Casa', 'Carne moída, queijo, ovo, milho, ervilha, catchup e maionese.', 25],
        ['X Bacon', 'Bacon, queijo, ovo, milho, ervilha, catchup e maionese.', 28],
        ['X Frango', 'Frango, queijo, ovo, milho, ervilha, catchup e maionese.', 28],
        ['X Calabresa', 'Calabresa, queijo, ovo, milho, ervilha, salada, catchup e maionese.', 28],
        ['X Picanha', 'Picanha, queijo, ovo, milho, ervilha, catchup e maionese.', 30],
        ['X Cinco Estrelas', 'Picanha, bacon, calabresa, queijo, ovo, catchup e maionese.', 33],
        ['X Bombado', 'Picanha, bacon, calabresa, salame, queijo, ovo, milho, ervilha, catchup e maionese.', 38],
        ['X Atum', 'Atum, queijo, ovo, milho, ervilha, catchup e maionese.', 40],
        ['X Carcamano', 'Picanha, cebola, queijo, ovo, milho e ervilha.', 35],
        ['X Campeiro', 'Picanha, salame, queijo, ovo, milho, ervilha, catchup e maionese.', 35],
        ['X Safado', 'Picanha, bacon, queijo, ovo, milho, ervilha, catchup e maionese.', 35],
        ['X Fortalia', 'Bacon, salame, queijo, ovo batido, milho, ervilha, catchup e maionese.', 38],
        ['X Filé', 'Filé, queijo, ovo, milho, ervilha, salada, catchup e maionese.', 40]
      ].map(([name, description, price]) => ({ name, description, price, image_key: 'xis' }))
    },
    {
      name: 'Porções',
      items: [
        { name: 'Filé de tilápia, batata e polenta', description: '', price: 60, image_key: 'tilapia' },
        { name: 'Batata frita 500g', description: '', price: 25, image_key: 'batata' },
        { name: 'Polenta frita 400g', description: '', price: 20, image_key: 'polenta' },
        { name: 'Picadão moda da casa', description: 'Picanha, salame, queijo, ovo de codorna, pepino, azeitona, batata e polenta.', price: 90, image_key: 'picadao' },
        { name: 'Meio picadão', description: '', price: 50, image_key: 'picadao' }
      ]
    },
    {
      name: 'Bifes',
      items: [
        ['Bife da Casa', 'Bife, arroz, feijão, salada, ovo, queijo, batata e polenta.', 40],
        ['Bife a Cavalo', 'Bife, queijo, 2 ovos, arroz, salada, feijão, batata e polenta.', 40],
        ['Bife Acebolado', 'Bife, cebola, arroz, ovo, queijo, salada, feijão, batata e polenta.', 40],
        ['Bife Paraguaia', 'Bife, 2 queijos e batata.', 35]
      ].map(([name, description, price]) => ({ name, description, price, image_key: 'bife' }))
    },
    {
      name: 'Sanduíches',
      items: [
        ['Kanche Bilê', 'Picanha, ovo, queijo, salada, catchup e maionese.', 15],
        ['Da Casa', 'Presunto, ovo, queijo, salada, catchup e maionese.', 12],
        ['Torrada', 'Presunto, queijo, catchup e maionese.', 7]
      ].map(([name, description, price]) => ({ name, description, price, image_key: 'sanduiche' }))
    }
  ]
};
