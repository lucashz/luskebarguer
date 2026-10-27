import { execSync } from 'node:child_process';

const output = execSync('git grep "images.unsplash.com"', { encoding: 'utf8' });
const matches = output.match(/https:\/\/images\.unsplash\.com\/photo-[^"'` \n\\]+/g) || [];
const unique = [...new Set(matches)];

console.log(`Found ${unique.length} unique Unsplash URLs across repository:`);
for (const u of unique) {
  console.log(' -', u);
}

