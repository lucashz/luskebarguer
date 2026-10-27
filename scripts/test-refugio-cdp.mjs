import path from 'node:path';
import { captureWithCDP } from './test-mobile-cdp.mjs';

async function main() {
  const url = 'https://taprontomenu.com.br/refugio-gourmet';
  const outDesktop = path.resolve('artifacts/refugio-desktop-cdp.png');
  const outMobile = path.resolve('artifacts/refugio-mobile-cdp.png');

  console.log('Capturando desktop Refúgio Gourmet...');
  await captureWithCDP({
    url,
    outputPath: outDesktop,
    width: 1080,
    height: 1350,
    isMobile: false
  });
  console.log('Desktop capturado com sucesso!');

  console.log('Capturando mobile Refúgio Gourmet...');
  await captureWithCDP({
    url,
    outputPath: outMobile,
    isMobile: true
  });
  console.log('Mobile capturado com sucesso!');
}

main().catch((err) => {
  console.error('Erro:', err);
  process.exit(1);
});
