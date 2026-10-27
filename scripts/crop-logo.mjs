import sharp from 'sharp';

async function main() {
  const size = 300;
  const radius = size / 2;
  const circleMask = Buffer.from(`
    <svg width="${size}" height="${size}">
      <circle cx="${radius}" cy="${radius}" r="${radius - 2}" fill="#ffffff" />
    </svg>
  `);

  await sharp('tools/el_shaday_raw_badge.png')
    .extract({ left: 10, top: 2, width: 145, height: 145 })
    .resize(size, size)
    .composite([{
      input: circleMask,
      blend: 'dest-in'
    }])
    .png()
    .toFile('tools/el_shaday_logo.png');

  console.log('Saved tools/el_shaday_logo.png!');
}

main().catch(console.error);
