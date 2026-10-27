import { evolutionV2SalesConfig, evolutionV2Request } from '../src/lib/evolution-v2-sales.js';

try { process.loadEnvFile?.('.env'); } catch {}

const config = evolutionV2SalesConfig();

console.log('Querying Evolution API for recent chats and messages...');

try {
  const chats = await evolutionV2Request(`/chat/findChats/${encodeURIComponent(config.instance)}`, {
    method: 'GET'
  }, config);
  console.log(`Found ${Array.isArray(chats) ? chats.length : typeof chats} chats.`);
  if (Array.isArray(chats)) {
    // Sort by timestamp if available
    for (const c of chats.slice(0, 15)) {
      console.log(`Chat JID: ${c.id || c.remoteJid || c.jid} | Unread: ${c.unreadCount} | Name: ${c.name || c.pushName}`);
    }
  }
} catch (err) {
  console.error('Error fetching chats:', err.message);
}
