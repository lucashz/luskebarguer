# Redesign do Marketing na Central

## Diagnóstico anterior

A interface expunha campanhas, CRM, calendário editorial, canais sociais, experimentos, relatórios e pilotos como sete abas equivalentes. O funil e cinco indicadores apareciam antes de qualquer orientação. Conteúdo era criado no “Calendário editorial”, mas aprovado e agendado em “Canais sociais”, formando duas filas aparentes. Biblioteca de mídia e configurações técnicas competiam com a tarefa principal.

## Arquitetura adotada

1. **Visão geral** — próxima ação, quatro números essenciais, pendências, próximos sete dias e conteúdos recentes.
2. **Conteúdos** — biblioteca única da ideia à publicação, filtros em português e editor progressivo.
3. **Calendário** — semana ou mês, estados visuais discretos e criação a partir de uma data.
4. **Resultados** — alcance, interações, visitas, cadastros, clientes, funil, ranking e recomendações explicadas.
5. **Contatos** — retornos prioritários, etapas compreensíveis e cadastro/importação sob demanda.
6. **Mais** — campanhas, conexão dos canais, testes A/B, relatório, pilotos e automações.

Campanha permanece opcional e funciona como agrupador. O conteúdo pode existir sem campanha.

## Fluxo principal

`Criar conteúdo → completar ideia → preparar texto → conferir prévia → enviar para aprovação → anexar mídia → aprovar e agendar → acompanhar no calendário → analisar resultado`

Para Instagram, as ferramentas de mídia e agendamento são montadas dentro do conteúdo selecionado. O backend continua sendo o módulo social original; não foi criada uma segunda fila.

## Controles preservados

- OAuth oficial e tokens cifrados;
- aprovação humana;
- hash da versão e invalidação após alteração;
- idempotência e captura concorrente;
- worker separado e retentativas;
- simulação distinguida de publicação real;
- confirmação forte em ações críticas;
- auditoria, CRM, UTMs, experimentos, pilotos e automações.

## Uso

- Abra Marketing para receber a próxima ação recomendada.
- Use Conteúdos para criar, editar, revisar e publicar.
- Use Calendário para enxergar lacunas e programação.
- Use Resultados para decidir o que repetir ou ajustar.
- Use Contatos para organizar os retornos comerciais.
- Use Mais somente quando precisar configurar canais ou operar recursos avançados.

## Limitações atuais

- O calendário não usa arrastar e soltar; alterações de data permanecem explícitas para não invalidar aprovação sem intenção.
- Métricas sociais dependem da disponibilidade da API da Meta; métricas manuais continuam disponíveis.
- Recomendações são regras transparentes e só aparecem com amostra mínima útil.
- A edição é progressiva visualmente, mas persiste como um único rascunho para compatibilidade com a API atual.
