import { evolutionV2SalesConfig, evolutionV2Request } from '../src/lib/evolution-v2-sales.js';

try { process.loadEnvFile?.('.env'); } catch {}
const c = evolutionV2SalesConfig();

async function deleteMsg(id, remoteJid) {
  try {
    const res = await evolutionV2Request('/chat/deleteMessageForEveryone/' + c.instance, {
      method: 'DELETE',
      body: JSON.stringify({ id, fromMe: true, remoteJid })
    }, c);
    return { ok: true, res };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

const targetPhones = [
  '5514997418696',
  '5514991888696',
  '5514998235011',
  '5514997387268',
  '5514999031870',
  '5514996809785',
  '5514998549413',
  '5514997975903',
  '5514997093836',
  '5514996359820'
];

async function main() {
  console.log('=== APAGANDO O DISPARO DUPLICADO DE HOJE (27/10) NAS 10 MARMITARIAS ===\n');

  for (const phone of targetPhones) {
    const remoteJid = phone + '@s.whatsapp.net';
    const res = await evolutionV2Request('/chat/findMessages/' + c.instance, {
      method: 'POST',
      body: JSON.stringify({
        where: { key: { remoteJid, fromMe: true } },
        limit: 15
      })
    }, c);

    const records = res.messages?.records || [];
    const todayMsgs = records.filter(m => {
      const d = new Date(m.messageTimestamp * 1000);
      return d.toISOString().startsWith('2026-10-27') && !m.key.deleted;
    });

    console.log(`[${phone}] Encontradas ${todayMsgs.length} mensagens ativas de hoje.`);
    for (const m of todayMsgs) {
      console.log(`  -> Apagando para todos: ${m.key.id} (${new Date(m.messageTimestamp * 1000).toLocaleTimeString('pt-BR')})`);
      const del = await deleteMsg(m.key.id, remoteJid);
      console.log(`     Status: ${del.ok ? '✓ DELETADA' : '❌ ERRO: ' + del.error}`);
      await new Promise(r => setTimeout(r, 600));
    }
  }

  console.log('\n=== CONCLUSÃO DA EXCLUSÃO DAS 10 MARMITARIAS ===');
}

main().catch(console.error);
