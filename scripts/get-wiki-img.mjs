const res = await fetch('https://commons.wikimedia.org/wiki/File:Ice_cubes.jpg', { headers: { 'User-Agent': 'Mozilla/5.0' } });
const html = await res.text();
const match = html.match(/https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/[^"']+\.jpg/g);
console.log('Match:', match?.[0]);

