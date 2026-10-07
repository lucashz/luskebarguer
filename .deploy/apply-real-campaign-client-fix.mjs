import { readFile, writeFile } from 'node:fs/promises';

const path = '/var/www/server.js';
let source = (await readFile(path, 'utf8')).replaceAll('\r\n', '\n');
const replacements = [
  [
    "dbRequest('GET', 'company_subscriptions', {\n      select: '*',\n      company_id: companyFilter,\n      order: 'name.asc',",
    "dbRequest('GET', 'company_subscriptions', {\n      select: '*',\n      company_id: companyFilter,\n      order: 'created_at.desc',"
  ],
  [
    "dbRequest('GET', 'company_feature_overrides', {\n      select: '*',\n      company_id: companyFilter,\n      order: 'name.asc',",
    "dbRequest('GET', 'company_feature_overrides', {\n      select: '*',\n      company_id: companyFilter,\n      order: 'created_at.desc',"
  ],
  ["select: 'id,store_id,is_active',\n      store_id: storeFilter,", "select: 'id,store_id,is_available',\n      store_id: storeFilter,"],
  ["active_products_count: companyProducts.filter((item) => item.is_active !== false).length,", "active_products_count: companyProducts.filter((item) => item.is_available !== false).length,"]
];

for (const [before, after] of replacements) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`Esperava uma ocorrência, encontrei ${count}: ${before.slice(0, 70)}`);
  source = source.replace(before, after);
}

await writeFile(path, source);
console.log('Consultas da lista de clientes corrigidas.');
