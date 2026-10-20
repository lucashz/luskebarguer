import assert from 'node:assert/strict';
import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';
import {
  isCrawlerUserAgent,
  buildTrackedMenuUrl,
  trackOutreachLinkClick
} from '../src/lib/outreach-click-tracking.js';
import { buildOutreachMessage } from '../src/lib/outreach-message.js';

const pool = getLocalPool();

async function runSmoke() {
  console.log('--- STARTING OUTREACH CLICK TRACKING SMOKE ---');

  // 1. Test bot detection
  console.log('1. Testing User-Agent bot detection...');
  assert.equal(isCrawlerUserAgent('WhatsApp/2.21.12.21 i'), true, 'WhatsApp crawler must be detected');
  assert.equal(isCrawlerUserAgent('facebookexternalhit/1.1 (+https://www.facebook.com/externalhit_uatext.php)'), true, 'Facebook/Meta external hit must be detected');
  assert.equal(isCrawlerUserAgent('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'), true, 'Googlebot must be detected');
  assert.equal(isCrawlerUserAgent('curl/8.4.0'), true, 'Curl must be detected as crawler');

  const iphoneSafari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
  const androidChrome = 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.113 Mobile Safari/537.36';
  assert.equal(isCrawlerUserAgent(iphoneSafari), false, 'iPhone Safari is a human browser');
  assert.equal(isCrawlerUserAgent(androidChrome), false, 'Android Chrome is a human browser');
  console.log('✓ User-Agent bot crawler detection OK');

  // 2. Test URL building
  console.log('2. Testing tracked URL builder...');
  const testMenuUrl = 'https://taprontomenu.com.br/pastelaria-da-vila';
  const trackedUrl = buildTrackedMenuUrl({ menuUrl: testMenuUrl, leadId: 'lead-test-123' });
  assert.equal(trackedUrl, 'https://taprontomenu.com.br/pastelaria-da-vila?ref=wa&lid=lead-test-123');
  console.log('✓ Tracked URL builder OK:', trackedUrl);

  // 3. Test message generation
  console.log('3. Testing outreach message with tracking...');
  const msg = buildOutreachMessage({
    id: 'lead-test-123',
    business_name: 'Pastelaria da Vila',
    city: 'Horizontina',
    segment: 'Pastelaria',
    metadata: { menu_url: testMenuUrl }
  });
  assert.ok(msg.includes('👉 https://taprontomenu.com.br/pastelaria-da-vila?ref=wa&lid=lead-test-123'), 'Message must contain tracked link');
  console.log('✓ Outreach message with tracking link OK');

  // 4. End-to-end database tracking test
  console.log('4. Testing database tracking with mock lead...');
  const mockSlug = `smoke-click-${Date.now()}`;
  const mockLeadRes = await pool.query(
    `INSERT INTO sales_leads (business_name, phone, city, state, segment, source, stage, metadata)
     VALUES ($1, '5555999990000', 'Horizontina', 'RS', 'Lanchonete', 'google_outreach', 'awaiting_reply', $2::jsonb)
     RETURNING *`,
    [
      `Lead ${mockSlug}`,
      JSON.stringify({
        menu_slug: mockSlug,
        menu_url: `https://taprontomenu.com.br/${mockSlug}`
      })
    ]
  );
  const mockLead = mockLeadRes.rows[0];
  console.log('Created test lead:', mockLead.id);

  try {
    // 4.1 Crawler visit simulation
    console.log('4.1 Simulating crawler preview scrape (WhatsApp bot)...');
    const botResult = await trackOutreachLinkClick({
      leadId: mockLead.id,
      userAgent: 'WhatsApp/2.21.12.21 i',
      ip: '157.240.241.1',
      pool
    });
    assert.equal(botResult.ok, true);
    assert.equal(botResult.isBot, true);

    const leadAfterBot = (await pool.query('SELECT * FROM sales_leads WHERE id = $1', [mockLead.id])).rows[0];
    assert.equal(Boolean(leadAfterBot.metadata?.link_clicked), false, 'Bot visit must NOT mark lead as clicked');
    assert.equal(leadAfterBot.stage, 'awaiting_reply', 'Bot visit must NOT advance stage');
    console.log('✓ WhatsApp crawler correctly ignored without false positives');

    // 4.2 First real human click simulation
    console.log('4.2 Simulating real human click (mobile Chrome)...');
    const humanClick1 = await trackOutreachLinkClick({
      leadId: mockLead.id,
      userAgent: androidChrome,
      ip: '177.136.24.50',
      pool
    });
    assert.equal(humanClick1.ok, true);
    assert.equal(humanClick1.isBot, false);
    assert.equal(humanClick1.clicks, 1);
    assert.equal(humanClick1.menuUrl, `https://taprontomenu.com.br/${mockSlug}`);

    const leadAfterClick1 = (await pool.query('SELECT * FROM sales_leads WHERE id = $1', [mockLead.id])).rows[0];
    assert.equal(leadAfterClick1.metadata.link_clicked, true);
    assert.equal(leadAfterClick1.metadata.link_clicks, 1);
    assert.ok(leadAfterClick1.metadata.last_link_click_at, 'last_link_click_at must be populated');
    assert.equal(leadAfterClick1.stage, 'engaged', 'Stage must advance to engaged upon clicking');
    console.log('✓ First human click recorded successfully: stage advanced to engaged');

    // 4.3 Second human click simulation
    console.log('4.3 Simulating second human click...');
    const humanClick2 = await trackOutreachLinkClick({
      leadId: mockLead.id,
      userAgent: iphoneSafari,
      ip: '177.136.24.50',
      pool
    });
    assert.equal(humanClick2.ok, true);
    assert.equal(humanClick2.clicks, 2);

    const leadAfterClick2 = (await pool.query('SELECT * FROM sales_leads WHERE id = $1', [mockLead.id])).rows[0];
    assert.equal(leadAfterClick2.metadata.link_clicks, 2);
    console.log('✓ Second human click recorded: click_count = 2');

    // 4.4 Verify event in sales_automation_events
    const events = await pool.query(
      `SELECT * FROM sales_automation_events WHERE lead_id = $1 AND event_type = 'outreach_link_clicked' ORDER BY created_at ASC`,
      [mockLead.id]
    );
    assert.equal(events.rows.length, 2, 'Must have 2 click events recorded');
    console.log('✓ Events in sales_automation_events verified');
  } finally {
    // Cleanup
    await pool.query('DELETE FROM sales_automation_events WHERE lead_id = $1', [mockLead.id]);
    await pool.query('DELETE FROM sales_leads WHERE id = $1', [mockLead.id]);
    console.log('✓ Test lead cleaned up');
  }

  console.log('\n--- ALL CLICK TRACKING TESTS PASSED (OK) ---');
}

runSmoke()
  .catch((err) => {
    console.error('Smoke failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
