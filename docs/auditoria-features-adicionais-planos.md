# Auditoria de features e adicionais por plano - Tapronto

Data: 2026-08-02

## Resumo

A matriz de planos está implementada no banco em `subscription_plans`, `platform_features`, `plan_features`, `plan_addons` e `store_subscription_addons`.

O bloqueio principal existe em duas camadas:

- Frontend: oculta/desabilita abas e botões conforme `plan_access`.
- Backend: `requireAdminPermission`, `featureForPermission`, `getCompanyFeatureAccess`, `assertPlanLimit` e `assertPublicUsageLimitByStore`.

O desenho geral faz sentido comercialmente. Nesta rodada, a matriz foi refinada para diferenciar melhor os planos pagos:

- Essencial fica com relatórios simples.
- Profissional libera relatórios completos.
- Premium libera insights avançados.
- Mesas no Essencial foram reduzidas para 2.
- Upload de imagens não valida limite/plano de forma específica.
- Fidelidade, sugestões e "Peça novamente" existem como features, mas precisam smoke dedicado para garantir bloqueio/experiência.
- Serviços assistidos estão bem posicionados para aumentar ticket sem encarecer o plano de entrada.

## Planos atuais

| Plano | Preço | Resumo |
|---|---:|---|
| Teste grátis | R$ 0 por 14 dias | Para experimentar sem custo. |
| Essencial | R$ 49,90/mês | Entrada barata e digna. |
| Profissional | R$ 89,90/mês | Operação completa para lojas ativas. |
| Premium | R$ 149,90/mês | Automação, suporte e crescimento. |

## Features por plano

| Feature | Teste | Essencial | Profissional | Premium | Implementação | Faz sentido? | Recomendação |
|---|---:|---:|---:|---:|---|---|---|
| Produtos do cardápio | 10 | 25 | 100 | Ilimitado | Backend valida criação com `digital_menu`; frontend bloqueia botão. | Sim | Manter. Essencial com 25 é bom para começar sem matar upgrade. |
| Categorias do cardápio | 3 | 5 | Ilimitado | Ilimitado | Backend valida criação com `menu_categories`; frontend bloqueia botão. | Sim | Manter. |
| Pedidos do mês | 30 | 150 | Ilimitado | Ilimitado | Pedido público chama `assertPublicUsageLimitByStore`. | Sim | Manter por enquanto. Se lojas pequenas baterem 150 rápido, avaliar 200. |
| Usuários da equipe | 1 | 1 | 5 | 10 | Feature existe; precisa validar todos endpoints de convite/criação. | Sim | Manter. Criar smoke dedicado de limite de usuários. |
| Clientes | 30 | Ilimitado | Ilimitado | Ilimitado | Aba/API bloqueada por `customers`; cadastro automático de clientes segue pedidos. | Parcial | Faz sentido liberar no Essencial. Limite no trial é ok. |
| Mesas e QR Code | Não | 2 | Ilimitado | Ilimitado | API/aba bloqueada por `tables`; limite por `dining_tables`. | Sim | Essencial permite uso inicial; operação de salão completa fica no Profissional. |
| Cupons e campanhas | Não | Não | Sim | Sim | API/aba bloqueada por `promotions`. | Sim | Manter fora do Essencial para valorizar upgrade. |
| Relatórios | Não | Simples | Completos | Insights | API/aba bloqueada por `basic_reports`; diferenciação por `advanced_reports` e `business_insights`. | Sim | Essencial tem resumo; Profissional tem ranking/horários/origem; Premium fica preparado para insights. |
| Configurações da Loja | Sim | Sim | Sim | Sim | Aba/API principal liberada por `store_settings`. | Sim | Manter. É essencial para qualquer plano. |
| WhatsApp manual | Sim | Sim | Sim | Não | Envio manual bloqueia quando loja tem `automatic_whatsapp`. | Sim | Manter para Teste/Essencial/Profissional. Premium deve usar automático. |
| WhatsApp automático | Não | Não | Não, mas adicional | Sim | Plano Premium libera; Profissional libera via adicional `whatsapp_automatic`; backend considera addon. | Sim | Correto por custo real de instância. |
| KDS, impressão e cozinha | Não | Não | Sim | Sim | `print_kitchen` valida logs de impressão; precisa validar toda UI de cozinha. | Sim | Manter Profissional+. |
| Fidelidade | Não | Não | Não | Sim | Feature existe e UI/loyalty existem. | Sim, mas precisa smoke | Confirmar backend bloqueando configuração/uso fora do Premium. |
| Peça novamente | Não | Não | Sim | Sim | Feature existe; área do cliente possui fluxo de refazer pedido. | Sim | Faz sentido no Profissional+. |
| Sugestões no carrinho | Não | Não | Não | Sim | Feature existe; sugestões aparecem no cardápio. | Atenção | Confirmar se frontend público respeita plano; se não, bloquear no backend/menu payload. |
| Domínio personalizado | Não | Não | Não | Sim | Feature existe; UI de domínio usa plano. | Sim | Manter Premium, pois DNS gera suporte. |
| Suporte prioritário | Não | Não | Não | Sim | Feature existe comercialmente. | Sim | Precisa refletir em SLA/ordenação de chamados. |

## Adicionais atuais

| Adicional | Preço | Tipo | Disponível | Incluso | Implementação | Faz sentido? | Recomendação |
|---|---:|---|---|---|---|---|---|
| WhatsApp Automático | R$ 49,90/mês | Recorrente | Profissional | Premium | Checkout, webhook, `store_subscription_addons`, Evolution Go. | Sim | Manter. Margem bruta aproximada: R$ 20,00 sobre custo R$ 29,90. |
| Configuração Assistida do Pix Online | R$ 79,90 uma vez | Serviço assistido | Essencial, Profissional | Premium | Checkout + chamado automático. | Sim | Manter. Muito bom para leigos. |
| Configuração Assistida do WhatsApp Automático | R$ 99,90 uma vez | Serviço assistido | Profissional, Premium | Ninguém | Checkout + chamado automático. | Sim | Manter, mas mostrar só se WhatsApp automático estiver disponível/incluso. |
| Configuração Inicial da Loja | R$ 149,90 uma vez | Serviço assistido | Todos pagos | Ninguém | Checkout + chamado automático. | Sim | Manter. Bom para aumentar ticket médio. |
| Cadastro Assistido do Cardápio | R$ 199,90 uma vez | Serviço assistido | Todos pagos | Ninguém | Checkout + chamado automático. | Sim | Manter com limite claro de itens. |
| Treinamento Rápido da Equipe | R$ 79,90 uma vez | Serviço assistido | Todos pagos | Ninguém | Checkout + chamado automático. | Sim | Manter. Ajuda a reduzir churn. |
| Implantação Completa TáPronto | R$ 399,90 uma vez | Serviço assistido | Profissional, Premium | Ninguém | Checkout + chamado automático. | Sim | Manter como pacote premium. |

## O que está funcionando melhor

- Limites de produtos, categorias e pedidos.
- Bloqueio de abas por plano no frontend.
- Bloqueio de APIs por `requireAdminPermission` + `featureForPermission`.
- Adicional WhatsApp automático por plano.
- Serviços assistidos com checkout e chamado automático.
- Trial vencido/pagamento pendente bloqueando operação.

## Pontos de risco

1. Relatórios não têm diferenciação real entre planos pagos.
2. Sugestões/fidelidade/peça novamente precisam teste dedicado em frontend público.
3. Upload de imagens não tem feature/limite dedicado.
4. Domínio personalizado pode estar liberado visualmente só na seção, mas precisa teste de API.
5. Suporte prioritário ainda parece mais comercial do que operacional.
6. Essencial com 5 mesas pode gerar suporte em uma faixa barata.

## Melhorias recomendadas

### Criar novas features

- `advanced_reports`: produtos mais vendidos, horários de pico, bairro, origem, cupons.
- `business_insights`: comparativos, alertas, recorrência, crescimento, ranking.
- `image_uploads`: limite de imagens/produtos com imagem, se necessário.
- `online_payments`: Pix online liberado por plano.
- `assisted_support`: serviços assistidos e SLA.

### Ajustar relatórios

- Essencial: resumo simples.
- Profissional: relatórios completos.
- Premium: insights avançados e alertas inteligentes.

### Ajustar mesas

Opção conservadora:

- Teste: 0.
- Essencial: 2 mesas ou sem mesas.
- Profissional: ilimitado.
- Premium: ilimitado.

Opção comercial generosa:

- Essencial: manter 5 mesas, mas chamar de "QR Code básico".

### Ajustar suporte prioritário

Premium deve afetar:

- prioridade padrão de chamados;
- SLA menor;
- destaque na Central;
- e-mails/alertas internos.

## Próximos testes sugeridos

- Criar loja trial e validar bloqueio de Relatórios, Cupons, Mesas, KDS e Domínio.
- Criar loja Essencial e validar limite de produtos/categorias/pedidos/mesas.
- Criar loja Profissional e validar WhatsApp automático bloqueado antes do adicional.
- Ativar adicional WhatsApp automático e validar conexão QR.
- Criar loja Premium e validar WhatsApp automático incluso.
- Testar domínio personalizado fora do Premium.
- Testar fidelidade e sugestões fora do Premium.
