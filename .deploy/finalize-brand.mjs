import { readFileSync, writeFileSync } from 'node:fs';

for (const file of ['public/styles.css', 'public/platform.css']) {
  const before = readFileSync(file, 'utf8');
  const after = before.replace(
    /(\.platform-redesign \.platform-sidebar-logo\s*\{[^}]*?border-radius:\s*9px;)(\s*})/s,
    (match, body, close) => body.includes('object-fit:') ? match : `${body}\n  object-fit: contain;${close}`
  );
  if (after !== before) writeFileSync(file, after);
}

{
  const file = 'public/platform.html';
  const before = readFileSync(file, 'utf8');
  const after = before.replace(/\/platform\.css\?v=[^"']+/, '/platform.css?v=20260921-brand');
  if (after !== before) writeFileSync(file, after);
}

{
  const file = 'server.js';
  const before = readFileSync(file, 'utf8');
  const after = before.replace("'/assets/tapronto-mark-2026.png?v=20260921',", "'/assets/tapronto-mark-2026.png',");
  if (after !== before) writeFileSync(file, after);
}
