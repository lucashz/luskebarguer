import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_STORE_ID = '74ad08e6-9fe3-4488-874d-e1c2cf23a672';
const DEMO_SLUG = 'cardapio';
const DEMO_NAME = 'Vitrine Gourmet';
const DEMO_LOGO_URL = '/assets/vitrine-gourmet-logo.svg';
const DEMO_FAVICON_URL = '/assets/vitrine-gourmet-favicon.svg';

const alwaysOpenHours = Object.fromEntries(
  ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    .map((day) => [day, { open: '00:00', close: '23:59', closed: false }])
);

const themeSettings = {
  primaryColor: '#b42318',
  secondaryColor: '#111827',
  backgroundColor: '#fff7ed',
  selectionColor: '#ffedd5',
  selectionTextColor: '#7f1d1d',
  buttonColor: '#b42318',
  buttonTextColor: '#ffffff'
};

const categories = [
  {
    name: 'Burgers Autorais',
    description: 'Receitas criadas para impressionar: pão macio, carnes suculentas, queijos derretidos e molhos da casa.',
    items: [
      {
        name: 'Smash Black Angus',
        description: 'Dois smash burgers de Angus prensados na chapa, cheddar duplo, cebola caramelizada lentamente e molho secreto levemente defumado.',
        price: 39.9,
        imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=85',
        tags: ['Mais pedido', 'Smash', 'Artesanal'],
        isFeatured: true
      },
      {
        name: 'Brie Bacon Jam',
        description: 'Burger alto e suculento, queijo brie cremoso, geleia artesanal de bacon, rúcula fresca e maionese de mostarda Dijon.',
        price: 44.9,
        imageUrl: 'https://images.unsplash.com/photo-1553979459-d2229ba7433b?auto=format&fit=crop&w=1200&q=85',
        tags: ['Premium', 'Bacon'],
        isFeatured: true
      },
      {
        name: 'Truffle Melt',
        description: 'Carne grelhada no ponto, mix de queijos derretidos, cogumelos salteados na manteiga e aioli trufado em pão brioche tostado.',
        price: 47.9,
        imageUrl: 'https://images.unsplash.com/photo-1594212699903-ec8a3eca50f5?auto=format&fit=crop&w=1200&q=85',
        tags: ['Especial', 'Trufado'],
        isFeatured: true
      },
      {
        name: 'Garden Crunch',
        description: 'Opção vegetariana com burger crocante de grão-de-bico, queijo prato, tomate confit, alface americana e molho verde da casa.',
        price: 34.9,
        imageUrl: 'https://images.unsplash.com/photo-1520072959219-c595dc870360?auto=format&fit=crop&w=1200&q=85',
        tags: ['Vegetariano'],
        isFeatured: false
      }
    ]
  },
  {
    name: 'Combos Irresistíveis',
    description: 'Burger, acompanhamento e bebida em combinações prontas para vender mais.',
    items: [
      {
        name: 'Combo Assinatura',
        description: 'Smash Black Angus, batata rústica com alecrim e refrigerante lata. O pedido perfeito para conhecer a casa.',
        price: 54.9,
        imageUrl: 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=1200&q=85',
        tags: ['Combo', 'Favorito'],
        isFeatured: true
      },
      {
        name: 'Combo Casal Burger Night',
        description: 'Dois burgers autorais, porção grande de fritas com cheddar e duas bebidas. Feito para dividir sem economizar sabor.',
        price: 96.9,
        imageUrl: 'https://images.unsplash.com/photo-1606755962773-d324e2dabd5f?auto=format&fit=crop&w=1200&q=85',
        tags: ['Para dois', 'Combo'],
        isFeatured: true
      },
      {
        name: 'Combo Família Vitrine Gourmet',
        description: 'Quatro burgers, duas porções, quatro bebidas e molhos extras. Uma experiência completa para a mesa toda.',
        price: 179.9,
        imageUrl: 'https://images.unsplash.com/photo-1610614819513-58e34989848b?auto=format&fit=crop&w=1200&q=85',
        tags: ['Família', 'Combo'],
        isFeatured: false
      }
    ]
  },
  {
    name: 'Entradas e Porções',
    description: 'Aperitivos crocantes e bem servidos para abrir o apetite ou dividir na mesa.',
    items: [
      {
        name: 'Batata Rústica Supreme',
        description: 'Batatas douradas por fora e macias por dentro, cheddar cremoso, bacon crocante, cebolinha e molho ranch artesanal.',
        price: 29.9,
        imageUrl: 'https://images.unsplash.com/photo-1630384060421-cb20d0e0649d?auto=format&fit=crop&w=1200&q=85',
        tags: ['Porção', 'Cheddar'],
        isFeatured: true
      },
      {
        name: 'Onion Rings Crocantes',
        description: 'Anéis de cebola empanados na hora, crocância intensa e molho barbecue defumado para mergulhar sem pressa.',
        price: 24.9,
        imageUrl: 'https://images.unsplash.com/photo-1639024471283-03518883512d?auto=format&fit=crop&w=1200&q=85',
        tags: ['Crocante'],
        isFeatured: false
      },
      {
        name: 'Chicken Bites Hot Honey',
        description: 'Cubos de frango crocantes, finalizados com mel picante e gergelim. Doce, apimentado e viciante.',
        price: 32.9,
        imageUrl: 'https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=1200&q=85',
        tags: ['Picante', 'Frango'],
        isFeatured: false
      }
    ]
  },
  {
    name: 'Bebidas Especiais',
    description: 'Clássicos gelados, refrescos e opções artesanais para acompanhar cada pedido.',
    items: [
      {
        name: 'Limonada Pink',
        description: 'Limão siciliano, frutas vermelhas e gelo em uma bebida fresca, vibrante e perfeita para cortar a gordura do burger.',
        price: 14.9,
        imageUrl: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=1200&q=85',
        tags: ['Refrescante'],
        isFeatured: true
      },
      {
        name: 'Milkshake de Baunilha',
        description: 'Sorvete cremoso batido com baunilha, chantilly e calda. Textura densa e sabor clássico de hamburgueria.',
        price: 22.9,
        imageUrl: 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=1200&q=85',
        tags: ['Gelado'],
        isFeatured: false
      },
      {
        name: 'Refrigerante Lata',
        description: 'Gelado no ponto certo. Escolha o sabor nas observações do pedido.',
        price: 7.9,
        imageUrl: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=1200&q=85',
        tags: ['Clássico'],
        isFeatured: false
      }
    ]
  },
  {
    name: 'Sobremesas',
    description: 'Final feliz com doces cremosos, quentes e memoráveis.',
    items: [
      {
        name: 'Brownie Vulcão',
        description: 'Brownie intenso de chocolate, casquinha crocante, centro macio e calda quente finalizada na hora.',
        price: 24.9,
        imageUrl: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=1200&q=85',
        tags: ['Chocolate'],
        isFeatured: true
      },
      {
        name: 'Cheesecake de Frutas Vermelhas',
        description: 'Creme leve de cream cheese, base amanteigada e calda artesanal de frutas vermelhas com acidez equilibrada.',
        price: 26.9,
        imageUrl: 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?auto=format&fit=crop&w=1200&q=85',
        tags: ['Doce'],
        isFeatured: false
      }
    ]
  }
];

async function main() {
  const existingDemo = await prisma.store.findUnique({ where: { slug: DEMO_SLUG } });
  const store = existingDemo
    || await prisma.store.findUnique({ where: { id: DEMO_STORE_ID } })
    || await prisma.store.findFirst({ where: { name: { contains: 'LSK', mode: 'insensitive' } }, orderBy: { createdAt: 'asc' } })
    || await prisma.store.findFirst({ orderBy: { createdAt: 'asc' } });

  if (!store) throw new Error('Nenhuma loja encontrada para configurar a demonstração.');

  await prisma.store.update({
    where: { id: store.id },
    data: {
      name: DEMO_NAME,
      slug: DEMO_SLUG,
      publicUrl: `/${DEMO_SLUG}`,
      description: 'Hamburgueria artesanal de demonstração, criada para apresentar uma experiência real de cardápio digital.',
      isActive: true
    }
  });

  await prisma.menuModifier.deleteMany({ where: { storeId: store.id } });
  await prisma.menuModifierGroup.deleteMany({ where: { storeId: store.id } });
  await prisma.menuItem.deleteMany({ where: { storeId: store.id } });
  await prisma.menuCategory.deleteMany({ where: { storeId: store.id } });

  const setting = await prisma.storeSetting.findFirst({ where: { storeId: store.id }, orderBy: { createdAt: 'asc' } });
  const settingData = {
    storeId: store.id,
    name: DEMO_NAME,
    slug: DEMO_SLUG,
    description: 'Burgers artesanais, combos e pedidos online sem fricção.',
    pageTitle: 'Vitrine Gourmet - demonstração TáPronto',
    faviconUrl: DEMO_FAVICON_URL,
    logoUrl: DEMO_LOGO_URL,
    isOpen: true,
    acceptsDelivery: true,
    acceptsPickup: true,
    deliveryFee: 5,
    minimumOrder: 20,
    paymentMethods: ['Pix', 'Cartão na entrega', 'Dinheiro'],
    businessHours: alwaysOpenHours,
    themeSettings,
    onboardingCompleted: true
  };
  if (setting) {
    await prisma.storeSetting.update({ where: { id: setting.id }, data: settingData });
  } else {
    await prisma.storeSetting.create({ data: settingData });
  }

  for (const [categoryIndex, category] of categories.entries()) {
    const createdCategory = await prisma.menuCategory.create({
      data: {
        storeId: store.id,
        name: category.name,
        description: category.description,
        sortOrder: (categoryIndex + 1) * 10,
        isActive: true
      }
    });
    for (const [itemIndex, item] of category.items.entries()) {
      await prisma.menuItem.create({
        data: {
          storeId: store.id,
          categoryId: createdCategory.id,
          name: item.name,
          description: item.description,
          price: item.price,
          imageUrl: item.imageUrl,
          tags: item.tags,
          isFeatured: item.isFeatured,
          isAvailable: true,
          sortOrder: (itemIndex + 1) * 10
        }
      });
    }
  }

  const summary = await prisma.store.findUnique({
    where: { id: store.id },
    include: {
      settings: true,
      categories: { include: { items: true }, orderBy: { sortOrder: 'asc' } }
    }
  });

  console.log(JSON.stringify({
    id: summary.id,
    name: summary.name,
    slug: summary.slug,
    publicUrl: summary.publicUrl,
    isOpen: summary.settings[0]?.isOpen,
    categories: summary.categories.length,
    items: summary.categories.reduce((total, category) => total + category.items.length, 0)
  }, null, 2));
}

main()
  .finally(async () => prisma.$disconnect());
