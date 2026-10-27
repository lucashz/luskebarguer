import { writeFile } from 'node:fs/promises';

const urls = {
  ice1: 'https://images.unsplash.com/photo-1563227812-0ea4c22e6cc8?auto=format&fit=crop&w=600&q=80',
  ice2: 'https://images.unsplash.com/photo-1541544741938-0af808871cc0?auto=format&fit=crop&w=600&q=80',
  ice3: 'https://images.unsplash.com/photo-1497534446932-c925b458314e?auto=format&fit=crop&w=600&q=80',
  ice4: 'https://images.unsplash.com/photo-1518057111178-44a106bad636?auto=format&fit=crop&w=600&q=80'
};

for (const [key, url] of Object.entries(urls)) {
  try {
    const res = await fetch(url);
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      await writeFile(`test-${key}.jpg`, buf);
      console.log(`Saved test-${key}.jpg, bytes: ${buf.length}`);
    } else {
      console.log(`ERR ${res.status} for ${key}`);
    }
  } catch (e) {
    console.error(e.message);
  }
}

