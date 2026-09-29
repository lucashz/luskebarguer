# Operação do cadastro assistido

Este fluxo existe para que o cliente responda apenas o necessário e a equipe TáPronto monte o cadastro e o cardápio. Ele não substitui um CRM.

## Atendimento

1. O interessado chega pelo WhatsApp. O clique é contabilizado de forma anônima; não atribua um clique específico a um telefone.
2. Na Central, abra **Cadastros assistidos** e crie um registro manualmente.
3. Preencha contato, estabelecimento, operação, diagnóstico e CPF/CNPJ. Registre em “origem informada” aquilo que o cliente disser; esse campo é diferente da UTM técnica do anúncio.
4. Antes de continuar, confira duplicidades indicadas pela Central. Não crie outro registro para contornar o alerta.

## Recebimento e importação do cardápio

São aceitos texto colado, imagens JPG/PNG/WebP, PDF, CSV e planilhas XLSX. Arquivos com formato, tamanho ou assinatura incompatível devem ser recusados. Se a extração falhar, preserve o registro e tente novamente com um arquivo mais legível ou transcreva o conteúdo recebido.

O resultado importado é sempre um rascunho. Confira no mínimo:

- categorias e ordem;
- nome, descrição e preço de cada produto;
- variações e adicionais;
- itens ilegíveis, incompletos ou marcados para revisão.

Compare o original e o interpretado. A publicação só deve ser confirmada depois dessa revisão humana.

## Publicação e convite

Ao publicar, o sistema cria atomicamente empresa, loja, administrador, cardápio e assinatura em `pending_activation`. Se qualquer etapa falhar, a transação é revertida; corrija a causa e repita a publicação no mesmo registro. Não crie outro lead.

Depois da publicação, o sistema envia o e-mail de boas-vindas com o cardápio e um link temporário para criar a senha. Se o envio falhar, use **Reenviar ativação**. O reenvio invalida convites pendentes anteriores e nunca deve expor o token na tela, nos logs ou em mensagens manuais.

## Ativação, trial e assinatura

O cardápio permanece inativo e a assinatura permanece em `pending_activation` até o cliente criar a senha. Nesse momento, uma única transação:

- ativa o administrador e a loja;
- marca o cadastro assistido como ativado;
- inicia os 7 dias de teste grátis.

Uma cobrança ou assinatura ativa posterior é uma etapa separada do trial. Em caso de ativação interrompida, não altere estados diretamente no banco: confirme o status do convite e reenvie-o ou investigue o erro antes de nova tentativa.

## Métricas e privacidade

O bloco **Conversão assistida** mostra totais agregados de cliques no WhatsApp, atendimentos, cardápios, revisão, publicação, e-mail, ativação, trial e assinatura. “Origem informada pelo lead” é autodeclarada; “UTM técnica” vem dos eventos anônimos da campanha. Os dois dados não formam uma atribuição individual.

Não copie CPF/CNPJ, telefone, e-mail, tokens, hashes ou conteúdo integral de cardápios para logs ou relatórios. Use apenas os dados mascarados fornecidos pela Central.
