import { readFileSync, writeFileSync } from 'node:fs';

const filePath = 'D:/lsk/TáProntomenu.com.br/.worktrees/release-production-outreach-20261014/src/lib/evolution-v2-sales.js';
let content = readFileSync(filePath, 'utf8');

const newFunctions = `
export async function checkEvolutionV2WhatsappNumber({ phone }, config = evolutionV2SalesConfig(), fetchImpl = fetch) {
  const number = normalizePhone(phone);
  if (!/^55\\d{10,11}$/.test(number)) {
    return { exists: false, jid: null, number };
  }
  try {
    const data = await evolutionV2Request(\`/chat/whatsappNumbers/\${encodeURIComponent(config.instance)}\`, {
      method: 'POST',
      body: JSON.stringify({ numbers: [number] })
    }, config, fetchImpl);
    const row = Array.isArray(data) ? data[0] : (data?.numbers?.[0] || data);
    const exists = Boolean(row?.exists ?? row?.isBusiness ?? row?.jid);
    const jid = row?.jid ? String(row.jid) : (exists ? \`\${number}@s.whatsapp.net\` : null);
    return { exists, jid, number, name: row?.name || null };
  } catch (error) {
    return { exists: false, jid: null, number, error: error.message };
  }
}

export async function sendEvolutionV2Presence({ phone, presence = 'composing', delayMs = 4000 }, config = evolutionV2SalesConfig(), fetchImpl = fetch) {
  const number = normalizePhone(phone);
  if (!/^55\\d{10,11}$/.test(number)) return { ok: false };
  const safeDelay = Math.max(1000, Math.min(15000, Number(delayMs) || 4000));
  try {
    await evolutionV2Request(\`/chat/sendPresence/\${encodeURIComponent(config.instance)}\`, {
      method: 'POST',
      body: JSON.stringify({ number, presence: presence || 'composing', delay: safeDelay })
    }, config, fetchImpl);
  } catch {
    // Falhas no endpoint de presença não devem interromper o fluxo da mensagem
  }
  // Aguarda o delay localmente para simular o tempo de digitação natural antes do envio do texto
  await new Promise((resolve) => setTimeout(resolve, safeDelay));
  return { ok: true, presence, delayMs: safeDelay };
}
`;

const insertTarget = 'export async function setEvolutionV2SalesWebhook';
if (!content.includes(insertTarget)) {
  throw new Error('insertTarget not found in evolution-v2-sales.js');
}

content = content.replace(insertTarget, `${newFunctions.trim()}\n\n${insertTarget}`);
writeFileSync(filePath, content, 'utf8');
console.log('Successfully added checkEvolutionV2WhatsappNumber and sendEvolutionV2Presence to evolution-v2-sales.js!');

