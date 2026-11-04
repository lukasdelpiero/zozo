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


---

# Segunda rodada — `AUDITORIA-SEGURANCA-2026-11-03.md` e `AUDITORIA-UI-UX-2026-11-03.md`

As duas foram feitas sobre o commit `c84d64f` (antes das correções da primeira rodada); cada item foi conferido de novo
no código atual. Os scripts de reprodução do Codex (`ui/tests/auditoria-protecao.mjs`, `api/tests/auditoria_20261103.py`,
`scripts/auditoria-*.py`) afirmam o comportamento vulnerável; viraram testes que afirmam o comportamento seguro
(abaixo) e ficam fora do repositório, como os logs `audit-*`.

Verificação: `npm test` 207/207 · `npm run typecheck` sem erros · `npm run build` e `build:portfolio` ok · API
`unittest` 176/176 · `mypy` sem erros · `uv lock` em dia. Navegador (Edge sem janela, teclado de verdade, servidor local):
rotas `#/pagina` com Voltar/Avançar e link direto, interruptores de Investimentos, borda de foco, foco devolvido pelo
painel (desktop e celular), "Pular para o conteúdo" e, de ponta a ponta, ligar a proteção avançada → sair → entrar com a
mesma senha → dados abrem.

## Segurança

| Item | Conferido | O que foi feito |
|---|---|---|
| A1 proteção avançada não troca a chave | Confirmado | Ligar agora troca a chave (mesma senha, sal novo): documento e histórico recifrados, sal/prova novos, proteção ligada, custódia e links apagados e outros aparelhos fora, numa transação (`PUT /api/conta/protecao`). O servidor recusa ligar sem a troca (cliente antigo) ou "trocando" para a mesma chave. Histórico grande vai em etapas (`/api/conta/chave/historico`). Falha de rede depois da troca: o sal novo confirma e a sessão segue. Política e aviso dizem que backups anteriores abrem só os dados até aquele dia. Testes: `host-web.test.mjs` (a chave do backup não abre documento nem histórico; conexão caída) e `TesteTrocaDeChave` |
| A2 biometria não vinculada à ação | Parcialmente procedente | A interface nunca pediu biometria nas ações sem volta (só nas ferramentas protegidas do Zo, uma trava local), então não há um pedido a contornar; sem 2FA, a sessão e a prova da senha bastam, por desenho. Exigir biometria no servidor é decisão de produto: quem perde o aparelho sem 2FA ficaria sem como remover a chave ou excluir a conta. Comentário enganoso em `host-web.ts` corrigido. Fica para decidir |
| A3 troca de senha apaga o histórico | Confirmado | A troca recifra o histórico com a chave nova (junto ou em etapas) na mesma transação; cópia que não abria fica de fora. Cliente antigo (sem o histórico) continua apagando, como antes. Testes nos dois lados |
| A4 máscara não cobre formatos comuns | Confirmado (o telefone fixo já tinha sido corrigido) | CPF e CNPJ com espaços, `(11)23456789` e `+55 (11) 9 8765-4321`; valores em reais continuam visíveis. A política já dizia que a detecção não é perfeita |
| A5 parâmetros revelam conta PBKDF2 | Confirmado, mantido | Some sozinho conforme as contas antigas entram (migração automática); mudar sal/KDF de conta real sem a senha trancaria os dados |
| A6 cadeia de publicação | Confirmado | Wrangler fixado no `package.json` (4.157.0, lockfile com hash); scripts usam `npx --no-install wrangler` (o `pywrangler` acha o mesmo). Produção sempre `npm ci` do zero. O comentário do `deps-em-dia.mjs` diz o que ele confere (metadados, não o conteúdo). Proteção de branch, tokens e procedência: painel do GitHub/Cloudflare |
| Turnstile sem hostname | Confirmado | O núcleo confere o `hostname` do Siteverify (o desafio tem de ter sido resolvido no mesmo site). Testes com outro domínio e sem hostname |
| Revogação concorrente | Confirmado | `PUT /api/documento` confere a sessão e o verificador da senha no próprio comando de gravação: sair ou trocar a senha no meio do pedido não deixa gravar (teste invertido do Codex) |
| Histórico "10 últimas gravações" | Confirmado | Política: até 10 versões, no máximo uma a cada 10 minutos |
| Custódia padrão, verdade financeira, rollback, criptografia própria | Decisões de arquitetura | Mantidas. A divergência apontada em `docs/SEGURANCA.md` (7.1, servidor como autoridade dos cálculos) ganhou a exceção explícita da criptografia de ponta a ponta e o que o servidor garante |
| Timeouts das chamadas externas (`entry.py`) | Não alterado | Destinos fixos; mudar exige ensaio no runtime Pyodide |
| Etapas operacionais (E2E na prévia, Pyodide, painel, restauração, carga) | Com o responsável | Ver o fim desta seção |

## UI/UX

| Item | Conferido | O que foi feito |
|---|---|---|
| F01 `stale` nunca limpa | Confirmado | `loadData` grava `stale: { [chave]: false }` (o set mescla o 2º nível); `invalidate` manda só as chaves novas. Teste `estado.test.mjs` |
| F02 interruptores sem nome | Confirmado | Cada interruptor tem o nome da conta (`Toggle` ganhou `ariaLabel`); o painel é `role="dialog"` com nome; o foco volta ao mesmo interruptor depois de redesenhar. Conferido no navegador |
| F03 foco invisível no nome/valor | Confirmado | Borda de foco (`--color-focus`) no espaço já reservado, sem mexer no layout. A edição no lugar (`noLugar`) tem a mesma ausência de foco, mas o comentário dela diz que é de propósito: fica para decidir |
| F04 ciclo de foco do painel | Confirmado | Quem abriu recebe o foco ao fechar (pelo elemento ou pelo `data-fk`/`data-id`); no celular (tela cheia) o foco entra no painel e a página coberta fica `inert`. Na gaveta parcial e no desktop a lista continua clicável ao lado. Conferido nos dois tamanhos |
| F05 contrastes | Exceção do produto | Já registrada no `CLAUDE.md` (cinza, pílulas, vermelhos); nada alterado |
| F06 navegação fora do histórico | Confirmado | Endereço `#/pagina`, Voltar/Avançar, link direto (vale depois do login), título da aba. Testes no `router.test.mjs` e no navegador |
| F07 pacote inicial grande | Não alterado | Pede medição antes (o próprio relatório); dividir exige tirar a dependência do registro global (F10) |
| F08 portfólio com o CSS do app | Confirmado | Entrada própria (`estilos-portfolio.css`): 157 kB → 25 kB (depois, com o visual novo sem Tailwind, 35 kB), sem classe faltando; tema e variantes em `tema.css`; a entrada do app passou a listar as fontes (`source(none)`) e perdeu só as 95 classes que eram do portfólio |
| F09 mapas de estilo abertos | Confirmado | `ZoZo.estrutura` e `ZoZo.pecas` com os nomes fechados (tipo vindo dos próprios arquivos); nome errado não compila. Nenhum erro escondido apareceu |
| F10 arquitetura global | Não alterado | Migração gradual; F09 é o primeiro passo |
| F11 suíte em navegador real | Parcial | Conferências por CDP feitas nesta rodada; uma suíte no repositório (Playwright ou CDP) fica como próximo passo |
| F12 animação dos gráficos sem cancelamento | Confirmado | Os quadros param quando o gráfico sai da tela, e o `destroy` cancela |
| F13 dica e erro sem ligação | Confirmado | Dica com `aria-describedby`; o erro entra junto da dica (não no lugar); o select recebe `aria-invalid` como os outros |
| F14 resíduos de migração | Confirmado | Comentários de `globais.d.ts`, `list.ts`, `index.html`, `tema.css` e `tokens.css` atualizados; `.money` documentado como algarismos proporcionais (o que está em uso desde a 2.0); `api/pyproject.toml` alinhado em 3.20.0 (e o `CLAUDE.md` lembra de subir os dois) |
| "Pular para o conteúdo" no app | Aplicado | Botão no primeiro Tab (não link `#main`, para não estragar o endereço da página) |

## Com o responsável

- Decidir A2 (biometria obrigatória no servidor) e o foco da edição no lugar (F03).
- E2E na prévia com contas descartáveis (Turnstile, Google, e-mail, WebAuthn no aparelho, Workers AI) e o empacotamento Pyodide.
- Painel: WAF e limites de borda, TLS mínimo, domínios do Turnstile (produção e prévia), escopo dos tokens, MFA administrativa, proteção do branch `main`.
- Ensaio de restauração do backup num D1 isolado (os backups diários estão chegando ao Google Drive de novo: a tarefa agendada estava apontando para a pasta antiga e tinha um bug de leitura da lista no Windows PowerShell 5.1, ambos corrigidos).
