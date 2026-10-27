import fs from 'node:fs';

const b64 = fs.readFileSync('C:\\Users\\Lucas\\.gemini\\antigravity\\brain\\b7486063-fad5-4939-8300-ddb985802228\\image-base64.txt', 'utf8');

const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>
</head>
<body class="bg-slate-950 p-4 flex flex-col items-center justify-center text-slate-100 font-sans">
  <div class="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col items-center text-center">
    <div class="relative w-full rounded-xl overflow-hidden border border-slate-800 bg-slate-950 shadow-inner mb-4 group">
      <img src="data:image/png;base64,${b64}" alt="Stop Beer Apresentação" class="w-full h-auto object-cover max-h-72">
      <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end justify-center p-3">
        <span class="text-xs font-bold text-amber-400 bg-black/60 px-2.5 py-1 rounded-full border border-amber-500/30 backdrop-blur-md">1080 x 1350 px • Alta Resolução</span>
      </div>
    </div>

    <h3 class="text-base font-bold text-white mb-1">Stop Beer • Card Oficial Instagram</h3>
    <p class="text-xs text-slate-400 mb-4">Pronto para enviar no Direct ou WhatsApp</p>

    <div class="flex flex-col sm:flex-row gap-2 w-full">
      <a download="Stop_Beer_Apresentacao_Instagram.png" href="data:image/png;base64,${b64}" class="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-xs transition shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
        Baixar Imagem (PNG)
      </a>
    </div>

    <div class="mt-3 pt-3 border-t border-slate-800/80 w-full text-[11px] text-slate-500 flex justify-between">
      <span>📁 Já copiado para <strong>Downloads</strong></span>
      <span>388 KB</span>
    </div>
  </div>
</body>
</html>`;

fs.writeFileSync('C:\\Users\\Lucas\\.gemini\\antigravity\\brain\\b7486063-fad5-4939-8300-ddb985802228\\download-card-widget.html', html, 'utf8');
console.log('Widget criado com sucesso!');

