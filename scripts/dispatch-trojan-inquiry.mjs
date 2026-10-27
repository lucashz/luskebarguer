import pg from 'pg';
import {
  evolutionV2SalesConfig,
  getEvolutionV2ConnectionState,
  sendEvolutionV2SalesText
} from '../src/lib/evolution-v2-sales.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
});

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --------------------------------------------------------------------------
// MENSAGEM 1: INQUIRY NATURAL COM SPINTAX ANTI-BAN (Zero Links, 100% Humano)
// --------------------------------------------------------------------------
function assertValidStep1Message(text) {
  const forbiddenPatterns = [
    /https?:\/\//i,
    /tapronto/i,
    /card[aá]pio digital/i,
    /demonstra[çc][ãa]o/i,
    /comiss[ãa]o/i,
    /importa[çc][ãa]o autom[aá]tica/i,
    /sistema/i,
    /plataforma/i
  ];

  for (const pattern of forbiddenPatterns) {
    if (pattern.test(text)) {
      throw new Error(`[CRÍTICO: VIOLAÇÃO DA REGRA DE OUTREACH] Tentativa de enviar pitch/link no Passo 1! Padrão proibido detectado: ${pattern}. Mensagem barrada: "${text}"`);
    }
  }
}

function buildInquiryMessage(lead) {
  const segment = lead.segment || 'restaurante';
  const hour = new Date().getHours();
  const saudacao = hour >= 18 ? 'Boa noite' : (hour >= 12 ? 'Boa tarde' : 'Bom dia');

  if (segment === 'hamburgueria') {
    const copies = [
      `${saudacao}! Vocês tão atendendo delivery hoje pelo WhatsApp? O cardápio dos lanches com os valores é por aqui mesmo ou tem link?`,
      `${saudacao}, tudo bem por aí? Vocês tão entregando lanches agora pelo WhatsApp? Tem como me passar o cardápio com os preços?`,
      `Olá, ${saudacao.toLowerCase()}! Queria ver as opções de lanches e valores pra pedir delivery com vocês por aqui hoje, vocês têm cardápio?`
    ];
    return copies[Math.floor(Math.random() * copies.length)];
  }

  if (segment === 'pizzaria') {
    const copies = [
      `${saudacao}! Vocês tão atendendo delivery hoje pelo WhatsApp? Tem o cardápio das pizzas com os tamanhos e valores por aqui ou é por link?`,
      `${saudacao}, tudo bom? Vocês tão abertos pra entrega de pizza hoje pelo WhatsApp? Tem como ver os sabores e preços?`,
      `Olá, ${saudacao.toLowerCase()}! Queria dar uma olhada nos sabores de pizza e valores pra pedir por aqui hoje, vocês têm o cardápio?`
    ];
    return copies[Math.floor(Math.random() * copies.length)];
  }

  if (segment === 'bar' || segment === 'petiscaria') {
    const copies = [
      `${saudacao}! Vocês tão atendendo delivery ou retirada por aqui hoje? Tem o cardápio das porções e bebidas com valores?`,
      `${saudacao}, tudo bem? Tem como me passar o cardápio com as porções e preços de vocês por favor?`
    ];
    return copies[Math.floor(Math.random() * copies.length)];
  }

  // Segmento Geral / Marmitaria / Restaurante
  const copies = [
    `${saudacao}! Vocês atendem delivery hoje pelo WhatsApp? O cardápio com os valores é por aqui mesmo ou vocês têm link?`,
    `${saudacao}, tudo bem por aí? Vocês tão entregando por aqui hoje? Como faço pra ver o cardápio de vocês com os preços?`,
    `Olá, ${saudacao.toLowerCase()}! Vocês tão abertos pra delivery hoje? Tem como me enviar o cardápio com as opções por favor?`
  ];
  return copies[Math.floor(Math.random() * copies.length)];
}

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const turnArg = args.find(a => a.startsWith('--turn='))?.split('=')[1];
  const limitArg = args.find(a => a.startsWith('--limit='))?.split('=')[1];
  
  const currentHour = new Date().getHours();
  const targetTurn = turnArg || (currentHour < 15 ? 'manha' : 'noite');
  const limit = limitArg ? parseInt(limitArg, 10) : 20;

  console.log('================================================================');
  console.log(`  METODOLOGIA INQUIRY PERMISSIVO EM 3 PASSOS (TURNO: ${targetTurn.toUpperCase()}) `);
  console.log(`  Modo: ${isDryRun ? 'SIMULAÇÃO (DRY-RUN)' : 'PRODUÇÃO (DISPARO REAL)'}`);
  console.log('================================================================\n');

  const evoConfig = evolutionV2SalesConfig();
  if (!isDryRun) {
    const conn = await getEvolutionV2ConnectionState(evoConfig);
    if (!conn.connected) {
      throw new Error(`WhatsApp não está conectado na instância "${evoConfig.instance}". Estado: ${conn.state}`);
    }
    console.log(`✅ WhatsApp conectado na instância "${evoConfig.instance}".\n`);
  }

  // Selecionar leads preparados para o turno correspondente
  const leadsRes = await pool.query(`
    SELECT id, business_name, city, state, segment, phone, normalized_phone, metadata
    FROM sales_leads
    WHERE metadata->>'outreach_strategy' = 'ready_for_trojan_step1'
      AND (metadata->>'target_turn' = $1 OR $1 = 'all')
      AND last_contact_at IS NULL
      AND attempt_count = 0
    ORDER BY business_name ASC
    LIMIT $2
  `, [targetTurn, limit]);

  const leads = leadsRes.rows;
  console.log(`Carregados ${leads.length} alvos para o turno "${targetTurn}":\n`);

  if (leads.length === 0) {
    console.log('Nenhum lead pendente encontrado para este turno.');
    return;
  }

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const phone = lead.normalized_phone || lead.phone;
    const msg = buildInquiryMessage(lead);

    // TRAVA PROGRAMÁTICA OBRIGATÓRIA (Zero links/pitch no Passo 1)
    assertValidStep1Message(msg);

    console.log(`[${i + 1}/${leads.length}] Abordando: ${lead.business_name} (${phone}) - ${lead.city} [${lead.segment}]`);
    console.log(`    Mensagem: "${msg}"`);

    if (isDryRun) {
      console.log(`    [DRY-RUN] Mensagem validada com sucesso, envio ignorado.\n`);
      continue;
    }

    try {
      // 1. Criar ou buscar conversa
      let convRes = await pool.query(`
        SELECT id FROM sales_conversations WHERE lead_id = $1 LIMIT 1
      `, [lead.id]);
      
      let convId;
      if (convRes.rows.length === 0) {
        const newConv = await pool.query(`
          INSERT INTO sales_conversations (lead_id, status, created_at, updated_at)
          VALUES ($1, 'active', now(), now())
          RETURNING id
        `, [lead.id]);
        convId = newConv.rows[0].id;
      } else {
        convId = convRes.rows[0].id;
      }

      // 2. Disparar via Evolution API v2
      const sendRes = await sendEvolutionV2SalesText({ phone, text: msg }, evoConfig);

      // 3. Registrar mensagem na tabela sales_messages
      await pool.query(`
        INSERT INTO sales_messages (
          lead_id, conversation_id, provider_message_id, direction,
          body, status, requires_approval, approved_at, sent_at, metadata, created_at
        ) VALUES (
          $1, $2, $3, 'outbound',
          $4, 'sent', false, now(), now(),
          jsonb_build_object('kind', 'trojan_inquiry_step1', 'step', 1),
          now()
        ) ON CONFLICT (provider_message_id) DO NOTHING
      `, [lead.id, convId, sendRes.id, msg]);

      // 4. Atualizar lead com flag de Step 1
      await pool.query(`
        UPDATE sales_leads
        SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{outreach_strategy}', '"trojan_inquiry_step1"'::jsonb),
            attempt_count = attempt_count + 1,
            last_contact_at = now(),
            stage = 'contacted',
            updated_at = now()
        WHERE id = $1
      `, [lead.id]);

      console.log(`    ✓ Disparo realizado com sucesso! (ID: ${sendRes.id})\n`);
    } catch (err) {
      console.error(`    ❌ Erro ao enviar para ${lead.business_name}:`, err.message);
    }

    // Intervalo de segurança anti-ban entre disparos (14 a 22 segundos)
    if (i < leads.length - 1) {
      const wait = 14000 + Math.floor(Math.random() * 8000);
      console.log(`    ⏳ Aguardando ${(wait / 1000).toFixed(1)}s antes do próximo...\n`);
      await sleep(wait);
    }
  }

  console.log('🏁 Disparo do turno concluído com sucesso!');
}

main()
  .then(() => pool.end())
  .catch(err => {
    console.error('Erro fatal:', err);
    pool.end();
  });
