const candidateUrls = [
  // Gelo / Ice
  'https://images.unsplash.com/photo-1518057111178-44a106bad636?auto=format&fit=crop&w=1200&q=85',
  'https://images.unsplash.com/photo-1498654896293-37aacf113fd9?auto=format&fit=crop&w=1200&q=85',
  'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=1200&q=85',
  // Água mineral
  'https://images.unsplash.com/photo-1559839914-ba2ac5cb4901?auto=format&fit=crop&w=1200&q=85',
  'https://images.unsplash.com/photo-1523362628745-0c100150b504?auto=format&fit=crop&w=1200&q=85',
  // Batata frita
  'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=1200&q=85',
  'https://images.unsplash.com/photo-1630384060421-cb20d0e0649d?auto=format&fit=crop&w=1200&q=85',
  'https://images.unsplash.com/photo-1585109649139-366815a0d713?auto=format&fit=crop&w=1200&q=85',
  // Corona com limão
  'https://images.unsplash.com/photo-1608270114092-16e6d1c47df8?auto=format&fit=crop&w=1200&q=85',
  'https://images.unsplash.com/photo-1567696911980-2eed69a46042?auto=format&fit=crop&w=1200&q=85'
];

for (const url of candidateUrls) {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    console.log(res.status === 200 ? 'OK ' : 'ERR' + res.status, url.slice(28, 60));
  } catch (err) {
    console.error('FAIL', err.message);
  }
}

