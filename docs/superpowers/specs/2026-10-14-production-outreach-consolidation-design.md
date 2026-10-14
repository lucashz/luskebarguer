# Consolidação do Outreach em Produção

## Objetivo

Transformar o estado atualmente fragmentado entre Git, servidor público e VM da Evolution em uma release reproduzível, sem perder as melhorias exclusivas que já estão em produção. Ao final, o site público deve continuar saudável, o código completo do outreach deve estar versionado em uma branch publicável e o worker deve estar instalado na VM em modo seguro.

## Estado de partida

- O servidor público executa a aplicação com sucesso, mas seu `HEAD` não representa todos os arquivos implantados.
- A branch local contém o outreach completo, mas seu histórico inclui três arquivos `.tar.gz` de aproximadamente 162 MB cada, bloqueados pelo GitHub.
- Produção possui alterações mais novas de cadastro assistido, suporte e segurança que não podem ser sobrescritas pela branch local.
- A VM `192.168.1.108` está acessível e a instância Evolution `tápronto` está conectada.
- O worker ainda não está instalado como serviço e não deve enviar mensagens enquanto qualquer dependência obrigatória estiver ausente.

## Estratégia de versionamento

Uma branch de release limpa será criada a partir do `origin/main`. O estado real e necessário da aplicação será reconstruído nessa branch sem transportar os objetos grandes do histórico problemático.

A consolidação usará três fontes, nesta ordem:

1. `origin/main`, como base auditável;
2. arquivos funcionais exclusivos do servidor público, para preservar o que já está em uso;
3. implementação local do outreach, somente para os componentes necessários e previamente testados.

Não serão versionados pacotes de deploy, backups, capturas de navegador, pesquisas manuais de leads, uploads privados, credenciais ou artefatos de demonstração.

## Conteúdo da release

A release deve conter:

- persistência, busca, qualificação e cotas do outreach;
- geração das prévias desktop e celular;
- envio idempotente de texto e duas imagens;
- suporte a mídia HTTPS ou base64 no adaptador Evolution, aceitando exatamente uma origem;
- bloqueios por opt-out, duplicidade, provedor, webhook, cota e atividade insuficiente;
- worker e comandos operacionais de status, pausa, retomada e execução única;
- métricas de prospecção na Central;
- migração do banco e documentação operacional;
- imagem Docker não-root e definição de serviço para a VM.

## Higiene e segurança

O `.gitignore` deve impedir novos commits de:

- `.deploy/*.tar.gz` e `.deploy/*.bundle`;
- diretórios temporários de navegadores;
- artefatos de auditoria e releases locais;
- chaves de recuperação e arquivos equivalentes;
- `.env` e outros arquivos contendo segredos reais.

A chave de recuperação encontrada nos pacotes antigos não será copiada para a nova branch. Nenhum valor secreto será impresso em logs, comandos de verificação ou commits.

## Publicação no servidor público

Antes de qualquer alteração serão criados backups do banco e dos arquivos substituídos. A publicação usará um manifesto explícito, nunca uma cópia irrestrita do workspace.

O servidor deve receber os componentes web, backend, migrações e bibliotecas consolidados. Depois da migração, a aplicação será reiniciada e validada por sintaxe, saúde HTTP, carregamento dos assets da Central e presença das rotas do outreach.

Se a verificação falhar, o serviço deve permanecer parado ou voltar ao backup conhecido, sem executar disparos.

## Publicação na VM

O worker será instalado separadamente da Evolution, em `/opt/tapronto-outreach`, executando como usuário não-root dentro do contêiner. Ele reutilizará a API Evolution acessível na rede local, mas não modificará os containers existentes da Evolution.

O acesso ao banco da aplicação deve ocorrer por um canal autenticado e restrito; o banco não será exposto publicamente. Credenciais serão gravadas apenas no arquivo de ambiente protegido da VM.

O serviço nascerá com `OUTREACH_AUTOMATION_ENABLED=false`. A ativação exige simultaneamente:

- banco acessível;
- Evolution conectada;
- webhook autenticado e saudável;
- chave Google configurada com cotas que impeçam cobrança;
- execução de teste no número pessoal;
- limite inicial de três contatos por dia.

Sem uma dessas condições, o deploy do código pode ser concluído, mas o serviço permanece desativado.

## Testes e aceitação

Antes do commit e de cada publicação devem passar:

- verificações de sintaxe dos arquivos executáveis;
- testes de schema, Google, qualificação, prévia, entrega, orquestração, métricas e política de envio;
- regressão do adaptador Evolution para URL e base64;
- validação do manifesto para garantir que segredos, backups e artefatos não entram na release;
- saúde pós-deploy da aplicação pública;
- status do worker na VM, comprovando que ele está instalado e desativado até a liberação controlada.

## Rollback

O rollback do servidor restaura o pacote de arquivos anterior e reinicia `cardapio.service`. O rollback da VM interrompe apenas o worker; a Evolution permanece intacta. Banco, eventos de auditoria, supressões e opt-outs nunca são apagados durante rollback.
