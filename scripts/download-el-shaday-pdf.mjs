import { writeFile } from 'node:fs/promises';
import { evolutionV2SalesConfig, evolutionV2Request } from '../src/lib/evolution-v2-sales.js';

try { process.loadEnvFile?.('.env'); } catch {}

const cfg = evolutionV2SalesConfig();

async function main() {
  console.log('Buscando mensagem com documento da El Shaday...');

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
  console.log(`Encontradas ${messages.length} mensagens para El Shaday.`);

  const docMsg = messages.find(m => m.messageType === 'documentMessage');
  if (!docMsg) {
    console.error('Nenhuma documentMessage encontrada nas 10 mais recentes!');
    console.log(JSON.stringify(messages, null, 2));
    return;
  }

  console.log('Mensagem encontrada:', docMsg.key.id, docMsg.message?.documentMessage?.fileName);

  // Baixar base64 com timeout estendido de 60 segundos
  console.log('Tentando baixar mídia via /chat/getBase64FromMediaMessage (timeout 60s)...');
  cfg.timeoutMs = 60000;
  try {
    const mediaRes = await evolutionV2Request(`/chat/getBase64FromMediaMessage/${cfg.instance}`, {
      method: 'POST',
      body: JSON.stringify({
        message: docMsg,
        convertToMp4: false
      })
    }, cfg);

    const base64 = mediaRes?.base64 || mediaRes?.media;
    if (base64) {
      console.log('Base64 obtido com sucesso! Tamanho:', base64.length);
      const cleanBase64 = base64.replace(/^data:[^;]+;base64,/, '');
      await writeFile('tools/el_shaday_cardapio.pdf', Buffer.from(cleanBase64, 'base64'));
      console.log('✓ PDF salvo em tools/el_shaday_cardapio.pdf');
      return;
    } else {
      console.log('Resposta sem base64 direto:', mediaRes);
    }
  } catch (err) {
    console.error('Erro ao chamar getBase64FromMediaMessage:', err.message);
  }
}

main().catch(console.error);
