import { readFileSync, writeFileSync } from 'node:fs';

const filePath = 'D:/lsk/TáProntomenu.com.br/.worktrees/release-production-outreach-20261014/server.js';
let content = readFileSync(filePath, 'utf8');

const regex = /if\s*\(isAutomatedOutreachLead\(lead\)\)\s*\{[\r\n\s]*await\s*createOutreachEvent\(lead,\s*'inbound_received',\s*\{[\r\n\s]*message_id:\s*message\.id,\s*provider_message_id:\s*inbound\.providerMessageId\s*\|\|\s*null[\r\n\s]*\}\);[\r\n\s]*\}/;

const match = content.match(regex);
if (!match) {
  throw new Error('regex match not found in server.js');
}

const replacement = `${match[0]}
  if (['contacted', 'awaiting_reply', 'first_message_sent', 'scheduled'].includes(lead.stage)) {
    await dbRequest('PATCH', 'sales_leads', { id: \`eq.\${lead.id}\` }, {
      stage: 'engaged',
      updated_at: new Date().toISOString()
    }, ['Prefer: return=minimal']);
  }`;

content = content.replace(match[0], replacement);
writeFileSync(filePath, content, 'utf8');
console.log('Successfully patched server.js with regex match!');

