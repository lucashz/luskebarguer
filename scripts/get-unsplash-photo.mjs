const res = await fetch('https://unsplash.com/photos/a-group-of-beer-bottles-sitting-on-top-of-ice-QZqR2n1t8f0');
const html = await res.text();
const match = html.match(/https:\/\/images\.unsplash\.com\/[^"?]+/g);
console.log('Matches:', [...new Set(match || [])].slice(0, 10));

