import { spawn } from 'node:child_process';
import { copyFile, stat } from 'node:fs/promises';
import path from 'node:path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const cardHtmlPath = 'C:\\Users\\Lucas\\.gemini\\antigravity\\brain\\b7486063-fad5-4939-8300-ddb985802228\\stop-beer-card.html';
const proposalHtmlPath = 'C:\\Users\\Lucas\\.gemini\\antigravity\\brain\\b7486063-fad5-4939-8300-ddb985802228\\stop-beer-proposal.html';

const artifactDir = 'C:\\Users\\Lucas\\.gemini\\antigravity\\brain\\b7486063-fad5-4939-8300-ddb985802228';
const workspaceDir = 'D:\\lsk';

async function runChrome(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(CHROME_PATH, args, { stdio: 'inherit' });
    p.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`Chrome exited with code ${code}`));
    });
    p.on('error', reject);
  });
}

async function main() {
  console.log('--- 1. RENDERIZANDO CARD PNG (1080x1350) ---');
  const cardPngArtifact = path.join(artifactDir, 'Stop_Beer_Apresentacao_Instagram.png');
  const cardPngWorkspace = path.join(workspaceDir, 'Stop_Beer_Apresentacao_Instagram.png');

  await runChrome([
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--window-size=1080,1350',
    `--screenshot=${cardPngArtifact}`,
    cardHtmlPath
  ]);
  await copyFile(cardPngArtifact, cardPngWorkspace);
  const cardStat = await stat(cardPngWorkspace);
  console.log(`Card PNG gerado com sucesso! Tamanho: ${(cardStat.size / 1024).toFixed(1)} KB`);

  console.log('\n--- 2. RENDERIZANDO PDF DA PROPOSTA COMERCIAL (A4) ---');
  const pdfArtifact = path.join(artifactDir, 'Proposta_Comercial_Stop_Beer_Horizontina.pdf');
  const pdfWorkspace = path.join(workspaceDir, 'Proposta_Comercial_Stop_Beer_Horizontina.pdf');

  await runChrome([
    '--headless=new',
    '--disable-gpu',
    '--no-pdf-header-footer',
    `--print-to-pdf=${pdfArtifact}`,
    proposalHtmlPath
  ]);
  await copyFile(pdfArtifact, pdfWorkspace);
  const pdfStat = await stat(pdfWorkspace);
  console.log(`PDF gerado com sucesso! Tamanho: ${(pdfStat.size / 1024).toFixed(1)} KB`);

  console.log('\n=== ARQUIVOS PALPÁVEIS GERADOS COM SUCESSO! ===');
  console.log('1. Imagem para o Instagram Direct:');
  console.log('   -> ' + cardPngWorkspace);
  console.log('2. PDF Executivo da Proposta Comercial:');
  console.log('   -> ' + pdfWorkspace);
}

main().catch(err => {
  console.error('Erro na renderização:', err);
  process.exit(1);
});
