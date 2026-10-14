import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/platform.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/platform.css', import.meta.url), 'utf8');
const js = readFileSync(new URL('../public/platform-assisted-registration.js', import.meta.url), 'utf8');

assert.ok(html.includes('assistedWorkflowStatus') && html.includes('aria-live="polite"'));
for (const state of ['pending','attention','complete']) assert.ok(js.includes(`'${state}'`), `Estado visual ausente: ${state}`);
assert.match(css, /\.assisted-workspace[^}]*min-width:\s*0/);
assert.match(css, /\.assisted-editor[^}]*max-width:/);
assert.match(css, /\.assisted-editor[^}]*overflow-wrap:\s*anywhere/);
assert.match(css, /\.assisted-editor[^}]*button[^}]*min-height:\s*44px/);
assert.match(css, /@media\s*\(max-width:\s*760px\)[\s\S]*\.assisted-draft-item\s*\{[^}]*grid-template-columns:\s*1fr/);
assert.match(css, /@media\s*\(max-width:\s*380px\)/, 'A largura de 320/375 px precisa de ajuste específico.');
assert.match(css, /\.assisted-editor[^}]*input[^}]*max-width:\s*100%/);

assert.match(css, /\.assisted-question-progress[^}]*grid-template-columns:\s*repeat\(4/);
assert.match(css, /@media\s*\(max-width:\s*760px\)[\s\S]*\.assisted-question-progress/);
console.log('Assisted registration layout: OK');
