import { evolutionV2SalesConfig, evolutionV2Request } from '../src/lib/evolution-v2-sales.js';
try { process.loadEnvFile?.('.env'); } catch {}

const cfg = evolutionV2SalesConfig();

async function main() {
  const msgsRes = await evolutionV2Request(`/chat/findMessages/${cfg.instance}`, {
    method: 'POST',
    body: JSON.stringify({
      where: {
        key: {
          remoteJidAlt: '5514991555260@s.whatsapp.net'
        }
      },
      limit: 10
    })
  }, cfg);

  const messages = msgsRes?.messages?.records || [];
  console.log(`Found ${messages.length} messages:`);
  for (const m of messages.reverse()) {
    const fromMe = m.key?.fromMe ? 'ME' : 'THEM';
    const text = m.message?.conversation || m.message?.extendedTextMessage?.text || m.messageType;
    console.log(`[${fromMe}] ${new Date(Number(m.messageTimestamp) * 1000).toLocaleTimeString()}: ${text}`);
  }
}

main().catch(console.error);
