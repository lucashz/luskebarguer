import net from 'node:net';
import tls from 'node:tls';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const TARGET_EMAIL = 'sup.tapronto@gmail.com';
const COMPANY_LEGAL_ID = 'TáPronto Tecnologia';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://cardapio:cardapio_dev_password@localhost:5432/cardapio?schema=public'
});

async function getSmtpSettings() {
  const result = await pool.query(
    'SELECT * FROM platform_smtp_settings WHERE is_active = true ORDER BY created_at DESC LIMIT 1'
  );
  if (!result.rows[0]) throw new Error('Nenhuma configuração SMTP ativa encontrada no banco.');
  const row = result.rows[0];
  const rawUsername = String(row.username || process.env.SMTP_USER || '');
  const safeUsername = rawUsername.includes('***') ? (row.from_email || process.env.SMTP_FROM_EMAIL || '') : rawUsername;
  return {
    host: row.host || process.env.SMTP_HOST || '',
    port: Number(row.port || process.env.SMTP_PORT || 587),
    username: safeUsername,
    password: row.password_token || process.env.SMTP_PASS || process.env.SMTP_TOKEN || '',
    from_email: row.from_email || process.env.SMTP_FROM_EMAIL || '',
    from_name: row.from_name || process.env.SMTP_FROM_NAME || 'TáPronto',
    reply_to: row.reply_to || process.env.SMTP_REPLY_TO || '',
    use_tls: row.use_tls !== false
  };
}

function renderEmailTemplate(text, variables = {}) {
  return String(text || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    return variables[key] !== undefined && variables[key] !== null ? String(variables[key]) : '';
  });
}

function emailEscapeHtml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function emailEscapeAttribute(value = '') {
  return emailEscapeHtml(value).replace(/`/g, '&#96;');
}

function linkifyEmailText(text = '') {
  return emailEscapeHtml(text)
    .replace(/\n/g, '<br>')
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#e11d2a;font-weight:700;">$1</a>');
}

function emailTextToHtml(text = '') {
  return String(text || '')
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="margin:0 0 16px;">${linkifyEmailText(paragraph)}</p>`)
    .join('');
}

function renderTransactionalEmailHtml({ subject, body, legalId }) {
  const title = emailEscapeHtml(subject || 'TáPronto');
  const content = emailTextToHtml(body || '');
  const firstUrl = String(body || '').match(/https?:\/\/[^\s)]+/i)?.[0] || '';
  const cta = firstUrl ? `
    <tr>
      <td style="padding:8px 30px 24px;">
        <a href="${emailEscapeAttribute(firstUrl)}" style="display:inline-block;background:#e11d2a;color:#ffffff;text-decoration:none;font-weight:700;border-radius:12px;padding:13px 18px;">Abrir no TáPronto</a>
      </td>
    </tr>` : '';
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${title}</title>
  </head>
  <body style="margin:0;background:#f4f6f8;color:#071326;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;color:transparent;">${emailEscapeHtml(String(body || '').split('\n').find(Boolean) || subject || 'TáPronto')}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #dde5ee;border-radius:20px;overflow:hidden;">
            <tr>
              <td style="padding:26px 30px 18px;border-left:5px solid #e11d2a;">
                <div style="font-size:13px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#e11d2a;">TáPronto</div>
                <h1 style="margin:8px 0 0;font-size:26px;line-height:1.18;color:#071326;">${title}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:0 30px 8px;font-size:16px;line-height:1.65;color:#24344d;">
                ${content}
              </td>
            </tr>
            ${cta}
            <tr>
              <td style="padding:20px 30px;background:#f8fafc;border-top:1px solid #e6edf5;color:#66758f;font-size:12px;line-height:1.5;">
                <strong style="color:#071326;">TáPronto</strong><br>
                Cardápio e pedidos para restaurantes.<br>
                ${emailEscapeHtml(legalId || '')}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function encodeMimeHeader(value) {
  const text = String(value || '');
  return /[^\x20-\x7E]/.test(text) ? `=?UTF-8?B?${Buffer.from(text).toString('base64')}?=` : text;
}

function encodeMailAddress(name, email) {
  return `${encodeMimeHeader(name)} <${email}>`;
}

function buildSmtpMessage({ to, subject, body, settings }) {
  const fromName = settings.from_name || 'Suporte TáPronto';
  const ehloDomain = process.env.SMTP_EHLO_DOMAIN || 'cardapio.local';
  const rawBody = String(body || '').replace(/\r\n/g, '\n').trimEnd();
  const bodyWithLegalId = rawBody.includes(COMPANY_LEGAL_ID) ? rawBody : `${rawBody}\n\n--\n${COMPANY_LEGAL_ID}`;
  const plainBody = bodyWithLegalId.replace(/\n/g, '\r\n');
  const htmlBody = renderTransactionalEmailHtml({ subject, body: rawBody, legalId: COMPANY_LEGAL_ID });
  const boundary = `tapronto_${randomUUID().replaceAll('-', '')}`;
  const headers = [
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${randomUUID()}@${ehloDomain}>`,
    `From: ${encodeMailAddress(fromName, settings.from_email)}`,
    `To: ${to}`,
    `Subject: ${encodeMimeHeader(subject)}`,
    `Reply-To: ${settings.reply_to || settings.from_email}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    'X-Mailer: TáPronto Test Script'
  ];
  const plainPart = [
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(plainBody, 'utf8').toString('base64')
  ].join('\r\n');
  const htmlPart = [
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(htmlBody, 'utf8').toString('base64')
  ].join('\r\n');
  return `${headers.join('\r\n')}\r\n\r\n${plainPart}\r\n${htmlPart}\r\n--${boundary}--\r\n`;
}

function smtpSend(settings, message, to) {
  const directTls = Number(settings.port) === 465;
  return new Promise((resolve, reject) => {
    let socket = directTls
      ? tls.connect({ host: settings.host, port: settings.port, servername: settings.host, rejectUnauthorized: false })
      : net.connect({ host: settings.host, port: settings.port });
    let buffer = '';
    let settled = false;
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error('Tempo esgotado no SMTP.'));
    }, 20000);
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket.destroy();
      if (error) reject(error);
      else resolve(true);
    };
    const upgradeToTls = () => new Promise((res, rej) => {
      const secureSocket = tls.connect({ socket, servername: settings.host, rejectUnauthorized: false });
      secureSocket.once('secureConnect', () => {
        socket = secureSocket;
        socket.once('error', finish);
        buffer = '';
        res();
      });
      secureSocket.once('error', rej);
    });
    const read = (expected) => new Promise((res, rej) => {
      const cleanup = () => {
        socket.off('data', onData);
        socket.off('error', onError);
      };
      const onError = (error) => { cleanup(); rej(error); };
      const onData = (chunk) => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split(/\r?\n/).filter(Boolean);
        const last = lines[lines.length - 1] || '';
        if (/^\d{3} /.test(last)) {
          cleanup();
          const code = Number(last.slice(0, 3));
          if (!expected.includes(code)) rej(new Error(`SMTP respondeu ${code}: ${last}`));
          else { buffer = ''; res(last); }
        }
      };
      socket.on('data', onData);
      socket.once('error', onError);
    });
    const write = (cmd) => socket.write(`${cmd}\r\n`);
    (async () => {
      await read([220]);
      write('EHLO cardapio.local');
      const ehlo = await read([250]);
      if (settings.use_tls && !directTls) {
        write('STARTTLS');
        await read([220]);
        await upgradeToTls();
        write('EHLO cardapio.local');
        await read([250]);
      }
      if (settings.username && settings.password) {
        write('AUTH LOGIN');
        await read([334]);
        write(Buffer.from(settings.username).toString('base64'));
        await read([334]);
        write(Buffer.from(settings.password).toString('base64'));
        await read([235]);
      }
      write(`MAIL FROM:<${settings.from_email}>`);
      await read([250]);
      write(`RCPT TO:<${to}>`);
      await read([250, 251]);
      write('DATA');
      await read([354]);
      socket.write(`${message}\r\n.\r\n`);
      await read([250]);
      write('QUIT');
      await read([221]);
      finish();
    })().catch(finish);
  });
}

const templates = [
  { key: 'assisted_account_ready', name: 'Cardápio assistido pronto', subject: 'Seu cardápio digital está pronto no TáPronto', body: 'Olá {{customer_name}},\n\nFinalizamos a montagem do cardápio da sua loja no TáPronto.\n\nConfira seu cardápio publicado:\n{{cardapio_url}}\n\nDefina sua senha para acessar o painel:\n{{activation_url}}\n\nSeu período de teste começa após a ativação da conta. Se precisar de ajuda, fale com nosso suporte:\n{{support_url}}' },
  { key: 'account_activation', name: 'Ativação de conta', subject: 'Ative sua conta no TáPronto', body: 'Olá {{customer_name}},\n\nSua conta no TáPronto foi criada com sucesso.\n\nPara liberar o acesso ao painel da sua loja, ative sua conta pelo link abaixo:\n{{activation_url}}\n\nEste link expira em {{due_date}}.\n\nSe você não solicitou esta conta, desconsidere este e-mail.' },
  { key: 'welcome', name: 'Boas-vindas', subject: 'Bem-vindo ao TáPronto', body: 'Olá {{customer_name}},\n\nSua loja foi cadastrada com sucesso no TáPronto.\n\nAcesse o painel para gerenciar produtos, pedidos e configurações:\n{{dashboard_url}}\n\nConte com o suporte TáPronto sempre que precisar.' },
  { key: 'password_recovery', name: 'Recuperação de senha', subject: 'Recupere sua senha de acesso', body: 'Olá {{customer_name}},\n\nRecebemos uma solicitação para redefinir a senha de acesso da sua conta.\n\nPara cadastrar uma nova senha, clique no link abaixo:\n{{reset_url}}\n\nEste link é válido até {{due_date}}.\n\nSe você não realizou esta solicitação, nenhuma ação é necessária.' },
  { key: 'onboarding_incomplete', name: 'Onboarding incompleto', subject: 'Conclua a configuração da sua loja no TáPronto', body: 'Olá {{customer_name}},\n\nA configuração da sua loja ainda não foi finalizada no TáPronto.\n\nConclua as etapas de horários, entrega e formas de pagamento para começar a receber pedidos:\n{{dashboard_url}}\n\nIsso ajuda sua operação a ficar pronta para receber clientes sem retrabalho.' },
  { key: 'first_product_reminder', name: 'Primeiro produto pendente', subject: 'Cadastre os primeiros produtos da sua loja', body: 'Olá {{customer_name}},\n\nSua loja está quase pronta para operar. O próximo passo é cadastrar seus produtos no cardápio.\n\nRecomendamos começar pelos itens mais vendidos do seu estabelecimento:\n{{dashboard_url}}\n\nSe precisar de ajuda nessa etapa, nosso suporte está à disposição.' },
  { key: 'publish_menu_reminder', name: 'Cardápio pronto para publicar', subject: 'Publique seu cardápio para começar a vender', body: 'Olá {{customer_name}},\n\nSeus produtos já foram cadastrados no TáPronto. Revise horários, entrega e pagamento para colocar o cardápio no ar:\n{{dashboard_url}}\n\nApós a publicação, você já poderá divulgar o link e receber pedidos.' },
  { key: 'first_order_reminder', name: 'Primeiro pedido teste', subject: 'Faça um pedido de teste no seu cardápio', body: 'Olá {{customer_name}},\n\nSeu cardápio digital já está publicado. Faça um pedido de teste pelo celular para conferir itens, entrega e opções de pagamento:\n{{cardapio_url}}\n\nAcompanhe a chegada do pedido em tempo real pelo painel:\n{{dashboard_url}}' },
  { key: 'inactive_store_checkin', name: 'Loja sem pedidos recentes', subject: 'Acompanhamento da sua operação no TáPronto', body: 'Olá {{customer_name}},\n\nNotamos que sua loja não registrou novos pedidos nos últimos dias no painel.\n\nSe você encontrou alguma dificuldade ou precisa de auxílio para divulgar o link, nossa equipe está à disposição:\n{{support_url}}\n\nAcesse seu painel para acompanhar a operação:\n{{dashboard_url}}' },
  { key: 'reengagement_no_login', name: 'Reengajamento sem acesso', subject: 'Seu cardápio digital está pronto para vender', body: 'Olá {{customer_name}},\n\nFaz alguns dias que você não acessa o painel da sua loja no TáPronto.\n\nSeu cardápio digital já está disponível. Acesse o painel para atualizar produtos, horários ou colocar sua operação no ar:\n{{dashboard_url}}\n\nSe precisar de ajuda com a configuração, fale com nosso suporte:\n{{support_url}}' },
  { key: 'store_published', name: 'Loja publicada', subject: 'Seu cardápio foi publicado com sucesso', body: 'Olá {{customer_name}},\n\nO cardápio digital da sua loja foi publicado com sucesso no TáPronto.\n\nVocê já pode compartilhar o link direto com seus clientes:\n{{cardapio_url}}\n\nAcompanhe a chegada dos pedidos em tempo real pelo painel:\n{{dashboard_url}}' },
  { key: 'first_order_received', name: 'Primeiro pedido recebido', subject: 'Você recebeu seu primeiro pedido no TáPronto', body: 'Olá {{customer_name}},\n\nSua loja acabou de receber o primeiro pedido pelo cardápio digital.\n\nPedido: {{order_id}}\nValor: {{order_total}}\n\nAcesse o painel para acompanhar o preparo e o despacho:\n{{dashboard_url}}' },
  { key: 'trial_ending', name: 'Trial acabando', subject: 'Seu período de teste no TáPronto termina em breve', body: 'Olá {{customer_name}},\n\nO período de teste do plano {{plan_name}} da sua loja termina em {{due_date}}.\n\nPara manter seu cardápio ativo e continuar recebendo pedidos sem interrupção, confirme sua assinatura no painel:\n{{payment_url}}\n\nSe precisar de orientações sobre planos, fale com nosso suporte:\n{{support_url}}' },
  { key: 'trial_last_chance', name: 'Última chance do trial', subject: 'Amanhã é o último dia do seu teste grátis', body: 'Olá {{customer_name}},\n\nSeu período de teste grátis do plano {{plan_name}} termina amanhã ({{due_date}}).\n\nApós essa data, o link do cardápio sairá do ar e o recebimento de pedidos será pausado. Para continuar atendendo sem interrupções, confirme seu plano no painel:\n{{payment_url}}\n\nSe tiver dúvidas sobre os planos, fale com nosso suporte:\n{{support_url}}' },
  { key: 'trial_expired', name: 'Trial encerrado', subject: 'Seu período de teste foi encerrado', body: 'Olá {{customer_name}},\n\nO período de teste da sua loja no TáPronto terminou.\n\nPara reativar seu cardápio, continuar recebendo pedidos e utilizar todos os recursos do painel, escolha um plano mensal:\n{{payment_url}}\n\nNossa equipe de suporte está à disposição para tirar qualquer dúvida.' },
  { key: 'payment_pending', name: 'Pagamento pendente', subject: 'Pagamento pendente do plano {{plan_name}}', body: 'Olá {{customer_name}},\n\nIdentificamos uma pendência no pagamento da assinatura do plano {{plan_name}}.\n\nRegularize a cobrança pelo painel para evitar o bloqueio do cardápio e dos recursos da sua loja:\n{{payment_url}}' },
  { key: 'payment_approved', name: 'Pagamento aprovado', subject: 'Pagamento aprovado do plano {{plan_name}}', body: 'Olá {{customer_name}},\n\nO pagamento do plano {{plan_name}} foi aprovado com sucesso.\n\nSua assinatura está ativa e todos os recursos já estão liberados no painel:\n{{dashboard_url}}' },
  { key: 'payment_refused', name: 'Pagamento recusado', subject: 'Não foi possível aprovar o pagamento do seu plano', body: 'Olá {{customer_name}},\n\nO pagamento da assinatura do plano {{plan_name}} não foi aprovado pela instituição financeira.\n\nConfira os dados informados ou escolha outra forma de pagamento pelo painel:\n{{payment_url}}\n\nRegularize a cobrança para evitar interrupções no funcionamento da sua loja.' },
  { key: 'account_suspended', name: 'Conta suspensa', subject: 'Sua conta no TáPronto foi suspensa', body: 'Olá {{customer_name}},\n\nA conta da sua loja foi suspensa temporariamente por pendência na assinatura.\n\nAcesse o painel para regularizar sua situação ou entre em contato com nosso suporte:\n{{payment_url}}' },
  { key: 'account_reactivated', name: 'Conta reativada', subject: 'Sua conta no TáPronto foi reativada', body: 'Olá {{customer_name}},\n\nSua conta foi reativada com sucesso e sua loja já pode voltar a operar normalmente.\n\nAcesse o painel para conferir o status da sua assinatura:\n{{dashboard_url}}' },
  { key: 'support_replied', name: 'Suporte respondeu', subject: 'Resposta ao seu chamado de suporte', body: 'Olá {{customer_name}},\n\nA equipe de suporte respondeu ao seu chamado.\n\nAcompanhe a mensagem e dê continuidade ao atendimento pelo painel:\n{{support_url}}' },
  { key: 'support_ticket_closed', name: 'Chamado encerrado', subject: 'Chamado encerrado: {{ticket_subject}}', body: 'Olá {{customer_name}},\n\nO chamado "{{ticket_subject}}" foi concluído pela nossa equipe de suporte.\n\nSe ainda precisar de ajuda sobre este assunto, basta enviar uma nova mensagem pela central:\n{{support_url}}' },
  { key: 'account_created_not_published', name: 'Conta sem publicação', subject: 'Seu cardápio digital ainda não está publicado', body: 'Olá {{customer_name}},\n\nSua conta no TáPronto foi criada, mas seu cardápio digital ainda não está visível para os clientes.\n\nPublique sua loja para começar a divulgar o link e receber pedidos online:\n{{dashboard_url}}\n\nSe precisar de ajuda com os últimos detalhes, fale com nosso suporte:\n{{support_url}}' },
  { key: 'store_published_no_orders', name: 'Loja publicada sem pedidos', subject: 'Dicas para começar a receber pedidos no TáPronto', body: 'Olá {{customer_name}},\n\nSeu cardápio já está publicado, mas ainda não registramos pedidos recentes na sua loja.\n\nCompartilhe o link nas redes sociais e no WhatsApp do seu estabelecimento:\n{{cardapio_url}}\n\nAcesse o painel para conferir horários e produtos cadastrados:\n{{dashboard_url}}' },
  { key: 'plan_limit_warning', name: 'Limite do plano próximo', subject: 'Sua loja está próxima do limite do plano {{plan_name}}', body: 'Olá {{customer_name}},\n\nSua loja está próxima do limite de {{limit_name}} do plano {{plan_name}}.\n\nUso atual: {{usage_count}}\nLimite do plano: {{limit_value}}\n\nPara continuar recebendo clientes sem interrupção na operação, conheça os planos superiores:\n{{payment_url}}' },
  { key: 'plan_upgrade_suggestion', name: 'Sugestão de upgrade', subject: 'Opções de planos para o seu negócio', body: 'Olá {{customer_name}},\n\nPelo volume recente da sua operação, o plano {{plan_name}} pode estar limitando o crescimento do seu negócio.\n\nPlanos superiores oferecem limites maiores de produtos, pedidos, mesas e relatórios avançados.\n\nConheça as opções disponíveis no painel:\n{{payment_url}}' },
  { key: 'plan_changed', name: 'Plano alterado', subject: 'Plano alterado para {{plan_name}}', body: 'Olá {{customer_name}},\n\nO plano da sua loja foi alterado para {{plan_name}} com sucesso.\n\nOs limites e recursos contratados já estão disponíveis em sua conta:\n{{dashboard_url}}\n\nConsulte os detalhes da assinatura no painel financeiro.' },
  { key: 'cancellation_received', name: 'Cancelamento recebido', subject: 'Solicitação de cancelamento recebida', body: 'Olá {{customer_name}},\n\nRecebemos a solicitação de cancelamento da assinatura da sua loja.\n\nNossa equipe processará o pedido conforme os termos de serviço.\n\nSe a solicitação foi feita por engano ou se pudermos ajudar com algum ajuste operacional, fale conosco:\n{{support_url}}' },
  { key: 'satisfaction_survey', name: 'Pesquisa de satisfação', subject: 'Como foi sua experiência com o suporte TáPronto?', body: 'Olá {{customer_name}},\n\nQueremos saber como foi sua experiência com nosso atendimento recente.\n\nSe puder, avalie o suporte recebido em menos de um minuto:\n{{rating_url}}\n\nSua opinião nos ajuda a aprimorar nossos serviços constantemente.' },
  { key: 'referral_invite', name: 'Convite de indicação', subject: '{{customer_name}} indicou o TáPronto para você', body: 'Olá,\n\n{{customer_name}} recomendou o TáPronto para organizar o cardápio digital e os pedidos da sua loja.\n\nCrie sua conta em poucos minutos pelo link abaixo:\n{{referral_url}}\n\nAo contratar um plano, a indicação concede {{referral_reward}} em créditos para quem indicou.\n\nTáPronto - Cardápio digital e gestão de pedidos.' },
  { key: 'referral_received', name: 'Indicação cadastrada', subject: 'Nova indicação cadastrada no TáPronto', body: 'Olá {{customer_name}},\n\nUm novo estabelecimento se cadastrou no TáPronto através da sua indicação.\n\nIndicação: {{company_name}}\nCódigo utilizado: {{referral_code}}\n\nA recompensa será liberada assim que o primeiro pagamento de plano dessa loja for confirmado.' },
  { key: 'referral_reward_unlocked', name: 'Recompensa de indicação liberada', subject: 'Crédito de indicação liberado em sua conta', body: 'Olá {{customer_name}},\n\nA indicação da empresa {{company_name}} confirmou o primeiro pagamento de plano.\n\nLiberamos {{referral_reward}} de crédito para a sua conta.\n\nAcompanhe suas indicações e saldo de créditos pelo painel:\n{{dashboard_url}}' },
  { key: 'smtp_test', name: 'Teste SMTP', subject: 'Teste de envio SMTP do TáPronto', body: 'Olá {{customer_name}},\n\nEste é um disparo de validação do envio de e-mails da plataforma TáPronto.\n\nSe esta mensagem foi entregue corretamente, o serviço SMTP está operando normalmente.\n\nAcesse a central administrativa:\n{{platform_url}}' },
  { key: 'backup_failed', name: 'Backup falhou', subject: 'Alerta: falha na rotina de backup da plataforma', body: 'Alerta operacional do TáPronto.\n\nA rotina de backup do banco de dados falhou ou está atrasada.\n\nResumo da ocorrência: {{error_summary}}\nPeríodo: {{period}}\n\nAcesse a plataforma para verificar os diagnósticos de Saúde e Serviços:\n{{platform_url}}' },
  { key: 'webhook_failed', name: 'Webhook falhou', subject: 'Alerta: falha no processamento de webhook', body: 'Alerta operacional do TáPronto.\n\nOcorreu uma falha no processamento de webhook de integração.\n\nProvedor: {{provider}}\nEvento: {{event_id}}\nResumo: {{error_summary}}\n\nVerifique os logs e eventos financeiros na plataforma:\n{{platform_url}}' },
  { key: 'smtp_failed', name: 'SMTP com erro', subject: 'Alerta: erro no serviço de envio de e-mails', body: 'Alerta operacional do TáPronto.\n\nO serviço SMTP apresentou falha no envio ou no teste de entrega.\n\nResumo: {{error_summary}}\n\nAcesse o menu de Comunicação na plataforma para revisar as configurações:\n{{platform_url}}' },
  { key: 'internal_support_ticket_opened', name: 'Interno: novo chamado', subject: 'Novo chamado recebido: {{ticket_subject}}', body: 'Novo chamado registrado na Central TáPronto.\n\nCliente: {{company_name}}\nLoja: {{store_name}}\nCategoria: {{ticket_category}}\nPrioridade: {{ticket_priority}}\nAssunto: {{ticket_subject}}\nResumo: {{message_preview}}\n\nAcesse a fila de atendimento para responder ao cliente:\n{{support_url}}' },
  { key: 'internal_support_ticket_replied', name: 'Interno: cliente respondeu chamado', subject: 'Cliente respondeu chamado: {{ticket_subject}}', body: 'O cliente enviou uma resposta no chamado registrado na Central TáPronto.\n\nCliente: {{company_name}}\nLoja: {{store_name}}\nCategoria: {{ticket_category}}\nPrioridade: {{ticket_priority}}\nAssunto: {{ticket_subject}}\nResumo: {{message_preview}}\n\nAcesse a fila de atendimento:\n{{support_url}}' },
  { key: 'critical_support_ticket', name: 'Chamado crítico aberto', subject: 'Alerta: chamado crítico aberto no suporte', body: 'Um chamado com prioridade crítica foi registrado na plataforma.\n\nCliente: {{company_name}}\nLoja: {{store_name}}\nAssunto: {{ticket_subject}}\n\nAcesse a central de atendimento para tratar com prioridade:\n{{support_url}}' },
  { key: 'delinquent_support_ticket', name: 'Inadimplente abriu chamado', subject: 'Chamado aberto por cliente com pendência financeira', body: 'Um cliente com pendência financeira ativa abriu chamado de atendimento.\n\nCliente: {{company_name}}\nLoja: {{store_name}}\nPlano: {{plan_name}}\nAssunto: {{ticket_subject}}\n\nConsulte o histórico de cobrança e o atendimento na plataforma:\n{{support_url}}' },
  { key: 'internal_payment_refused', name: 'Interno: pagamento recusado', subject: 'Alerta comercial: pagamento de assinatura recusado', body: 'Alerta comercial do TáPronto.\n\nUm pagamento de assinatura foi recusado pela instituição financeira.\n\nCliente: {{company_name}}\nLoja: {{store_name}}\nPlano: {{plan_name}}\nResumo: {{error_summary}}\n\nVerifique a assinatura e os eventos do provedor na plataforma:\n{{platform_url}}' },
  { key: 'internal_account_suspended', name: 'Interno: conta suspensa', subject: 'Alerta comercial: conta de cliente suspensa', body: 'Alerta comercial do TáPronto.\n\nUma conta de cliente foi suspensa no sistema.\n\nCliente: {{company_name}}\nLoja: {{store_name}}\nPlano: {{plan_name}}\nResumo: {{error_summary}}\n\nConsulte os detalhes e o histórico do cliente na plataforma:\n{{platform_url}}' },
  { key: 'internal_trial_expiring', name: 'Interno: trial vencendo', subject: 'Alerta comercial: período de teste próximo do fim', body: 'Alerta comercial do TáPronto.\n\nO período de teste de um cliente está próximo do vencimento.\n\nCliente: {{company_name}}\nLoja: {{store_name}}\nPlano: {{plan_name}}\nVencimento: {{due_date}}\n\nAcesse a plataforma para orientar a contratação do plano:\n{{platform_url}}' },
  { key: 'internal_trial_expired', name: 'Interno: trial encerrado', subject: 'Alerta comercial: período de teste encerrado', body: 'Alerta comercial do TáPronto.\n\nO período de teste de um cliente terminou.\n\nCliente: {{company_name}}\nLoja: {{store_name}}\nPlano: {{plan_name}}\nVencimento: {{due_date}}\n\nVerifique se o cliente deve ser acionado ou convertido:\n{{platform_url}}' },
  { key: 'internal_plan_changed', name: 'Interno: plano alterado', subject: 'Alerta comercial: plano de cliente alterado', body: 'Alerta comercial do TáPronto.\n\nO plano de um cliente foi alterado.\n\nCliente: {{company_name}}\nLoja: {{store_name}}\nNovo plano: {{plan_name}}\nResumo: {{error_summary}}\n\nConfira os detalhes da assinatura e auditoria na plataforma:\n{{platform_url}}' },
  { key: 'sales_handoff_required', name: 'Vendas: intervenção humana necessária', subject: 'Alerta comercial: lead requer atendimento humano', body: 'A automação de vendas identificou uma conversa que requer intervenção de atendente.\n\nEstabelecimento: {{business_name}}\nTelefone: {{phone}}\nMensagem: {{question}}\nResumo: {{summary}}\nMotivo: {{reason}}\n\nAcesse a central de vendas para dar andamento ao contato:\n{{platform_url}}' }
];

const testVariables = {
  store_name: 'Pizzaria do Zé',
  company_name: 'Pizzaria do Zé Ltda',
  customer_name: 'Lucas',
  plan_name: 'Profissional',
  due_date: '14/10/2026',
  dashboard_url: 'https://app.taprontomenu.com.br/',
  reset_url: 'https://app.taprontomenu.com.br/redefinir-senha?token=exemplo-teste',
  payment_url: 'https://app.taprontomenu.com.br/?tab=plans',
  support_url: 'https://app.taprontomenu.com.br/?tab=support',
  cardapio_url: 'https://taprontomenu.com.br/pizzaria-do-ze',
  platform_url: 'https://central.taprontomenu.com.br/',
  activation_url: 'https://app.taprontomenu.com.br/ativar-conta?token=exemplo-teste',
  order_id: '#1084',
  order_total: 'R$ 78,50',
  ticket_subject: 'Dúvida sobre taxa de entrega por raio',
  ticket_category: 'Operação',
  ticket_priority: 'Alta',
  message_preview: 'Como faço para configurar entregas gratuitas acima de R$ 50?',
  error_summary: 'Timeout ao conectar com o serviço',
  period: '13/10/2026',
  provider: 'MercadoPago',
  event_id: 'evt_test_987654',
  limit_name: 'pedidos mensais',
  usage_count: '480',
  limit_value: '500',
  rating_url: 'https://app.taprontomenu.com.br/avaliacao/teste',
  referral_url: 'https://app.taprontomenu.com.br/cadastro?ref=ZE10',
  referral_reward: 'R$ 50,00',
  referral_code: 'ZE10',
  business_name: 'Pizzaria do Zé',
  phone: '(11) 98765-4321',
  question: 'Vocês atendem pizzaria delivery?',
  summary: 'Lead demonstrou interesse em cardápio online com delivery integrado.',
  reason: 'Dúvida comercial fora do fluxo automatizado.'
};

async function run() {
  console.log(`Carregando configuracoes SMTP para envio para ${TARGET_EMAIL}...`);
  const settings = await getSmtpSettings();
  console.log(`SMTP conectado: ${settings.host}:${settings.port} (from: ${settings.from_email})`);
  console.log(`Total de templates a enviar: ${templates.length}`);

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < templates.length; i++) {
    const t = templates[i];
    const subject = `[Teste ${i + 1}/${templates.length} - ${t.name}] ${renderEmailTemplate(t.subject, testVariables)}`;
    const body = renderEmailTemplate(t.body, testVariables);
    const message = buildSmtpMessage({ to: TARGET_EMAIL, subject, body, settings });

    try {
      await smtpSend(settings, message, TARGET_EMAIL);
      sent++;
      console.log(`[${sent}/${templates.length}] Enviado com sucesso: ${t.key} (${t.name})`);
    } catch (err) {
      failed++;
      console.error(`[FALHA] Erro ao enviar template ${t.key}: ${err.message}`);
    }

    // Intervalo de 600ms entre envios para evitar rate limit do provedor
    await new Promise((r) => setTimeout(r, 600));
  }

  console.log(`\nFinalizado! Total enviados: ${sent} | Falhas: ${failed}`);
  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(async (err) => {
  console.error('Erro fatal:', err);
  await pool.end().catch(() => {});
  process.exit(1);
});
