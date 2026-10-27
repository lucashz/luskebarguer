import pg from 'pg';

try { process.loadEnvFile?.('.env'); } catch {}

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const storeId = '4ccc7239-6634-4134-846d-858449c84f54';
  const logoUrl = '/uploads/store/el-shaday-logo.png';

  await client.query(`
    UPDATE store_settings
    SET
      logo_url = $1,
      favicon_url = $1,
      updated_at = NOW()
    WHERE store_id = $2
  `, [logoUrl, storeId]);

  console.log('✅ Logo da El Shaday atualizada com sucesso em store_settings!');
  await client.end();
}

main().catch(console.error);
