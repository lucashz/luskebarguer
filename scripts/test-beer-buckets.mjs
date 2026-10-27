import { writeFile } from 'node:fs/promises';

const candidates = [
  'https://images.unsplash.com/photo-1571613316887-6f8d5cbf7ef7?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1527061011665-3652c757a4d4?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1543007630-9710e4a00a20?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1560512823-829485b8bf24?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1600565193348-f74bd3c7ccdf?auto=format&fit=crop&w=600&q=80'
];

for (let i = 0; i < candidates.length; i++) {
  try {
    const res = await fetch(candidates[i]);
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      await writeFile(`beer-${i + 1}.jpg`, buf);
      console.log(`Saved beer-${i + 1}.jpg, length: ${buf.length}`);
    }
  } catch (err) {}
}

