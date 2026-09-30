import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
const env = parseEnv(await readFile('/var/www/.env', 'utf8'));
if (!env.OPENAI_API_KEY) { console.log('Provider key missing'); process.exitCode = 1; }
else {
  for (const model of [env.OPENAI_IMAGE_MODEL || 'gpt-image-2', 'gpt-4.1-mini']) {
    const response = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`, { headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` }, signal: AbortSignal.timeout(15000) });
    console.log(`Model ${model}: HTTP ${response.status}`);
    if (!response.ok) process.exitCode = 1;
  }
}
