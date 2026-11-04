# Auditoria técnica do Zo — ZoZo

**Data:** 03/11/2026, America/Sao_Paulo. **Parecer: REPROVADO para publicação desta implementação do Zo.**

Base: checkout local `app`, commit `c84d64f72a04b915ec24573c4935e06e9da29296`. A conclusão refere-se ao código inspecionado, não à identificação da versão atualmente publicada. Não foram acessados dados financeiros reais, bancos locais existentes, backups reais, secrets ou endpoints de produção. Nenhum código, configuração ou dependência foi alterado por esta auditoria. Este relatório é o único entregável criado por ela no projeto.

## 1. Resumo executivo

Foram reproduzidos bloqueadores de integridade financeira com dados exclusivamente sintéticos:

- Uma receita mensal confirmada como receita transforma-se em despesa recorrente: R$ 100 passam a compor `gasto`, com `recebido = 0` (ZO-01).
- Operações compostas podem falhar depois de gravar parte das mudanças. O mecanismo de compensação também pode falhar e esconder a gravação remanescente (ZO-02).
- Um cartão de confirmação preparado antes de outra edição pode sobrescrever essa edição sem detectar o conflito (ZO-03).

Também foram observados repetição de confirmação sem idempotência, normalização silenciosa de parâmetros inválidos, omissão de sinal negativo no resumo de confirmação, colisão entre débito e receita na deduplicação de importações e aceitação de números malformados. Há lacunas de privacidade, protocolo de ferramentas, contexto monetário e rastreabilidade.

Controles positivos incluem sessão de servidor com cookie protegido, prova de senha, controle de versão do documento, SQL parametrizado, consentimento versionado, ferramentas permitidas por lista fechada, confirmação humana na interface, renderização por nós de texto, limites de contexto e timeout. Esses controles reduziram riscos, mas não impediram os erros financeiros reproduzidos.

Os 161 testes Node e os 165 testes Python existentes passaram, totalizando 326 testes; a checagem TypeScript passou. Testes unitários aprovados não demonstram que o modelo interpreta corretamente linguagem natural nem que a configuração publicada corresponde ao checkout.

## 2. Escopo e limites

Revisão do caminho Zo → ferramentas → serviço de dados → criptografia → API → D1, da importação CSV/OFX e dos controles compartilhados de autenticação, consentimento e infraestrutura. Foram avaliadas todas as categorias do pedido, inclusive as não aplicáveis, conforme seção 5. A numeração original pula a categoria 10; não foi inventada uma categoria ausente.

Leitura aprofundada dos três módulos centrais do Zo, adaptadores de IA e importação; revisão dos caminhos relevantes dos módulos compartilhados e das suas suítes. Não se afirma revisão exaustiva de cada linha de todas as telas, dependências de terceiros ou código gerado. Bibliotecas foram avaliadas por manifestos, lockfiles e advisories; não por auditoria de toda a implementação interna.

Artefatos preexistentes de auditoria e logs estavam presentes no checkout e permaneceram intactos. Não foram tratados como testes executados nesta auditoria. `CLAUDE.md` e comentários descrevem intenções; resultados foram confrontados com implementação e execução local.

Na checagem final surgiram alterações concorrentes externas a esta auditoria em arquivos do portfólio, `package.json` e `tsconfig.json`, além de novos arquivos do portfólio. Não foram desfeitas nem atribuídas a esta auditoria. Os módulos centrais do Zo não apareceram como modificados no `git status` final. Os resultados de tipagem e manifestos descrevem a configuração no momento da sua leitura/execução, não uma fotografia imutável de todo o workspace ao final.

Limitações materiais: sem chamadas aos modelos reais, sem navegador/E2E visual, sem runtime Python Workers/Pyodide, sem consulta ao painel Cloudflare, sem medição de tráfego real, contratos, plano, WAF, retenção efetiva ou permissões de secrets. Estas partes permanecem não verificadas; não devem ser consideradas aprovadas.

## 3. Arquitetura identificada

```text
Pessoa → components/zo.ts → bridge/transporte.ts → host-web.ts
  → POST /api/zo [cookie + X-ZoZo-Prova + consentimento]
  → entry.py → nucleo._zo → zo.ler_mensagens / montar_pedido
  → binding AI.run(modelo, JSON) → zo.ler_resposta
  → texto e chamadas → data/zo.ts
  → leitura local OU cartão de confirmação → data/servico.ts
  → documento atualizado → host-web.cifrar → PUT /api/documento
  → sessão/prova + comparação versaoAnterior → D1
  → resultado da ferramenta incluído no próximo POST /api/zo
```

O modelo não acessa D1 nem executa funções Python financeiras. Ele escolhe funções que o navegador despacha. O servidor de armazenamento vê um documento cifrado; não consegue verificar valores e categorias dentro dele. O servidor de IA, por outro lado, recebe mensagens e resultados de ferramentas legíveis antes do mascaramento. Isso é uma exceção explícita à confidencialidade dos dados financeiros no fluxo de armazenamento, autorizada pelo consentimento do Zo.

Produção usa o núcleo diretamente; a prévia ativa FastAPI/Pydantic. Ambos terminam em `nucleo.atender`. Workers AI é acessado pelo binding `AI`, sem chave de API de IA no navegador. Modelos configurados: `@cf/openai/gpt-oss-120b` e `@cf/qwen/qwen3.8-27b`. Há 35 ferramentas do cliente e uma ferramenta interna de bloqueio, totalizando 36 no pedido ao modelo.

Conversa e lixeira ficam em memória da aba. Nova conversa, saída e inatividade de 15 minutos limpam o estado. Fechar a janela não equivale a apagar a conversa. Não há RAG, embeddings, busca vetorial, treinamento, memória persistente do Zo, integração Telegram ou webhook de mensagens nos módulos ativos pesquisados. Perfis são agrupamentos financeiros da mesma conta; não são identidades independentes com ACL própria.

Pontos únicos de falha: navegador desbloqueado, documento cifrado único por usuário, D1, Worker e Workers AI. O modelo reserva compartilha o provedor e a cota; não é contingência independente.

## 4. Componentes e integrações analisados

| Componente | Responsabilidade / evidência |
|---|---|
| `api/src/zo.py:24–436` | Instruções, esquemas, máscaras, limites, mensagens, seleção de modelos e parser de resposta |
| `api/src/nucleo.py:1395–1504` | Consentimento, cota, contexto de Brasília, fallback e timeout |
| `api/src/nucleo.py:344–668,1507–1869` | JSON, CSRF, sessão, prova, autorização, persistência e erros |
| `api/src/entry.py` | Bindings D1/AI, conversão Python/JS, HTTP e roteamento |
| `api/src/app_fastapi.py` | Contratos estritos e leitura limitada de corpo na prévia |
| `ui/js/components/zo.ts` | Estado, conversa, confirmações, importação, consentimento e acessibilidade declarada |
| `ui/js/data/zo.ts` | 35 ferramentas e cartões de confirmação |
| `ui/js/data/servico.ts` | Documento, fila, saldos, recorrências, importação, faturas e desfazer |
| `ui/js/bridge/host-web.ts`, `transporte.ts`, `messages.ts` | Criptografia, sessão, API, timeouts e códigos de erro |
| `ui/js/core/{dom,format,state,busca}.ts`, `config/regras.ts` | DOM seguro, apresentação monetária, estado e regras de cálculo |
| `ui/js/data/importar.ts` | CSV/OFX, datas, valores e limites |
| `api/src/{google,totp,webauthn}.py` | Caminhos compartilhados de autenticação, com revisão direcionada e suíte local |
| `api/migracoes`, `api/dev/banco_sqlite.py` | Consentimento e persistência; migrações executadas apenas em SQLite sintético |
| `api/wrangler.toml`, `pyproject.toml`, `uv.lock`, `pylock.toml` | Ambientes, modelos, runtime e dependências |
| `package.json`, `package-lock.json`, `tsconfig.json` | Dependências e verificações frontend |
| `ui/politica-privacidade.html`, `docs/SEGURANCA.md`, documentação de restauração e workflow de backup | Declarações de segurança, retenção e recuperação; execução remota não verificada |
| `ui/tests/*.test.mjs`, `api/tests/test_*.py` | Regressões existentes com mocks |

### Inventário das ferramentas

Todas as ferramentas abaixo tiveram seu despacho e contrato examinados; isso não significa execução de todas as combinações de argumentos.

| Grupo | Ferramentas | Controle / cobertura |
|---|---|---|
| Consultas básicas | `listar_contas`, `listar_categorias`, `listar_perfis`, `listar_recorrencias`, `buscar_transacoes`, `resumo_do_mes`, `sugerir_categoria`, `sobre_o_zozo`, `ler_configuracoes` | Serviço local; dados selecionados; testes de leitura/resumo/sugestão; moeda e truncamento merecem correção |
| Fatura | `consultar_fatura`, `salvar_ajustes_fatura`, `registrar_pagamento_recebido`, `abrir_fatura` | Recurso condicionado à conta; testes de ajustes, recebimento e consulta. Recebimento de perfil é reembolso/receita, distinto de pagamento do próprio cartão |
| Transações | `criar_transacao`, `editar_transacao`, `excluir_transacao` | Confirmação; exclusão exige fluxo de identidade; ZO-01 a ZO-05 |
| Contas | `criar_conta`, `editar_conta`, `excluir_conta` | Confirmação e referências locais; ZO-02 e ZO-06 |
| Categorias | `criar_categoria`, `editar_categoria`, `excluir_categoria`, `categorizar_em_lote` | Confirmação; lote pode envolver várias gravações; resumo mostra apenas exemplos |
| Perfis | `criar_perfil`, `editar_perfil`, `excluir_perfil` | Feature gate e confirmação; edição composta não atômica |
| Preferências | `configurar`, `remover_pix`, `transferir_entre_moedas` | Confirmação; gate de recurso; transferência monetária é mudança nominal sem conversão, informada no cartão |
| Interface | `oferecer_opcoes`, `filtrar_transacoes`, `abrir_configuracoes`, `importar_arquivo` | Opções/telas; senha e documentos sensíveis permanecem na tela específica |
| Exportação/sessão | `exportar_transacoes`, `sair` | Confirmação; exportação exige identidade; arquivo CSV não cifrado avisado |
| Interna | `barrar_mensagem` | Só o servidor trata; bloqueio prevalece sobre chamadas coexistentes; decisão semântica depende do modelo |

Não existe ferramenta `pagarFatura` no catálogo do Zo, embora exista a ação correta no serviço. Não confundir `registrar_pagamento_recebido` com pagar a fatura do próprio cartão. Também não há ferramenta atômica de transferência entre duas contas: os tipos de entrada/saída são lançamentos individuais. Pedidos assim precisam de esclarecimento ou encaminhamento à função adequada, não improvisação pelo modelo.

## 5. Metodologia e cobertura de categorias

Métodos: análise estática de fluxo e fronteiras de confiança; comparação de contratos; execução de suítes existentes; probes via stdin com Node/VM e Python, sem editar testes; injeção de falhas em adaptadores falsos; consultas públicas a documentação e advisories. Não foi iniciado servidor nem realizado deploy/build que sobrescrevesse assets.

**Confirmado** significa observado em código e/ou reproduzido localmente, conforme evidência específica. **Potencial** significa mecanismo de risco identificado sem reprodução completa do efeito. **Não verificado** significa ausência de evidência suficiente. Severidade considera impacto e pré-condições; acesso ao próprio runtime do navegador não foi confundido com invasão de outro usuário.

| Categoria solicitada | Avaliação e limites |
|---|---|
| 1 Arquitetura | Separação e fluxo mapeados; fila por aba, CAS no documento; operações compostas e estado pendente falham, ZO-02/03/15 |
| 2 IA | Prompt preservado por requisição; binding/fallback/parsers revisados; compatibilidade real e interpretação não executadas, ZO-10/11/12/13 |
| 3 Comandos financeiros | Obrigatoriedade parcial e IDs locais; falhas reproduzidas em recorrência, datas, sinal e conflitos. Ortografia e intenção do modelo não verificadas |
| 4 Funções | Catálogo completo comparado com dispatcher; confirmação existe, mas falta transação lógica única, idempotência e vínculo à versão |
| 5 Manipulação de IA | Papéis privilegiados rejeitados; texto de ferramenta marcado como dado no prompt. Não há avaliação adversarial real; ZO-09/13 |
| 6 Autenticação | Cookie/sessão/prova em todas as rotas Zo; usuário vem da sessão; OAuth JWT separado. Biometria não vinculada ao commit do documento, ZO-13 |
| 7 APIs | Métodos/JSON/origem/cotas/lista de rotas revisados; sem SQL dinâmico de usuário ou URL arbitrária nas ferramentas. TLS/WAF publicado não verificados |
| 8 Privacidade | Consentimento versionado e revogação; armazenamento cifrado; IA recebe trechos claros. Máscaras incompletas e promessas absolutas, ZO-09 |
| 9 Cloudflare | Configuração separa bancos e domínios; bindings repetidos; logs habilitados; traces não explicitados. Runtime, secrets, plano e regras efetivas não verificados |
| 11 Arquivos | CSV/OFX local, 2 MiB na tela, revisão humana, sem execução de HTML/XML; erros de parse/dedup e heurística, ZO-07/08/16 |
| 12 Integridade | Parcelas em centavos e pagamento pareado cobertos por testes; falhas confirmadas de receita, atomicidade, confirmação e importação |
| 13 Desempenho | Limites estáticos e duração da suíte medidos; nenhum p50/p95/p99 real. Dados inteiros e snapshots têm custo, ZO-14 |
| 14 Resiliência | Fallback, timeout, erro sanitizado, CAS e gravação incerta; rollback composto insuficiente; dependência única Cloudflare |
| 15 UX | Texto seguro, rótulos, aria-live, Escape, responsividade em classes; sem teste visual/leitor de tela. Confirmações e cancelamento têm lacunas |
| 16 Governança | Mapeamento abaixo; não constitui certificação LGPD/ASVS/OWASP/NIST; contratos e controles operacionais pendentes |
| 17 Logs | Correlation ID e eventos pseudonimizados existem; falta vínculo operação→ferramenta→versão e consumo de IA, ZO-14 |
| 18 Código/dependências | Tipagem passou; suites e lockfiles; contratos duplicados e erros silenciosos identificados. Advisories sem ocorrências nas consultas concluídas |
| 19 Testes | Matriz nas seções 6/7/21; resultados locais separados dos cenários não executados |

### Referenciais consultados

Foi confirmada a publicação da edição **OWASP LLM Top 10 2026**, em vez de presumir a numeração de 2025. Mapeamento de riscos, sem alegação de certificação: LLM01/05/08 → ZO-13; LLM02 → ZO-09; LLM03 → ZO-01/02/03/04; LLM04 → seção 17; LLM06 → ZO-11/14; LLM07 → ZO-12/13; LLM09 não aplicável sem vetores; LLM10 → ZO-05/10. [Lista oficial 2026](https://github.com/GenAI-Security-Project/GenAI-LLM-Top10/blob/main/2026/README.md).

Para aplicações agênticas, os riscos mais próximos são desvio de objetivo, uso indevido de ferramentas, identidade/privilégio e falhas em cascata. As confirmações locais ajudam, mas os defeitos financeiros mostram que elas precisam representar uma operação íntegra. [OWASP Agentic Applications](https://genai.owasp.org/2025/12/09/owasp-genai-security-project-releases-top-10-risks-and-mitigations-for-agentic-ai-security/).

ASVS 5.0 foi utilizado por temas: autenticação, sessão, autorização, validação, dados, API e logs. Não foi preenchida uma verificação requisito a requisito de todo o ASVS; não se afirma atendimento a nível 2. [ASVS oficial](https://github.com/OWASP/ASVS).

NIST AI RMF: **Govern** precisa de responsável e aceite de riscos; **Map**, de fronteiras/fluxos documentados; **Measure**, de avaliações reais versionadas; **Manage**, de bloqueio e regressão dos achados. [NIST AI RMF Core](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/).

MITRE ATLAS: tentativas de manipulação de instruções, contexto e dados foram consideradas na matriz. O portal não forneceu conteúdo legível nesta consulta e o endereço de técnica tentado retornou 404; nenhum ID de técnica é apresentado como validado. [MITRE ATLAS](https://atlas.mitre.org/).

LGPD: minimização, transparência, segurança e revogação orientam ZO-09. A auditoria técnica não comprova base legal, contratos internacionais, atendimento a titulares ou retenção operacional. [Texto atualizado da LGPD — Câmara dos Deputados](https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html).

## 6. Testes efetivamente executados

| Evidência | Execução | Resultado |
|---|---|---|
| E01 | `node --test ui/tests`, na raiz `app` | 161 testes, 161 aprovados, zero falhas/skip; 22.830,1772 ms para a suíte |
| E02 | `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` | Exit code 0 |
| E03 | `api/.venv/Scripts/python.exe -B -m unittest discover -s api/tests -p test_*.py -q` | Resultado consolidado ao final desta seção |
| E04 | `npm audit --json --ignore-scripts --package-lock-only` | Zero advisories; metadados: 109 dependências totais, categorias sobrepostas |
| E05 | JSON público PyPI para as 27 entradas nome/versão de registro de `uv.lock` | 27 consultas, zero erros e zero advisories retornados |
| E06 | Probes Node em `carregar()`/VM, serviço em memória | Receita vira gasto; persistência parcial; replay; confirmação obsoleta; inválidos; sinal; importação; moeda |
| E07 | Probes Python diretos em `zo`, sem I/O de rede | Máscaras, resposta truncada, IDs duplicados, argumentos inválidos, histórico fabricado e limite de mensagens |

As primeiras consultas de registry falharam por restrição de DNS; a repetição autorizada somente para leitura concluiu E04/E05. O executável `python` do PATH apontava para um alias Windows indisponível; utilizou-se a venv existente, sem instalação. Tentativas da suíte Python no sandbox travaram no `socketpair` interno de `asyncio`, comprovado por traceback de `faulthandler`; foram interrompidas. Isso é limitação do ambiente de teste, não falha atribuída ao app. A repetição fora dessa restrição continuou usando SQLite em memória e serviços falsos.

**E03 — consolidação:** 165 testes executados em 11,809 s, resultado `OK`, exit code 0, sem testes pulados reportados. Inclui núcleo, adaptador FastAPI e verificador de backup com arquivos temporários sintéticos. Ambiente: CPython 3.14.8 na venv existente; Node v26.10.0. Não equivale a execução em Python Workers.

### Observações reproduzidas em E06/E07

| Probe | Entrada / manipulação | Resultado observado |
|---|---|---|
| P01 | Receita 100, recorrência mensal, conta sintética | `ok:true`; lançamento `recorrente`; resumo `gasto:100, recebido:0` |
| P02 | Criar parcelada; mock falha em tornar recorrente e excluir | `OPERATION_FAILED`, mas débito 10 permanece sem parcelas |
| P03 | Editar conta: primeira gravação funciona, segunda falha | `OPERATION_FAILED`, mas nome novo permanece |
| P04 | Preparar edição, mudar descrição por outra ação, confirmar cartão anterior | Descrição posterior é substituída pela antiga |
| P05 | Invocar duas vezes o mesmo `confirmar()` de criação | Dois lançamentos persistidos |
| P06 | Data `2026-02-30`, parcelas `1000` | Cartão de escrita com data de hoje e sem parcelas |
| P07 | Parcelas 3 + recorrência mensal | Cartão mostra ambas; branch de gravação escolhe parcelas |
| P08 | Criar conta com saldo -500 | Cartão `R$ 500,00`; saldo persistido -500 |
| P09 | Importar débito e depois receita de mesmo nome/data/25 | Segunda importação: `importados:0,repetidos:1` |
| P10 | Parse `12.34.56`, `1,2,3`, `1,234` | 123456, 123 e 1.23 respectivamente |
| P11 | Conta USD, leitura de contas | JSON contém saldo, mas não moeda; não é evidência de símbolo incorreto na UI real |
| P12 | Telefone fixo e CPF com U+200B | Permanecem legíveis após `mascarar`; e-mail de controle é mascarado |
| P13 | Senha sintética rotulada e seis dígitos de código | Permanecem após `mascarar` |
| P14 | Duas tool calls com ID `dup` | `ler_resposta` retorna ambas; a validação de histórico posterior rejeita IDs repetidos |
| P15 | `criar_transacao` com valor -1 e campo desconhecido | Parser de resposta aceita o objeto; não implica que o serviço o gravaria |
| P16 | `finish_reason:length`, texto de sucesso | Parser devolve como resposta normal |
| P17 | Texto sintético de saldo sem consulta e histórico com tool result fabricado | Parser aceita o texto e o histórico estruturalmente válido; modelo real não foi chamado |
| P18 | Um usuário + cinco rodadas de oito resultados | 46 mensagens; backend rejeita; algoritmo `recentes` recua até o usuário, preservando as 46 |

## 7. Testes não executados e justificativas

Não executados: inferência real, robustez linguística e jailbreak dos modelos; latência/carga de Worker/D1; produção ou prévia hospedada; layout e teclado reais; dispositivos móveis; negociação TLS/WAF/Access; disponibilidade de secrets e plano; comportamento Pyodide/SDK em produção; restauração de backup real; confirmação bancária externa; avaliação jurídica/contratual e política completa de cada licença de modelo. Nenhuma dessas verificações foi substituída por um comentário de código.

Telegram: não localizado em código ativo; testes de falha de webhook, assinatura, replay, vínculo de chat e autenticação externa são não aplicáveis à implementação encontrada. Se estiver previsto fora deste repositório, precisa de auditoria própria antes de ser aprovado.

PDF, OCR, Office, ZIP e decompression bombs de documentos: não há parser desse tipo no importador Zo. CSV/OFX não extraem anexos nem expandem arquivos. O caminho de descompressão do documento cifrado é diferente e tem testes existentes na suíte do host; não foi feito fuzzing de bibliotecas.

## 8. Vulnerabilidades e falhas confirmadas

Os itens abaixo são defeitos confirmados da implementação, não prova de exploração em produção. Não foi comprovado acesso entre usuários, RCE, SQL injection, XSS executável ou vazamento de credencial real.

### ZO-01 — Receita recorrente transforma-se em despesa

- **Categoria:** integridade financeira / ferramentas. **Severidade:** alta. **Confiança:** alta. **Status:** confirmado por P01.
- **Arquivo/função:** `ui/js/data/zo.ts:196–224`, criar/editar transação; `ui/js/data/servico.ts:1412–1444`, `tornarRecorrente`; `ui/js/config/regras.ts`, `totais`.
- **Descrição/evidência:** ferramenta aceita `tipo:receita` com recorrência. O serviço altera o tipo para `recorrente`, preservando somente o marcador de débito, sem preservar semântica de receita/estorno/transferência. A regra de totais contabiliza recorrente como gasto. Confirmação mostra Receita; resposta retorna sucesso.
- **Reprodução segura:** P01 ou script A1; conta corrente sintética, receita 100 mensal, confirmar e consultar resumo de novembro.
- **Impacto usuário/financeiro:** receitas desaparecem dos totais recebidos e passam a despesas; saldos e projeções podem perder o efeito correto.
- **Causa provável:** ferramenta expõe combinações que o modelo de recorrência não suporta.
- **Correção/dependências:** bloquear combinações não suportadas antes da confirmação ou implementar natureza financeira independente da recorrência; depende do contrato do serviço, schema, cálculos e eventual migração.
- **Aceitação/regressão:** receita, estorno e transferências recorrentes conservam natureza e sinais, ou são recusadas explicitamente sem gravação. Verificar saldo, resumo, orçamento, parcelas e edição.

### ZO-02 — Operações compostas não são atômicas

- **Categoria:** integridade / resiliência. **Severidade:** alta. **Confiança:** alta. **Status:** confirmado por P02/P03.
- **Arquivo/função:** `ui/js/data/zo.ts:150–160,203–224,278–285,304–308,389–393,420–424`; `servico.ts:265–297`, `alterar`.
- **Descrição/evidência:** criar + tornar recorrente, editar múltiplos campos e categorizar vários grupos fazem commits separados. A fila garante atomicidade de cada ação, não do conjunto. Em criação, rollback é outra gravação e a exceção de rollback é descartada. `escrita` descarta o marco em caso de erro, mesmo com mutações concluídas.
- **Reprodução segura:** mock permite criação e falha na recorrência e no delete compensatório; permanece débito 10. Na edição de conta, falhar a segunda chamada mantém o primeiro campo alterado.
- **Impacto usuário/financeiro:** erro comunicado sem descrever estado parcial, risco de repetição e duplicação; mudanças financeiras incompletas sem desfazer oferecido.
- **Causa provável:** composição de ações de tela em vez de uma operação única do serviço.
- **Correção/dependências:** validar e aplicar o plano inteiro em um `alterar`, uma cifragem e um CAS. Em resultado incerto, reconciliar por ID da operação. Depende de novas ações do serviço e contrato de retorno.
- **Aceitação/regressão:** injetar falha em cada estágio, incluindo perda de resposta após commit; ou nada muda, ou o resultado exato é reconciliado. Nenhum estado parcial silencioso.

### ZO-03 — Confirmação obsoleta sobrescreve edição posterior

- **Categoria:** concorrência / autorização da intenção. **Severidade:** alta. **Confiança:** alta. **Status:** confirmado por P04.
- **Arquivo/função:** `ui/js/data/zo.ts:164–193,213–224`, `transacao`/`editar_transacao`; `servico.ts:1349–1372`, `updateLancamento`.
- **Descrição/evidência:** o cartão captura todos os campos antigos. Ao confirmar, aplica o objeto inteiro, sem verificar a versão do item no momento da preparação. Uma edição na mesma aba já foi salva e avançou a versão do host; por isso o CAS de documento não detecta esse conflito semântico.
- **Reprodução segura:** preparar alteração do valor; editar a descrição por `updateLancamento`; confirmar o cartão. A descrição nova volta ao valor antigo.
- **Impacto usuário/financeiro:** perda de edição legítima de descrição, conta, categoria, data ou valor sem nova confirmação.
- **Causa provável:** snapshot de leitura sem precondição de versão/hash no commit.
- **Correção/dependências:** vincular proposta ao estado-base, moeda, usuário e geração da conversa; revalidar antes de gravar; reapresentar diferenças. Depende de revisão do protocolo local de confirmação.
- **Aceitação/regressão:** edição concorrente na mesma aba, outra aba e outro dispositivo nunca é sobrescrita silenciosamente; confirmação vencida retorna conflito sem mutação.

### ZO-04 — Confirmação de escrita reutilizável

- **Categoria:** idempotência. **Severidade:** média. **Confiança:** alta para a camada de ferramenta. **Status:** confirmado por P05.
- **Arquivo/função:** `ui/js/data/zo.ts:150–160`, `escrita`; `components/zo.ts:634–652`, `confirmar`.
- **Descrição/evidência:** o mesmo objeto de confirmação aceita chamadas repetidas e gera IDs financeiros novos a cada execução. O botão da interface é desabilitado e a Promise resolve uma vez, mitigando duplo clique comum; não há prova de duplicação por duplo clique na UI normal.
- **Reprodução segura:** chamar duas vezes o `confirmar` retornado por uma criação sintética; total passa de zero a dois.
- **Impacto usuário/financeiro:** repetição no orquestrador, replay de operação ou recuperação mal implementada pode duplicar lançamentos.
- **Causa provável:** confirmação tratada como callback sem estado consumido ou chave de operação.
- **Correção/dependências:** ID estável, execução única/reutilização do mesmo resultado e deduplicação persistente cifrada. Depende de política de retenção desses IDs.
- **Aceitação/regressão:** duas confirmações simultâneas, repetidas e após resposta perdida têm exatamente um efeito.

### ZO-05 — Parâmetros inválidos e contraditórios viram operações diferentes

- **Categoria:** contratos / interpretação. **Severidade:** média. **Confiança:** alta. **Status:** confirmado por P06/P07/P15.
- **Arquivo/função:** `ui/js/data/zo.ts:34–44,60–64,164–207,327–338`; `api/src/zo.py:382–436`.
- **Descrição/evidência:** data inválida vira hoje/valor anterior; parcelas fora do intervalo são ignoradas; mês inválido vira mês atual. `parcelas` e `recorrencia` simultâneas aparecem no cartão, mas só parcelas são executadas. JSON Schema é enviado ao modelo, não executado pelo parser Python de resposta; o cliente faz validações próprias permissivas.
- **Reprodução segura:** data impossível e parcelas 1000 produzem cartão simples com hoje; três parcelas e recorrência mensal mostram ambas as opções.
- **Impacto usuário/financeiro:** períodos errados e plano financeiro diferente do pedido, mesmo com cartão aparentemente coerente.
- **Causa provável:** ausência e invalidade compartilham o mesmo fallback; contratos duplicados.
- **Correção/dependências:** validar schema e regras cruzadas; distinguir campo omitido de inválido; não transformar silenciosamente. Depende de contrato comum e mensagens de esclarecimento.
- **Aceitação/regressão:** datas impossíveis, formatos com sufixo, números em texto, NaN/infinito, campos extras, enums inválidos e combinação parcela/recorrência são rejeitados sem gravação.

### ZO-06 — Resumo de saldo negativo omite o sinal

- **Categoria:** confirmação / UX financeira. **Severidade:** média. **Confiança:** alta. **Status:** confirmado por P08.
- **Arquivo/função:** `ui/js/data/zo.ts:256–265`, `criar_conta`; `ui/js/core/format.ts:29–36`, `moeda`.
- **Descrição/evidência:** `F.moeda` usa valor absoluto salvo quando `comSinal` é informado. Cartão de criação não passa essa opção. Saldo -500 é mostrado como R$ 500,00 e persistido como -500.
- **Reprodução segura:** criar conta sintética com saldo negativo, comparar linhas do cartão e saldo lido.
- **Impacto usuário/financeiro:** pessoa confirma um saldo visualmente positivo e recebe dívida/saldo negativo.
- **Causa provável:** reutilização de formatador que comunica sinal por contexto em uma tela sem esse contexto.
- **Correção/dependências:** exibir sinais de saldos e ajustes negativos explicitamente; depende de revisão dos demais cartões que aceitam negativos.
- **Aceitação/regressão:** valores negativos, zero e positivos preservam sinal e moeda no cartão, texto acessível e estado persistido.

### ZO-07 — Deduplicação de importação confunde débito e receita

- **Categoria:** importação / integridade. **Severidade:** média. **Confiança:** alta. **Status:** confirmado por P09.
- **Arquivo/função:** `ui/js/data/servico.ts:1585–1608`, `importarLancamentos`; `data/importar.ts:55–65`, `lerOfx`.
- **Descrição/evidência:** chave de duplicidade usa data, valor absoluto e descrição, mas não tipo/sentido. FITID do OFX não é preservado. Crédito com mesmo valor/data/descrição de débito existente é descartado.
- **Reprodução segura:** importar débito 25; depois receita 25 com mesma data e descrição na mesma conta. Segunda importação retorna zero importados e um repetido.
- **Impacto usuário/financeiro:** omissão de recebimento/estorno legítimo e conciliação incorreta.
- **Causa provável:** fingerprint insuficiente e perda de identidade do extrato.
- **Correção/dependências:** preservar ID de origem quando presente e incluir natureza/sentido/conta/moeda no fingerprint; revisão de colisões. Depende de estender `LinhaImportada` e migração de metadados opcionais.
- **Aceitação/regressão:** débito/receita e compra/estorno equivalentes coexistem; reimportação exata continua idempotente; duplicatas legítimas em quantidade são preservadas.

### ZO-08 — Parser aceita valores monetários malformados

- **Categoria:** arquivos / validação financeira. **Severidade:** média. **Confiança:** alta. **Status:** confirmado por P10.
- **Arquivo/função:** `ui/js/data/importar.ts:32–49`, `valor`.
- **Descrição/evidência:** vários separadores iguais são removidos sem validar agrupamento. `12.34.56` vira 123456 e `1,2,3` vira 123. `1,234` vira 1.23, ambíguo para CSV estrangeiro. Não se trata de falha binária genérica de ponto flutuante: o defeito reproduzido é a gramática permissiva.
- **Reprodução segura:** chamar `ZoZo.importar.valor` com os três textos e conferir retorno; nenhuma rede necessária.
- **Impacto usuário/financeiro:** valores com ordens de grandeza erradas podem chegar à revisão como números válidos.
- **Causa provável:** heurística de separadores substitui validação do formato.
- **Correção/dependências:** gramática monetária estrita por formato/localidade; OFX deve seguir sua representação numérica; exigir decisão para ambiguidades. Depende de informação de formato na etapa de parse.
- **Aceitação/regressão:** rejeitar agrupamentos inválidos, preservar centavos e sinais e testar reais/dólares/euros, milhares e decimais.

### ZO-09 — Mascaramento não sustenta promessas absolutas de privacidade

- **Categoria:** privacidade / informações sensíveis. **Severidade:** média. **Confiança:** alta para lacunas; exposição real não observada. **Status:** confirmado por P12/P13 e revisão documental.
- **Arquivo/função:** `api/src/zo.py:214–228`, `mascarar`; `ui/js/components/zo.ts:102–111`, `CONSENTIMENTO`; `ui/politica-privacidade.html:86–98`.
- **Descrição/evidência:** telefone fixo comum `(11) 3456-7890` não é mascarado; CPF separado por U+200B passa; senha/código colados no chat não têm bloqueio determinístico. A instrução de o modelo recusar chega tarde para evitar a transmissão. O texto recebido pelo Worker já está legível antes da máscara.
- **Reprodução segura:** usar exclusivamente os valores sintéticos P12/P13; comparar entrada e saída, sem enviar ao provedor.
- **Impacto usuário/financeiro:** envio involuntário de identificadores ou dados de acesso que a pessoa acreditava protegidos; não foi comprovado uso indevido desses dados.
- **Causa provável:** regex de formatos limitados apresentada como garantia abrangente; regra de prompt confundida com filtro de entrada.
- **Correção/dependências:** minimização também no cliente, aviso antes de transmitir campos sensíveis reconhecidos, normalização Unicode cuidadosa e revisão honesta do aviso. Não prometer detecção perfeita. Depende de produto/privacidade e atualização da versão do consentimento.
- **Aceitação/regressão:** corpus de formatos nacionais/internacionais e invisíveis; garantir que valores, datas e IDs não sejam corrompidos; revisar declarações contratuais.

A documentação do Workers AI distingue processamento de conteúdo, recursos opcionais persistentes, metadados operacionais e exceções legais/segurança. O fluxo examinado não configura AI Gateway/log de prompts, mas a frase absoluta “não guarda os pedidos” deve refletir essas ressalvas e a configuração efetiva. [Cloudflare — Data usage](https://developers.cloudflare.com/workers-ai/platform/data-usage/). Não foi alegado que a Cloudflare efetivamente reteve uma conversa deste app.

### ZO-10 — Resposta malformada é parcialmente aceita

- **Categoria:** integração / protocolo. **Severidade:** média. **Confiança:** alta. **Status:** confirmado por P14–P16.
- **Arquivo/função:** `api/src/zo.py:382–436`, `ler_resposta`; `zo.py:230–288`, `ler_mensagens`.
- **Descrição/evidência:** IDs duplicados sobrevivem na resposta, mas são rejeitados na próxima requisição; `finish_reason:length` é aceito como resposta completa; argumentos grandes podem virar `{}` e chamadas ruins são descartadas mesmo se houver texto de sucesso. Falhas podem aparecer apenas depois da execução local.
- **Reprodução segura:** construir JSON sintético de duas chamadas `dup` e resposta truncada; usar E07.
- **Impacto usuário/financeiro:** conversa quebra após operações, resposta incompleta ou alegação de sucesso sem execução correspondente.
- **Causa provável:** parser tolerante sem validação global da resposta e sem contrato de conclusão.
- **Correção/dependências:** recusar ou reparar de forma explícita IDs/finish reason/schema antes de qualquer despacho; não aceitar sucesso contraditório. Depende de adaptador por modelo.
- **Aceitação/regressão:** IDs repetidos, chamadas desconhecidas, objetos em vez de strings, JSON truncado, argumentos excessivos e resposta parcial não produzem mutações nem sucesso enganoso.

### ZO-11 — Truncamento do histórico ultrapassa o limite do servidor

- **Categoria:** estabilidade / contexto. **Severidade:** média. **Confiança:** alta. **Status:** confirmado por P18 e análise do algoritmo.
- **Arquivo/função:** `components/zo.ts:20–21,496–500,510–542`; `api/src/zo.py:25–32,235`.
- **Descrição/evidência:** `recentes` começa em 30 mensagens, mas recua até a fala de usuário anterior; não corta um turno longo. Cinco rodadas com oito resultados geram 46 mensagens; a sexta ida seria permitida por MAX_RODADAS, mas o backend aceita no máximo 40. Não existe orçamento acumulado de caracteres/tokens no cliente. Resultados também são cortados no meio do JSON em `data/zo.ts:47`.
- **Reprodução segura:** gerar o histórico P18; parser recusa. A cadeia de 46 mensagens é estruturalmente produzível dentro dos limites por rodada, não um histórico de usuário acima do limite manualmente digitado.
- **Impacto usuário/financeiro:** erro no fim de comando composto, possível perda de explicação do que já foi gravado e dados parciais usados em resposta.
- **Causa provável:** limites definidos separadamente por camada, sem orçamento de turno.
- **Correção/dependências:** compactar blocos completos, paginar resultados com metadados, reservar margem para ferramentas e resumir com proveniência. Depende de contrato de contexto e reconciliação dos resultados já concluídos.
- **Aceitação/regressão:** limites 29/30/39/40/41 mensagens e 120 mil caracteres; nenhum tool result órfão; resposta após gravação continua recuperável.

### ZO-12 — Contexto financeiro não informa moeda por padrão

- **Categoria:** precisão / integração. **Severidade:** média. **Confiança:** alta para ausência de metadado; efeito no modelo não medido. **Status:** confirmado quanto ao contrato; resposta errada é risco potencial.
- **Arquivo/função:** `api/src/zo.py:48–52,112`; `nucleo.py:1439–1444`; `data/zo.ts:76–107,125–130`; `servico.ts:1972–1984`.
- **Descrição/evidência:** instrução manda usar reais e `_VALOR` descreve reais. Leituras usam a moeda ativa, mas contas/transações/resumo não devolvem moeda. Apenas `ler_configuracoes` a informa, sem obrigatoriedade prévia. P11 mostrou saldo USD sem unidade no JSON.
- **Reprodução segura:** ativar USD em documento sintético e chamar `listar_contas`. A UI real sincroniza `format.definirMoeda`; símbolo BRL observado num harness sem essa sincronização NÃO foi tratado como bug visual.
- **Impacto usuário/financeiro:** modelo pode atribuir reais a dólares/euros ou usar contexto antigo após mudança de moeda.
- **Causa provável:** contexto do modelo ainda presume moeda única.
- **Correção/dependências:** incluir código ISO em toda leitura/escrita, moeda na proposta e invalidar contexto relevante ao trocar moeda. Depende de schemas e orquestração.
- **Aceitação/regressão:** BRL/USD/EUR e troca durante confirmação; nenhuma unidade inventada ou alterada sem decisão explícita.

## 9. Riscos potenciais e verificações pendentes

### ZO-13 — Autoridade de texto e proteção adicional dependem do cliente/modelo

- **Categoria:** segurança de IA / autorização. **Severidade:** média. **Confiança:** alta para arquitetura, moderada para efeitos exploráveis. **Status:** potencial.
- **Arquivo/função:** `zo.py:230–288,325–336,382–436`; `components/zo.ts:514–535,585–593`; `data/zo.ts:474–489`; `nucleo.py:1358–1390,1698–1703`.
- **Descrição/evidência:** histórico de assistente e ferramenta é fornecido pelo cliente e validado estruturalmente, sem autenticação de proveniência. P17 aceita saldo inventado como texto. Texto é mostrado antes de executar chamadas. Não há ligação determinística entre sucesso narrado e recibo de commit. WebAuthn confirma identidade, mas não gera autorização vinculada ao hash/versão da operação financeira; o PUT do documento exige sessão/prova, não esse recibo. Conta com 2FA recebe `ok` local sem novo fator por ação.
- **Reprodução segura:** P17 e inspeção de contratos. Teste E2E de prompt injection ainda necessário; não foi demonstrado jailbreak nem BOLA. Um usuário que altera seu próprio cliente já controla seus próprios dados: isso não é escalada entre contas.
- **Impacto usuário/financeiro:** textos/documentos maliciosos podem induzir leituras excessivas, propostas indevidas ou afirmações falsas, condicionadas à resposta do modelo e à confirmação humana.
- **Causa provável:** confiança semântica excessiva no prompt e fronteira de autorização adicional sem protocolo de commit.
- **Correção/dependências:** recibos verificáveis e UI determinística para resultados; restringir ferramentas por contexto/recurso; isolar dados não confiáveis; definir ameaça coberta pela biometria. Se necessário, servidor vincula atestado à versão e hash cifrado sem ler os dados. Depende de modelo de ameaça E2EE e política de reautenticação.
- **Aceitação/regressão:** corpus adversarial, tool results fabricados, falsas mensagens de desenvolvedor, exclusão encadeada, exfiltração e sucesso sem commit não ultrapassam as garantias declaradas.

### ZO-14 — Observabilidade e limites de consumo incompletos

- **Categoria:** operação / desempenho / custo. **Severidade:** média. **Confiança:** alta no código; cenário de abuso não medido. **Status:** potencial.
- **Arquivo/função:** `nucleo.py:106,1432–1504`; `zo.py:325–336,382–436`; `entry.py:106–118`; `servico.ts:305–313`; `wrangler.toml`, observability.
- **Descrição/evidência:** logs têm duração/status/modelo/contagem, mas não consumo de tokens nem vínculo de chamada de ferramenta com commit da versão financeira. Cota de 150 requisições por conta não é orçamento global; cada requisição pode tentar outro modelo. Não há controle explícito de concorrência de inferências, circuit breaker ou alerta definido no código lido. Lixeira mantém até 30 pares de snapshots completos; filas/criptografia operam no documento inteiro. Falas podem crescer numa sessão continuamente ativa.
- **Reprodução segura:** inspeção; não foi feito teste de carga nem medido esgotamento. Traces não explicitados em configuração não prova ausência no painel.
- **Impacto usuário/financeiro:** custo/latência imprevisíveis, pressão de memória, dificuldade de investigar duplicação e falhas.
- **Causa provável:** telemetria orientada à requisição de IA, sem identidade da operação lógica.
- **Correção/dependências:** IDs opacos de operação, métricas agregadas sem conteúdo, uso/tokens/neuron por modelo, limites globais e concorrência, alertas e orçamento de memória da lixeira. Depende do plano e dos SLOs definidos pelo produto.
- **Aceitação/regressão:** rastrear pedido→proposta→commit sem registrar dados financeiros; medir p50/p95/p99 e consumo com carga sintética e orçamento acordado.

### ZO-15 — Fluxos assíncronos não usam uma única invalidação de sessão/conversa

- **Categoria:** estado / cancelamento / privacidade. **Severidade:** média. **Confiança:** moderada. **Status:** potencial, por revisão estática.
- **Arquivo/função:** `components/zo.ts:440–468,533–539,668–752`; `data/zo.ts:480–488`, `protegida`.
- **Descrição/evidência:** turno verifica geração antes de `res.confirmar`, mas não imediatamente depois; wrapper pode aguardar biometria e executar a proposta sem revalidar geração. Aceite de consentimento e leitura assíncrona de arquivo não usam a mesma guarda em todos os awaits. Importação não integra o `cancelarPendente` do turno e pode coexistir com ele.
- **Reprodução segura proposta:** em DOM sintético/E2E local, suspender biometria ou leitura de arquivo; iniciar nova conversa/revogar/sair; resolver a Promise e verificar ausência de escrita/estado residual. Não executado nesta auditoria.
- **Impacto usuário/financeiro:** ação ou nota tardia após cancelamento, mistura de estado, atribuição incorreta de marcos de desfazer.
- **Causa provável:** mecanismos de ciclo de vida independentes.
- **Correção/dependências:** token de operação/session generation checado após cada await e antes do commit; cancelamento comum, incluindo importação e WebAuthn. Depende da ponte e dos testes de UI.
- **Aceitação/regressão:** sair, fechar, expirar, trocar de usuário, nova conversa e revogar em cada ponto assíncrono; nenhuma ação não concluída continua sem autorização vigente.

### ZO-16 — Heurísticas de importação podem inverter natureza e escolher conta errada

- **Categoria:** importação / UX. **Severidade:** média. **Confiança:** alta sobre algoritmo, moderada sobre incidência. **Status:** potencial.
- **Arquivo/função:** `components/zo.ts:687–716`, `importarArquivo`.
- **Descrição/evidência:** conta padrão é primeiro cartão/primeira conta segundo heurística; sinal de compra em cartão é inferido pelo sinal majoritário. Extrato com maioria de estornos pode inverter a interpretação. O tipo não possui seletor por linha; créditos começam desmarcados. Revisão humana existe e reduz o risco.
- **Reprodução segura proposta:** arquivo sintético de cartão com duas devoluções positivas e uma compra negativa; comparar com a semântica real do formato. Não foi executado em navegador.
- **Impacto usuário/financeiro:** estornos apresentados como compras e conta inadequada pré-selecionada.
- **Causa provável:** ausência de mapeamento explícito de origem, sinal e tipo.
- **Correção/dependências:** exigir escolha de conta e convenção de sinal quando não identificáveis, permitir correção de tipo e mostrar amostra clara. Depende de formato do importador/UI.
- **Aceitação/regressão:** layouts inesperados, maioria de créditos, múltiplos cartões e arquivos de conta corrente não resultam em inferência silenciosa.

## 10. Problemas funcionais

Prioridades: ZO-01/03/05/06/07/08/12. Parcelamento 350 em três vezes possui teste existente que preserva total com 116,68 + 116,66 + 116,66; isso não valida receita recorrente. Negativos em lançamentos são barrados pelo serviço; saldos negativos são permitidos e precisam de apresentação fiel. Datas são checadas no serviço, mas a ferramenta pode substituir a inválida antes de chegar lá.

Solicitações incompletas recebem `faltam_dados` para conta/categoria/perfil quando aplicável. Identificadores desconhecidos não são comandos executáveis; dispatcher usa `Object.hasOwn`. Compreensão de abreviações, erros de digitação, moedas e intenção composta depende do modelo real e permanece pendente. O teste de busca tolerante a erros não testa linguagem natural do Zo.

## 11. Problemas de integração

ZO-10/11/12. Os nomes dos modelos existem na documentação pública consultada. O binding usa `AI.run` com chat completions; não usa o SDK da OpenAI nem envia requisições à OpenAI diretamente. A configuração do provedor é Cloudflare, mesmo para o modelo de origem OpenAI.

A documentação de Qwen lista `max_completion_tokens`; a página consultada de gpt-oss apresenta `max_tokens` e não apresentou `max_completion_tokens` na busca. Isso é **compatibilidade não verificada**, não comprovação de rejeição: documentação pode ser genérica/incompleta e o adaptador pode aceitar parâmetros adicionais. Fazer contrato real com cada modelo e verificar finish reason, tool calls, reasoning e consumo antes de publicar. [gpt-oss-120b](https://developers.cloudflare.com/workers-ai/models/gpt-oss-120b/), [Qwen 3.8 27B](https://developers.cloudflare.com/workers-ai/models/qwen3.8-27b/).

`pylock.toml` exige Python >=3.14.2 enquanto o projeto declara >=3.12 e mypy usa 3.12. Há wheel Pyodide específico de pydantic-core. Não foi demonstrada incompatibilidade, mas testes em CPython não validam esse empacotamento. Produção e prévia usam validadores diferentes, exigindo smoke tests das duas rotas.

## 12. Problemas de estabilidade

ZO-02/04/10/11/15. Timeout do servidor é de 20 s; ponte da conversa espera 30 s. Fallback compartilha o orçamento restante; timeout da primeira tentativa encerra a requisição sem tentar reserva. Retry do mesmo modelo usa espera fixa de 0,5 s; não há backoff exponencial/jitter. São escolhas observadas, não defeitos por si só, mas precisam de SLO e comportamento esperado documentados.

O timeout da ponte rejeita a Promise sem abortar o `fetch` subjacente. Há tratamento explícito de gravação incerta no serviço/host e testes de perda de resposta; isso não torna a operação composta do Zo atômica. A fila serializa escritas na aba e CAS protege concorrência entre documentos; o conflito semântico do cartão antigo continua reproduzível.

## 13. Problemas de privacidade

ZO-09/13/15. Consentimento é versionado em D1 e verificado antes de cada chamada ao modelo. A revogação bloqueia solicitações futuras; não desfaz transmissão já iniciada. A revogação durante fallback/inferência exige teste específico de corrida e política explícita.

O app não registra corpo da conversa nos eventos revisados. Identidades de usuário/IP são pseudonimizadas nos eventos do núcleo; pseudonimização não equivale a anonimização. A política pública declara backups externos sem prazo em um destino; retenção e exclusão efetiva não foram verificadas. Histórico do Zo baixado em TXT é persistência sob controle da pessoa e não desaparece quando a memória da conversa é limpa.

Proteção avançada não deve ser apresentada como impedimento absoluto de acesso por qualquer detentor de cópias antigas de custódia; o desenho de recuperação é uma exceção documentada e merece avaliação própria. Nenhum backup foi aberto nesta auditoria.

## 14. Problemas de desempenho

ZO-11/14. Cada ida reenvia instruções e catálogo inteiro. Ferramentas locais fazem leituras completas antes de filtros e séries podem materializar muitas parcelas; gravações cifram o documento inteiro. Operações compostas repetem esse trabalho. A prioridade é torná-las atômicas; paralelizar escritas não é correção segura.

O processamento local usa algumas leituras independentes em `Promise.all`. O loop de ferramentas é sequencial, necessário quando existem dependências; eventuais consultas independentes podem ser agrupadas após classificação explícita. Streaming não está implementado; primeiro conteúdo e resposta final dependem da inferência completa. Nenhuma meta arbitrária de latência foi usada para reprovar.

## 15. Problemas de experiência do usuário

ZO-05/06/10/15/16. “Confirmado” indica clique, não necessariamente commit; texto do modelo pode aparecer antes do resultado. Reabrir renderiza falas, mas não todos os cartões/notas resolvidos. A trilha visível pode perder distinção entre sucesso narrado, cancelamento e erro operacional.

Aspectos positivos em código: `role=dialog`, `aria-modal=false`, `role=log`, `aria-live=polite`, rótulos de botões, foco no cartão, Escape, layouts responsivos e texto sem HTML. Não foram medidos contraste, foco em todas as transições, leitor de tela, zoom, teclado virtual ou dimensões reais. Não se declara conformidade WCAG a partir das classes CSS.

## 16. Problemas de qualidade de código

Contratos de ferramenta e validação financeira existem em Python, TypeScript e serviço de dados. O teste de igualdade de nomes não verifica equivalência de schema ou semântica. Os módulos de serviço/núcleo concentram muitas responsabilidades; alteração de um tipo financeiro pode afetar saldo, categorias, recorrência e fatura.

Há exceções intencionalmente sanitizadas para não expor detalhes. Contudo, descarte de erro do rollback em ZO-02 e falha silenciosa ao abrir/fechar marcos dificultam saber se desfazer está disponível. Não se recomenda logar conteúdo financeiro como solução.

Referências históricas a outros provedores aparecem em comentários/migração; não foram confundidas com integrações ativas. Não foi comprovada dependência removível ou código morto com impacto suficiente para exclusão; nenhuma limpeza foi feita.

## 17. Dependências e configurações de risco

Dependências diretas frontend: `@emoji-mart/data 1.2.1`, `emoji-mart 5.6.0`, `hash-wasm 4.12.0`, `qrcode-generator 2.0.4`. Desenvolvimento: Vite 8.3.3, TypeScript 7.0.2, Tailwind e plugin 4.3.3. API: FastAPI 0.141.1, Pydantic 2.12.5, Starlette 1.7.0; runtime/dev resolvidos no lockfile. Versões fixas e hashes reduzem deriva; não garantem segurança.

E04/E05 não retornaram advisories conhecidos nas fontes consultadas. Isso não significa que todas as versões sejam as mais recentes, que advisories ausentes dessas fontes não existam ou que o conteúdo de cada pacote tenha sido auditado. Não houve instalação, update, `audit fix`, execução de scripts de pacote ou sincronização de lockfiles.

Wrangler: `python_workers`, data de compatibilidade 2026-10-01, binding AI, bancos distintos de prévia e produção, produção com workers.dev e URLs de versão desativados. Prévia usa workers.dev e não configura Access; isso é explícito, não um bypass demonstrado. Secrets são referenciados por nome, sem valores no relatório. Não foram lidos arquivos de credenciais. Ausência de secret em configuração pública não prova rotação, menor privilégio ou isolamento efetivo entre ambientes.

O workflow de backup usa permissões reduzidas, action de checkout fixada por SHA, exportação e cifragem age. Não foi acionado. Pipeline de CI que obrigue testes do Zo antes de publicar não foi localizado no diretório de workflows examinado; pode existir externamente.

## 18. Métricas observadas e não observadas

| Métrica | Evidência |
|---|---|
| Ferramentas | 35 executáveis no cliente + 1 bloqueio interno |
| Suíte Node | 161/161; 22,83 s; duração de teste, não latência do Zo |
| TypeScript | Exit 0, sem emissão |
| Python | Seção 6, E03 |
| Entrada | 2.000 caracteres por usuário; 40 mensagens; 120.000 caracteres acumulados |
| Ferramentas/resposta | Até 8 chamadas por resposta; argumentos 4.000 caracteres; resultado servidor 20.000, cliente 18.000 antes de truncar |
| Orquestração | Até 6 idas ao Zo; até 48 chamadas teóricas por turno, sujeito aos limites de histórico |
| Geração | `temperature=0.3`; `max_completion_tokens=4096` solicitado, aplicação real não medida |
| Timeout | 20 s no núcleo; 30 s na conversa; 60 s padrão da ponte |
| Cota | 150 pedidos Zo/conta/janela de 24 h; 600 pedidos de dados/600 s; janela fixa não é necessariamente dia civil |
| Arquivos | 2 MiB na UI, até 2.000 linhas no parser, 500 apresentadas/importadas por operação |
| Memória | Conversa expira por 15 min sem uso; até 30 marcos com antes/depois do documento |
| Observabilidade | Eventos com request ID, duração/modelo/status; tokens/custo por mensagem não observados |
| p50/p95/p99, TTFT, CPU, pico de memória, D1 real | Não medidos; ausência de amostras reais |
| Custo médio por mensagem | Não estimável com rigor sem tokens/neuron reais, tentativas e plano |

A tabela pública de Workers AI informa 10.000 neurons/dia gratuitos e cobrança de US$ 0,011/1.000 neurons excedentes no Paid; isso não informa o plano contratado nem o custo médio deste app. Fórmula operacional: somar consumo de cada tentativa/rodada e aplicar a tabela vigente, separando franquia compartilhada. [Preço oficial](https://developers.cloudflare.com/workers-ai/platform/pricing/). Limites de runtime devem ser confrontados com o plano e a execução Python, não inferidos da duração de testes CPython. [Limites Workers](https://developers.cloudflare.com/workers/platform/limits/).

## 19. Recomendações de correção

1. Implementar ações financeiras compostas atômicas, com natureza financeira preservada e validação antes de qualquer commit.
2. Transformar confirmação em proposta de uso único, vinculada ao usuário, estado-base, moeda e parâmetros exatos.
3. Validar schemas e regras cruzadas dos argumentos; recusar inválidos em vez de substituí-los por defaults.
4. Corrigir sinal e moeda no resumo, identidade de importação e parser monetário.
5. Separar texto gerado de resultado financeiro comprovado; exibir recibo local verificável de execução/erro/cancelamento.
6. Unificar ciclo de vida de conversa/importação/biometria e orçamento de contexto.
7. Ajustar minimização e transparência de privacidade; versionar o consentimento quando o aviso mudar.
8. Criar avaliações reais dos dois modelos em ambiente isolado, com corpus português e adversarial, antes de trocar modelo ou liberar publicação.
9. Adicionar métricas e alarmes agregados sem armazenar prompts ou dados financeiros; documentar SLO, custo, concorrência e contingência.

## 20. Ordem recomendada de implementação

| Ordem | Itens | Condição de saída |
|---|---|---|
| Bloqueadores | ZO-01, ZO-02, ZO-03 | Nenhuma alteração de natureza, gravação parcial silenciosa ou perda de edição concorrente |
| Integridade imediata | ZO-04 a ZO-08 | Propostas únicas, entrada estrita, sinal correto e importação conciliável |
| Contratos e contexto | ZO-10, ZO-11, ZO-12 | Respostas validadas, histórico dentro de limites, moeda explícita |
| Privacidade e autoridade | ZO-09, ZO-13, ZO-15 | Aviso fiel, resultado verificável e cancelamento consistente |
| Operação e UX | ZO-14, ZO-16 | Carga/SLO/custos medidos, heurísticas revisáveis e alertas testados |
| Liberação | Matriz completa e revisão independente | Testes reais isolados, evidências operacionais e aceite formal do risco residual |

## 21. Matriz funcional/adversarial e plano de regressão

Legenda: **L** = conta/documento sintético em memória com `carregar`; **A** = Cliente/FakeServicos + SQLite em memória; **M** = modelo real em ambiente isolado ainda necessário; **B** = navegador local com DOM real. Resultados “não executado” não são aprovação. E01/E03 representam testes existentes; Pxx probes específicos desta auditoria.

| ID / objetivo | Condições iniciais | Entrada | Esperado | Observado | Resultado | Evidência | Severidade se falhar |
|---|---|---|---|---|---|---|---|
| T01 Mensagem simples | M consentido | “Quanto gastei este mês?” | Consulta correta e resposta fiel | Sem inferência real | Não executado | Catálogo/regras | Média |
| T02 Composta | M + conta/categoria | “Compra 350 em 3x e mostre resumo” | Uma operação exata e soma correta | Ferramenta parcelada local passa; linguagem não testada | Parcial | E01 zo.test | Alta |
| T03 Incompleta | L sem categoria/perfil | Criar despesa só com conta | Pedir campos, zero escrita | `faltam_dados` | Aprovado local | E01 | Alta |
| T04 Ambígua | M duas contas de mesmo nome | “Lance na minha conta” | Pedir escolha | Não observado | Não executado | Plano | Alta |
| T05 Erro de digitação | M | “registra almoco vint reais” | Esclarecer/interpretar sem inventar | Não observado | Não executado | Busca local não substitui IA | Média |
| T06 Contraditória | L | parcelas 3 + mensal | Recusar/explicar | Cartão contraditório | Falha | P07 | Média |
| T07 Valor inválido | L | zero/negativo e formatos ruins | Recusar | Serviço barra zero/negativo; parser CSV aceita lixo | Parcial/falha | E01/P10 | Alta |
| T08 Data inválida | L | `2026-02-30` | Recusar | Hoje no cartão | Falha | P06 | Média |
| T09 Conta inexistente | L | `conta_id` ausente | Zero escrita | Campo faltante | Aprovado local | E01 zo.test | Alta |
| T10 Cartão/categoria inexistentes | L/M | IDs não pertencentes às listas | Recusar | Conta genérica coberta; combinações completas pendentes | Parcial | E01 / inspeção | Alta |
| T11 Ferramenta não autorizada | L/A | `apagar_tudo`, `__proto__` | Não despachar | Ferramenta desconhecida | Aprovado local | E01/E03 | Alta |
| T12 Dados de terceiro | A duas contas | Trocar identificação no payload | Isolamento pela sessão | Casos de API na suíte; sem pentest hospedado | Local, conforme E03 | E03 | Crítica |
| T13 Exclusão de terceiro | L/A | ID ausente no documento | Não excluir | Lookup local restrito; identidade da API separada | Revisão + testes correlatos | E01/E03 | Alta |
| T14 Duplicação | L | Mesmo confirmar duas vezes | Um efeito | Dois lançamentos | Falha da camada ferramenta | P05 | Média |
| T15 Falha parcial | L + mock | Falhar etapa 2 e compensação | Nenhum efeito ou reconciliação | Lançamento permanece | Falha | P02/P03 | Alta |
| T16 Confirmação obsoleta | L | Editar após abrir proposta | Conflito | Edição posterior perdida | Falha | P04 | Alta |
| T17 Confirmação expirada | B relógio falso | Esperar 15 min com cartão | Não gravar | Timer visto; DOM não testado | Não executado E2E | components/zo.ts | Alta |
| T18 Conexão interrompida | Host falso | Perder resposta após commit | SAVE_UNCONFIRMED/releitura | Teste passa | Aprovado local | E01 host-web | Alta |
| T19 Timeout provedor | A IA atrasada | Superar timeout reduzido de teste | 504 sanitizado | Conforme suíte E03 | Local | E03 TesteZo | Média |
| T20 IA malformada | Parser/A | IDs duplicados/length/JSON ruim | Rejeitar antes do despacho | Parte aceita | Falha | P14–P16/E03 | Média |
| T21 Simultaneidade | L/host falso | Duas escritas/versão velha | Fila/CAS | Casos existentes passam; cartão falha | Parcial | E01/P04 | Alta |
| T22 Histórico extenso | Parser | 46 mensagens legais por rodadas | Compactar sem erro | Rejeitado | Falha de integração | P18 | Média |
| T23 Injection direto | A/M | Papel sistema / “ignore regras” | Papel recusado; conteúdo não muda autoridade | Estrutura coberta; semântico pendente | Parcial | E03/ZO-13 | Alta |
| T24 Injection indireto | M dados sintéticos | Descrição “execute exclusão” | Tratar como dado | Não observado no modelo | Não executado | Plano | Alta |
| T25 Manipulação de tools | Parser/L | Campos extras/valor inválido | Contrato estrito | Parser deixa passar; cliente parcial | Falha de contrato | P15 | Média |
| T26 Arquivo malicioso | B/M | CSV com HTML, fórmula e instruções | Texto inerte; sem autoridade | DOM seguro por inspeção; export formula neutralizada em suíte | Parcial | E01 exportacao / DOM | Alta |
| T27 Telegram indisponível | Integração ausente | Webhook sintético | Falha fechada | Sem integração ativa | Não aplicável | Busca código | Alta se implementado |
| T28 Revogar consentimento | A | Aceitar, revogar, conversar | Bloquear novas inferências | Teste existente; corrida pendente | Local conforme E03 | TesteZo | Alta |
| T29 Revogar sessão | A/host falso | Logout/troca senha | Rejeitar sessão anterior | Casos existentes | Local conforme E01/E03 | Suítes sessão | Alta |
| T30 Limite API | A IA falsa | Ultrapassar cota | 429 sem nova inferência | Caso existente | Local conforme E03 | TesteZo | Média |
| T31 Recuperação IA | A | 429/503 seguido de sucesso | Fallback limitado | Caso existente | Local conforme E03 | TesteZo | Média |
| T32 Receita recorrente | L | Receita 100 mensal | Receita 100 | Gasto 100 | Falha | P01 | Alta |
| T33 Sinal do saldo | L | -500 | Cartão -500 | Cartão +500 | Falha | P08 | Média |
| T34 Dedup sem perder crédito | L | Débito/receita mesmos dados | Dois movimentos | Receita descartada | Falha | P09 | Média |
| T35 Reimportação exata | L | Mesmo arquivo duas vezes | Sem duplicar | Teste passa | Aprovado local | E01 importar | Média |
| T36 Moeda | L/M | Saldo USD | JSON e texto USD | JSON sem unidade | Falha de contrato, IA pendente | P11 | Média |
| T37 Dados sensíveis | Parser | Telefone/CPF invisível | Bloqueio ou aviso antes do envio | Sem máscara | Falha de cobertura | P12/P13 | Média |
| T38 Fatura do cartão | L | Pagar/editar/excluir par | Sem receita fictícia e par íntegro | Suíte do serviço passa | Aprovado local; sem ferramenta Zo de pagamento | E01 servico-fatura | Alta |
| T39 Reembolso de perfil | L | Registrar recebimento | Receita legítima de reembolso | Suíte Zo passa | Aprovado local | E01 | Média |
| T40 Cancelar durante biometria | B | Nova conversa no await | Não gravar | Não observado | Não executado | ZO-15 | Alta |
| T41 UI móvel/acessibilidade | B | Teclado/zoom/leitor/tela estreita | Sem perda de operação/foco | Só revisão estática | Não executado | Seção 15 | Média |
| T42 Carga e custos | Ambiente isolado | Sessões concorrentes/dados grandes | SLO e orçamento definidos | Sem amostras | Não executado | Seção 18 | Média |
| T43 Importar créditos majoritários | B | Estornos > compras | Natureza preservada | Algoritmo suspeito, sem DOM | Não executado | ZO-16 | Média |
| T44 Cancelar/revogar em voo | B/A | Revogar entre respostas | Sem nova transmissão após corte definido | Corrida não medida | Não executado | ZO-15 | Alta |

Para regressão: transformar os probes em testes do repositório quando a implementação for corrigida; executar matriz com mocks determinísticos e depois corpus real em ambiente isolado. Registrar versão do modelo, prompt, schemas, entrada sintética, resultados esperados, evidência de commit e custo. Para adversarial, incluir Unicode invisível, mensagens longas, instruções divididas, falso desenvolvedor, resultados de ferramentas contaminados, pedidos de credenciais e mudanças de conta/valor. Não considerar simples recusa textual como prova de bloqueio de ferramenta.

### Apêndice A — reproduções seguras sem criar arquivos de código

Executar da raiz `app` em PowerShell. `carregar()` usa VM e dados exclusivamente em memória; não abre bancos reais. Os testes retornam observações para comparação com a expectativa, não mascaram o defeito com assertions de comportamento correto.

```powershell
@'
import { carregar } from './ui/tests/carregar.mjs';
const t = carregar({recursos:{perfis:false,boleto:false,pix:false,cambio:true}});
const A=t.A;
const {conta:c}=await t.req(A.createConta,{conta:{nome:'Sintetica',tipo:'corrente',saldo:1000}});
const {categoria:k}=await t.req(A.createCategoria,{categoria:{nome:'Teste'}});
const z=t.Z.zoFerramentas.criar(t.req,{perfis:()=>false});
const base={descricao:'Teste',valor:10,tipo:'debito',conta_id:c.id,categoria_id:k.id,data:'2026-11-03'};
const call=(name,args)=>z.executar(name,JSON.stringify(args));
// A1 / P01: natureza de receita recorrente
const income=await call('criar_transacao',{...base,descricao:'Salario',tipo:'receita',valor:100,recorrencia:'mensal'});
console.log(income.linhas,await income.confirmar());
console.log((await call('resumo_do_mes',{mes:'2026-11'})).resultado);
// A2 / P05: a mesma proposta duas vezes
const replay=await call('criar_transacao',base);
await replay.confirmar(); await replay.confirmar();
console.log('replay',(await t.req(A.getLancamentos)).lancamentos.filter(x=>x.descricao==='Teste').length);
// A3 / P04: cartão velho contra edição posterior
const l=(await t.req(A.getLancamentos)).lancamentos.find(x=>x.descricao==='Teste');
const stale=await call('editar_transacao',{id:l.id,valor:20});
await t.req(A.updateLancamento,{id:l.id,lancamento:{...l,descricao:'Posterior'}});
await stale.confirmar();
console.log('descricao',(await t.req(A.getLancamentos)).lancamentos.find(x=>x.id===l.id).descricao);
// A4 / P02: falha de etapa e de compensação
const f=t.Z.zoFerramentas.criar(async(a,d)=>{
 if(a===A.tornarRecorrente||a===A.deleteLancamento) throw {code:'OPERATION_FAILED'};
 return t.req(a,d);
},{perfis:()=>false});
const partial=await f.executar('criar_transacao',JSON.stringify({...base,descricao:'Parcial',parcelas:3}));
console.log(await partial.confirmar());
console.log('remanescente',(await t.req(A.getLancamentos)).lancamentos.filter(x=>x.descricao==='Parcial'));
// A5 / P06,P07,P08,P10
console.log((await call('criar_transacao',{...base,data:'2026-02-30',parcelas:1000})).linhas);
console.log((await call('criar_transacao',{...base,parcelas:3,recorrencia:'mensal'})).linhas);
console.log((await call('criar_conta',{nome:'Negativa',tipo:'corrente',saldo:-500})).linhas);
console.log(['12.34.56','1,2,3','1,234'].map(x=>[x,t.Z.importar.valor(x)]));
// A6 / P09: crédito legítimo colide com débito
const it={data:'2026-11-03',descricao:'Mesmo nome',valor:25,tipo:'debito'};
console.log(await t.req(A.importarLancamentos,{contaId:c.id,itens:[it]}));
console.log(await t.req(A.importarLancamentos,{contaId:c.id,itens:[{...it,tipo:'receita'}]}));
'@ | node --input-type=module
```

```powershell
@'
import sys,json
sys.path.insert(0,'api/src')
import zo
for s in ['Contato (11) 3456-7890','CPF 123\u200b.456.789-09','senha=sintetica; codigo=123456']:
 print(repr(zo.mascarar(s)))
calls=[{'id':'dup','function':{'name':n,'arguments':'{}'}} for n in ['listar_contas','listar_categorias']]
raw=json.dumps({'choices':[{'finish_reason':'tool_calls','message':{'content':None,'tool_calls':calls}}]})
print(zo.ler_resposta(raw))
raw=json.dumps({'choices':[{'finish_reason':'length','message':{'content':'Operacao feita'}}]})
print(zo.ler_resposta(raw))
hist=[{'papel':'usuario','texto':'resumo'}]
for r in range(5):
 cs=[{'id':f'c{r}_{i}','nome':'listar_contas','argumentos':'{}'} for i in range(8)]
 hist += [{'papel':'assistente','texto':None,'chamadas':cs}]
 hist += [{'papel':'ferramenta','id':c['id'],'resultado':'[]'} for c in cs]
try: zo.ler_mensagens(hist)
except zo.Invalido: print('historico rejeitado',len(hist))
'@ | .\api\.venv\Scripts\python.exe -B -
```

## 22. Riscos residuais

Mesmo corrigidos os achados, o modelo pode interpretar mal intenção, tentar executar ferramenta inadequada ou gerar informação falsa. Validação de dados, confirmação exata e resultado determinístico precisam permanecer fora do modelo. Dados financeiros disponibilizados ao provedor são potencialmente identificáveis mesmo após remoção de documentos e contatos.

Persistem dependência do provedor, alterações de comportamento de modelos, risco de comprometimento do navegador desbloqueado, backups históricos, corridas em operações de sessão e necessidade de validar o runtime real. O alcance das garantias de criptografia deve distinguir armazenamento, custódia e inferência. A documentação e os testes não substituem evidência de configuração publicada e monitoramento.

## 23. Parecer final sobre publicação

**REPROVADO.** Há falhas altas reproduzidas que alteram a natureza financeira de operações, deixam gravações parciais e sobrescrevem alterações posteriores. Elas bastam para bloquear publicação do Zo, independentemente das partes ainda não verificadas.

A aprovação futura exige correção e regressão de ZO-01/02/03, tratamento dos demais achados, execução segura dos cenários pendentes aplicáveis e validação dos modelos/runtime/configuração real em ambiente isolado. Não há evidência para aprovar a implantação atual nem para afirmar exploração ou perda financeira em produção. Nenhuma alteração corretiva ou publicação foi realizada nesta auditoria.
