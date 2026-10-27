import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { buildOutreachPreview } from '../src/lib/outreach-preview.js';

async function main() {
  const lead = {
    id: '0c9823dc-84cd-4271-9459-1c213b199eaf',
    business_name: 'Refúgio Gourmet & Refúgio do Café',
    city: 'Horizontina',
    state: 'RS',
    segment: 'restaurante',
    metadata: {
      menu_url: 'https://taprontomenu.com.br/refugio-gourmet',
      menu_slug: 'refugio-gourmet'
    }
  };

  const outputDir = path.resolve('artifacts/outreach/vip/refugio-gourmet');
  await mkdir(outputDir, { recursive: true });

  console.log('Gerando prévias visuais em alta resolução para Refúgio Gourmet...');
  console.log('URL ao vivo:', lead.metadata.menu_url);
  console.log('Diretório de destino:', outputDir);

  const preview = await buildOutreachPreview({
    lead,
    photos: [],
    outputDir
  });

  console.log('\nPrévias geradas:');
  console.log('Desktop:', preview.desktopPath);
  console.log('Mobile (Mockup):', preview.mobilePath);
  console.log('Visual source:', preview.visualSource);

  const desktopMeta = await sharp(preview.desktopPath).metadata();
  const mobileMeta = await sharp(preview.mobilePath).metadata();

  console.log('\nValidação de dimensões:');
  console.log(`Desktop: ${desktopMeta.width}x${desktopMeta.height} (${desktopMeta.format}, ${(desktopMeta.size / 1024).toFixed(1)} KB)`);
  console.log(`Mobile:  ${mobileMeta.width}x${mobileMeta.height} (${mobileMeta.format}, ${(mobileMeta.size / 1024).toFixed(1)} KB)`);

  if (desktopMeta.width !== 1080 || desktopMeta.height !== 1350) {
    throw new Error(`Desktop com dimensões incorretas: ${desktopMeta.width}x${desktopMeta.height}`);
  }
  if (mobileMeta.width !== 1080 || mobileMeta.height !== 1350) {
    throw new Error(`Mobile com dimensões incorretas: ${mobileMeta.width}x${mobileMeta.height}`);
  }

  console.log('\n✅ PRÉVIAS VISUAIS DE REFÚGIO GOURMET CONCLUÍDAS COM SUCESSO!');
}

main().catch((err) => {
  console.error('Falha ao gerar prévias:', err);
  process.exit(1);
});
