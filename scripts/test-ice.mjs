const candidateIce = [
  'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=1200&q=85',
  'https://images.unsplash.com/photo-1517456793572-1d8efd6dc135?auto=format&fit=crop&w=1200&q=85',
  'https://images.unsplash.com/photo-1497534446932-c925b458314e?auto=format&fit=crop&w=1200&q=85',
  'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=1200&q=85'
];

for (const url of candidateIce) {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    console.log(res.status === 200 ? 'OK ' : 'ERR' + res.status, url.slice(28, 60));
  } catch (err) {
    console.error('FAIL', err.message);
  }
}

