import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

const pool = getLocalPool();
const draft = await pool.query('SELECT * FROM assisted_menu_drafts WHERE registration_id = $1', ['def1ba95-4975-44de-abf9-2d53e251c0fd']);
console.log('Draft content:');
console.log('Categories count:', draft.rows[0].content.categories.length);
console.log('Categories:', draft.rows[0].content.categories.map(c => ({ name: c.name, itemsCount: c.items.length })));
console.log('Sample item:', draft.rows[0].content.categories[0].items[0]);
await pool.end();
