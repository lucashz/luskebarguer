import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { buildOutreachPreview } from '../src/lib/outreach-preview.js';

async function main() {
  const tempDir = await mkdtemp(join(tmpdir(), 'real-preview-test-'));
  try {
    const lead = {
      id: 'test-lead-12345678',
      business_name: 'Pizzaria em Dois Córregos',
      segment: 'pizzaria',
      city: 'Dois Córregos',
      state: 'SP',
      metadata: {
        menu_url: 'https://taprontomenu.com.br/pizzaria-em-dois-corregos-rodizi',
        menu_slug: 'pizzaria-em-dois-corregos-rodizi'
      }
    };

    console.log('Testando captura de print real de:', lead.metadata.menu_url);
    const result = await buildOutreachPreview({
      lead,
      photos: [],
      outputDir: tempDir
    });

    console.log('Resultado da captura:', {
      visualSource: result.visualSource,
      desktopPath: result.desktopPath,
      mobilePath: result.mobilePath
    });

    assert.equal(result.visualSource, 'live_menu_print', 'Deveria ter usado live_menu_print');

    const desktopMeta = await sharp(result.desktopPath).metadata();
    assert.equal(desktopMeta.width, 1080);
    assert.equal(desktopMeta.height, 1350);

    const mobileMeta = await sharp(result.mobilePath).metadata();
    assert.equal(mobileMeta.width, 1080);
    assert.equal(mobileMeta.height, 1350);

    console.log('✅ TESTE DE PRINT REAL CONCLUÍDO COM SUCESSO! Dimensões 1080x1350 validadas.');
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((err) => {
  console.error('Falha no teste:', err);
  process.exit(1);
});

