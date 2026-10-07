const response = await fetch('https://taprontomenu.com.br/api/orders/checkout?store=lsk-burguer', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ customer: { name: 'Teste Pagamento', phone: '11999999999', email: 'teste-pagamento@taprontomenu.com.br', document: '12345678901' }, fulfillment_method: 'pickup', payment_method: 'Pix online', payment_details: {}, coupon_code: '', notes: 'diagnostico', items: [{ id: 'a7b19916-1cc8-4e7a-a0e6-6e3abef65f62', quantity: 1, modifier_ids: [], notes: '' }] })
});
console.log(response.status, await response.text());
