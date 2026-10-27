import pg from 'pg';

async function main() {
  const client = new pg.Client({
    connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
  });
  await client.connect();

  console.log("================================================================");
  console.log("   AUDITORIA DE DUPLICADOS E SELEÇÃO DO LOTE DE MARMITARIAS     ");
  console.log("================================================================\n");

  // 1. Todas as marmitarias no banco
  const allMarmitarias = await client.query(`
    SELECT id, business_name, city, state, segment, phone, normalized_phone, stage, attempt_count, last_contact_at, metadata
    FROM sales_leads
    WHERE segment = 'marmitaria'
    ORDER BY city, business_name
  `);
  console.log(`Total de marmitarias cadastradas no DB: ${allMarmitarias.rows.length}`);

  // 2. Checar duplicados por telefone (raw phone ou normalized)
  const phoneMap = new Map();
  const duplicatePhones = [];
  for (const m of allMarmitarias.rows) {
    const raw = (m.phone || '').replace(/\D/g, '');
    const norm = (m.normalized_phone || '').replace(/\D/g, '');
    const key = norm || raw;
    if (!key) continue;

    if (phoneMap.has(key)) {
      duplicatePhones.push({ key, lead1: phoneMap.get(key), lead2: m });
    } else {
      phoneMap.set(key, m);
    }
  }

  console.log(`Duplicados por telefone em marmitarias: ${duplicatePhones.length}`);
  for (const d of duplicatePhones) {
    console.log(`⚠️ Telefone duplicado [${d.key}]:`);
    console.log(`   1: ${d.lead1.business_name} (${d.lead1.city}) - Stage: ${d.lead1.stage}`);
    console.log(`   2: ${d.lead2.business_name} (${d.lead2.city}) - Stage: ${d.lead2.stage}`);
  }

  // 3. Checar duplicados por nome fonético / limpo
  const nameMap = new Map();
  const duplicateNames = [];
  for (const m of allMarmitarias.rows) {
    const cleanName = m.business_name
      .toLowerCase()
      .replace(/marmitaria|restaurante|e|de|da|do|gourmet|delivery/gi, '')
      .replace(/[^a-z0-9]/g, '')
      .trim();

    const cityKey = `${cleanName}@${(m.city || '').toLowerCase()}`;
    if (cleanName.length > 3) {
      if (nameMap.has(cityKey)) {
        duplicateNames.push({ cleanName, city: m.city, lead1: nameMap.get(cityKey), lead2: m });
      } else {
        nameMap.set(cityKey, m);
      }
    }
  }

  console.log(`\nDuplicados por nome similar na mesma cidade: ${duplicateNames.length}`);
  for (const d of duplicateNames) {
    console.log(`⚠️ Nome similar [${d.cleanName}] em ${d.city}:`);
    console.log(`   1: ${d.lead1.business_name} (ID: ${d.lead1.id}) - Tel: ${d.lead1.phone}`);
    console.log(`   2: ${d.lead2.business_name} (ID: ${d.lead2.id}) - Tel: ${d.lead2.phone}`);
  }

  // 4. Checar marmitarias que já receberam mensagem no histórico
  const messagedIds = await client.query(`
    SELECT DISTINCT lead_id FROM sales_messages WHERE direction = 'outbound'
  `);
  const contactedSet = new Set(messagedIds.rows.map(r => r.lead_id));
  console.log(`\nLeads que já receberam mensagens no histórico: ${contactedSet.size}`);

  // 5. Filtrar Marmitarias 100% INTACTAS, SEM DUPLICADOS e PRONTAS
  const seenPhones = new Set();
  const seenNames = new Set();
  const pristineMarmitarias = [];

  for (const m of allMarmitarias.rows) {
    const raw = (m.phone || '').replace(/\D/g, '');
    const norm = (m.normalized_phone || '').replace(/\D/g, '');
    const phoneKey = norm || raw;

    // Se já foi contatado
    if (contactedSet.has(m.id) || m.attempt_count > 0 || m.last_contact_at !== null) {
      continue;
    }
    // Se está em estágio de descarte ou perda
    if (['discarded', 'lost', 'won', 'opted_out', 'awaiting_reply', 'engaged'].includes(m.stage)) {
      continue;
    }
    // Se não tem telefone válido
    if (!phoneKey || phoneKey.length < 10) {
      continue;
    }
    // Se telefone já visto nesta lista limpa
    if (seenPhones.has(phoneKey)) {
      continue;
    }

    const cleanName = m.business_name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (seenNames.has(cleanName)) {
      continue;
    }

    seenPhones.add(phoneKey);
    seenNames.add(cleanName);
    pristineMarmitarias.push(m);
  }

  console.log(`\n✅ Total de marmitarias 100% LIMPAS, ÚNICAS e NUNCA CONTATADAS: ${pristineMarmitarias.length}`);
  console.log("\nDistribuição por cidade:");
  const byCity = {};
  for (const m of pristineMarmitarias) {
    byCity[m.city || 'outra'] = (byCity[m.city || 'outra'] || 0) + 1;
  }
  console.table(byCity);

  console.log("\nLista completa das marmitarias prontas para o lote:");
  for (let i = 0; i < pristineMarmitarias.length; i++) {
    const m = pristineMarmitarias[i];
    console.log(`${(i+1).toString().padStart(2, ' ')}. [${m.city}] ${m.business_name} | Tel: ${m.phone} | ID: ${m.id}`);
  }

  await client.end();
}

main().catch(console.error);

