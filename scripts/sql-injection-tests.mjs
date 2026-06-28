const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';

const payloads = [
  {
    name: 'POST /api/orders rejeita id de item malformado',
    path: '/api/orders',
    options: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fulfillment_method: 'delivery',
        customer: { name: 'Cliente Teste SQLi', phone: '5599999999999' },
        address: {
          street: 'Rua Teste',
          number: '123',
          neighborhood: 'Centro',
          city: 'Cidade'
        },
        payment_method: 'Pix',
        items: [
          {
            id: '00000000-0000-4000-8000-000000000000),id.not.is.null',
            quantity: 1,
            modifier_ids: ['00000000-0000-4000-8000-000000000001),id.not.is.null']
          }
        ]
      })
    },
    allowedStatuses: [400, 401, 404, 422, 423]
  },
  {
    name: 'POST /api/coupons/preview rejeita id de item malformado',
    path: '/api/coupons/preview',
    options: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: 'TESTE',
        subtotal: 10,
        delivery_fee: 0,
        items: [
          { id: '00000000-0000-4000-8000-000000000000,or(id.not.is.null)', quantity: 1 }
        ]
      })
    },
    allowedStatuses: [400, 401, 404, 422]
  },
  {
    name: 'POST /api/payments/webhook sanitiza provider/transaction_id malformados',
    path: '/api/payments/webhook?provider=mock),or(provider.not.is.null)',
    options: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id: 'evt_1),or(id.not.is.null)',
        transaction_id: 'tx_1),or(payment_transaction_id.not.is.null)',
        status: 'paid',
        amount: 1
      })
    },
    allowedStatuses: [400, 401, 404, 422]
  }
];

let failures = 0;

for (const test of payloads) {
  const response = await fetch(`${BASE_URL}${test.path}`, test.options);
  const text = await response.text();
  const ok = test.allowedStatuses.includes(response.status);
  if (!ok || response.status >= 500) {
    failures += 1;
    console.error(`FAIL ${test.name}: HTTP ${response.status} ${text.slice(0, 300)}`);
  } else {
    console.log(`OK ${test.name}: HTTP ${response.status}`);
  }
}

if (failures) {
  process.exitCode = 1;
}
