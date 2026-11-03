# Resposta às auditorias do Codex — 03/11/2026

Documentos respondidos: `docs/AUDITORIA_ZO.md` (03/11/2026), `docs/AUDITORIA-FRONTEND.md` e `docs/AUDITORIA-BACKEND.md` (27/10/2026).
Cada item foi conferido no código atual (ramo `correcao-login-e-seguranca`) antes de ser aceito. Nada foi publicado.

Verificação final: `npm test` 200/200 · `npm run typecheck` sem erros · `npm run build` e `npm run build:portfolio` ok ·
API `unittest` 171/171 · `mypy` sem erros. No navegador (servidor local, Zo simulado): o aviso novo de consentimento, o
recibo "Gravando… → Gravado → Desfazer" e o cartão de importação (conta a escolher, sinal das compras do cartão).

## Zo (`AUDITORIA_ZO.md`)

Regressões em `ui/tests/zo-auditoria.test.mjs` (os probes P01–P10 viraram testes) e em `api/tests/test_api.py` (`TesteZo`).

| Item | Conferido | O que foi feito |
|---|---|---|
| ZO-01 receita recorrente vira despesa | Confirmado, e maior que o relatado: a tela "Nova recorrência" e o painel também permitiam (receita e estorno) | Serviço recusa (`RECURRENCE_TYPE`, `TIPOS_RECORRIVEIS`: despesa e débito); Zo devolve `dados_invalidos` antes do cartão; tela e painel deixam de oferecer |
| ZO-02 operações compostas não atômicas | Confirmado | `ZoZo.servico.lote`: várias ações numa gravação só, tudo ou nada. Usado em criar + parcelar/repetir, editar transação + repetir, editar conta, categoria e perfil, ajustes da fatura e categorizar em lote |
| ZO-03 confirmação obsoleta sobrescreve | Confirmado | Dentro do lote, a edição (e a exclusão de transação) confere que o item continua como no cartão; mudou → `STALE_PROPOSAL`, nada gravado. Categorizar em lote não troca o que ganhou categoria depois |
| ZO-04 confirmação reutilizável | Confirmado | `confirmar()` vale uma vez (chamadas repetidas ou simultâneas devolvem o mesmo resultado) |
| ZO-05 inválido vira padrão | Confirmado | Data/mês impossível, parcelas fora da faixa, frequência desconhecida, valor em texto e parcela + recorrência viram `dados_invalidos` (nunca hoje/mês atual às escondidas) |
| ZO-06 saldo negativo sem sinal | Confirmado | Cartão com `comSinal` (saldo e ajustes da fatura) |
| ZO-07 dedup confunde débito e receita | Confirmado | Chave com o sentido (entrada/saída); FITID do OFX guardado (`origemId`) e usado na deduplicação; editar não perde o FITID |
| ZO-08 parser aceita valores malformados | Confirmado | Gramática estrita em `importar.valor`: milhar só em grupos de 3, decimal com 1 ou 2 casas; ambíguos ("1,234") recusados |
| ZO-09 máscara e promessas absolutas | Confirmado | `zo.mascarar`: caracteres invisíveis, telefone fixo, valor depois de "senha", código de 6–8 dígitos. Aviso e política dizem que a detecção não é perfeita e trazem a ressalva legal da Cloudflare (documentação de Data usage conferida). `CONSENTIMENTO_VERSAO` → `workers-ai-2`: todos aceitam o aviso novo |
| ZO-10 resposta malformada parcialmente aceita | Confirmado | Ferramenta desconhecida, argumento ilegível ou grande demais, chamadas demais e `finish_reason: length` recusam a resposta inteira (tenta a reserva); id repetido ganha id novo; argumentos conferidos pelo esquema (`zo.problemas_argumentos`): a chamada marcada não é executada e os problemas voltam ao modelo |
| ZO-11 histórico passa do limite | Confirmado | `recentes()` respeita 40 mensagens e o total de caracteres (começa numa fala mais recente; resultados antigos viram resumo); o laço para antes de estourar; resultado grande vira JSON válido com `cortado: true` |
| ZO-12 moeda ausente | Confirmado | Leituras devolvem `moeda`; instruções e esquema falam da moeda informada |
| ZO-13 autoridade de texto | Parcial | Recibo determinístico na janela ("Gravado"/"Não gravado" pelo resultado da gravação). Fica de fora: assinar o histórico do assistente (quem altera o próprio navegador só afeta a própria conta) |
| ZO-14 observabilidade e consumo | Parcial | Tokens de entrada e saída por modelo no evento `zo_tempo`, sem conteúdo; lixeira guarda só 10 marcos quando o documento é grande. Fica de fora: limite global e alertas (dependem do plano e de metas do produto) |
| ZO-15 ciclo de vida assíncrono | Confirmado (revisão) | `opcoes.vigente`: nada grava depois de nova conversa, saída, consentimento retirado ou biometria demorada; consentimento e importação conferem a geração depois de cada espera |
| ZO-16 heurísticas da importação | Parcial | Conta só vem escolhida quando há uma possível; o sinal das compras do cartão fica num seletor visível. Fica de fora: trocar o tipo linha a linha |
| Seção 17: sem CI | Confirmado | `.github/workflows/testes.yml`: interface, portfólio e API a cada pull request e push no main (ações fixadas por hash, sem segredos) |
| Seção 11: `max_completion_tokens` no gpt-oss | Não alterado | Funcionou nas chamadas reais da prévia; segue como ponto de atenção |
| Seção 12: timeout da ponte não aborta o fetch | Não alterado | Observação, não defeito; a gravação incerta já é tratada (`SAVE_UNCONFIRMED`) |

## Frontend (`AUDITORIA-FRONTEND.md`, 27/10)

Os 12 achados corrigidos continuam no código (conferidos um a um). Pendências:

| Pendência | Decisão |
|---|---|
| Colar "1,234.56" esvaziava o campo de valor | Corrigido em `format.parseMoeda` (teste `ui/tests/format.test.mjs`) |
| Erro de formulário sem `aria-describedby` | Corrigido no formulário compartilhado (`components/forms.ts`); as telas de entrada já usavam `role="alert"` |
| Valores dos gráficos só no tooltip, emoji-mart, dados dos emojis, ~140 ms com milhares de itens, 404 do documento em conta nova | Mantidos: decisão de produto, biblioteca de terceiros ou ruído inofensivo, como o próprio relatório classifica |
| Zoom 200 %, espaçamento de texto, aparelhos reais, Safari e Firefox | Continuam não verificados (exigem aparelhos) |

## Backend (`AUDITORIA-BACKEND.md`, 27/10)

| Item | Situação |
|---|---|
| M1, B1, B2 | Já corrigidos (testes passam) |
| M2 backup | Resolvido: o backup diário roda (agendado, com sucesso em 01, 02 e 03/11). Falta o ensaio de restauração num banco isolado |
| B3 | Aceito (documentado) |
| B4 `aud` em lista sem `azp` | Corrigido em `google.py` (OIDC Core 3.1.3.7), com testes de token de outro cliente |
| B5 e-mails NFC/NFD | Mantido: normalizar sem migração tranca contas já criadas (o e-mail entra no AAD) |
| B6 cadastro revela conta sem e-mail | `RESEND_API_KEY` existe em produção (lista de segredos conferida, só os nomes) |
| WAF e limites da zona | Continuam a conferir no painel da Cloudflare |

Achado novo na conferência: o segredo `GEMINI_API_KEY` continua no Worker de produção, sem uso desde a troca de provedor.
