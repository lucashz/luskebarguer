async function test() {
  const apiKey = 'b99ee681a32aafc2cc8376608494974676fd7d19363a60a0d4f6c7a650e9f062';
  const baseUrl = 'http://192.168.1.108:8080';

  // 1. Check whatsappNumbers for both formats
  const check = await fetch(`${baseUrl}/chat/whatsappNumbers/tapronto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: apiKey },
    body: JSON.stringify({ numbers: ['5514981921392', '551481921392'] })
  });
  console.log('Numbers check:', await check.json());

  // 2. Find chats
  const chatsRes = await fetch(`${baseUrl}/chat/findChats/tapronto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: apiKey },
    body: JSON.stringify({
      where: {
        id: {
          contains: '81921392'
        }
      }
    })
  });
  console.log('Chats search:', await chatsRes.json());

  // 3. Find messages for without 9th digit
  const jidWithout9 = '551481921392@s.whatsapp.net';
  const msgsRes = await fetch(`${baseUrl}/chat/findMessages/tapronto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: apiKey },
    body: JSON.stringify({
      where: {
        key: {
          remoteJid: jidWithout9
        }
      },
      limit: 50
    })
  });
  console.log('Messages without 9:', await msgsRes.json());
}

test().catch(console.error);

