# Auditoria técnica e de segurança — 03/11/2026

Referência: commit `c84d64f72a04b915ec24573c4935e06e9da29296`, checkout local do ZoZo 3.20.0. Revisão de arquitetura e caminhos críticos, testes automatizados, reproduções adicionais e consultas HTTP públicas. Nenhuma correção funcional, migração ou publicação foi realizada. Os arquivos de auditoria são novos; alterações anteriores do usuário foram preservadas.

**Parecer: há boas defesas e os testes existentes passam, mas a aplicação não deve receber um atestado irrestrito de segurança.** A proteção avançada tem uma limitação criptográfica reproduzida: cópias anteriores da custódia continuam permitindo recuperar a chave usada em documentos novos. Há ainda lacunas em reautenticação biométrica, privacidade da IA, retenção do histórico e cadeia de publicação.

Não foi uma leitura manual de cada linha de cada componente visual, nem um pentest completo da infraestrutura. A matriz abaixo distingue evidência obtida de validação pendente. “Não identificado” não significa ausência demonstrada de toda vulnerabilidade.

## Achados priorizados

### A1 — Alta: ativar proteção avançada não revoga a chave existente em backups

**Locais:** `ui/js/bridge/host-web.ts:826`, `api/src/nucleo.py:1740`, `api/src/nucleo.py:904`.

`setProtecao` deriva a chave existente e altera a opção da conta. A API apaga `custodia` e tokens de recuperação, mas não troca o sal/chave nem recifra o documento. Uma custódia retida em um backup, combinada ao `SEGREDO` correspondente, recupera a mesma chave que continua sendo usada após a ativação. A retenção de backups torna esse cenário relevante; não depende de quebrar AES-GCM.

**Reprodução executada:** `node ui/tests/auditoria-protecao.mjs`. Com o host real e servidor em memória, recuperar a chave da custódia anterior, ativar proteção avançada, salvar um documento novo e abri-lo com a chave anterior teve sucesso. A implementação independente de AES-GCM da suíte autentica e decifra o documento. O teste não acessa backups reais.

**Impacto:** a garantia de que somente a pessoa consegue abrir os dados não passa a valer para documentos novos apenas ao ligar a opção. Requer acesso à custódia antiga e ao segredo do servidor, ou à chave já recuperada; não é acesso anônimo pela internet.

**Correção proposta:** transição atômica com uma chave nova independente da anterior, recifragem do documento e histórico, atualização dos parâmetros, invalidação das sessões/envelopes antigos e remoção da custódia. Preservar recuperação de falhas de rede e concorrência. Backups anteriores permanecem capazes de revelar dados anteriores; explicitar esse limite e a retenção. Não basta apagar novamente a linha da custódia.

### A2 — Média: confirmação biométrica não é vinculada à ação protegida no servidor

**Locais:** `api/src/nucleo.py:1389`, `api/src/nucleo.py:623`, `api/src/nucleo.py:1670`.

WebAuthn valida assinatura, origem, desafio, UV e contador, mas a resposta termina em `confirmado: true`. Não cria autorização de uso único associada à operação seguinte. Nas operações irreversíveis, `_exigir_codigo_atual` retorna imediatamente quando não há TOTP, mesmo havendo credencial WebAuthn.

**Reprodução:** conta de teste com credencial WebAuthn cadastrada e sem TOTP; `DELETE /api/conta` com sessão, prova já disponível e frase de confirmação retornou **204**, sem nenhuma confirmação biométrica. O teste está em `api/tests/auditoria_20261103.py`.

**Impacto:** alguém que controle uma sessão desbloqueada e sua prova pode contornar o pedido biométrico da interface. Não foi demonstrado acesso entre usuários nem bypass do login sem credenciais. Proteções puramente locais de exportação também não protegem contra código executando na própria sessão, onde os dados já estão legíveis.

**Correção proposta:** para ações irreversíveis da API, exigir autorização recente, curta e de uso único, vinculada à sessão e à ação, emitida depois da confirmação WebAuthn ou do fator aceito. Testar ausência, expiração, reuso e troca da operação autorizada.

### A3 — Média: troca de senha remove todo o histórico interno

**Local:** `api/src/nucleo.py:1619`; cliente em `ui/js/bridge/host-web.ts:649`.

A troca normal recifra apenas o documento atual e executa `DELETE FROM historico`. A migração PBKDF2 → Argon2id e a recuperação já possuem caminhos de recifragem do histórico, mas a troca normal não os utiliza.

**Reprodução:** histórico com uma versão passou de **1 para 0** após resposta 200 da troca. É comportamento deliberado no código, não perda aleatória, mas elimina a recuperação interna de erros anteriores. Não demonstra exclusão dos backups externos.

**Correção proposta:** preservar e recifrar as versões com o mesmo mecanismo transacional e por etapas; testar históricos grandes e falhas após commit. A nova custódia também é gravada em requisição posterior: existe uma janela sem recuperação, já sinalizada pelo cliente como pendente.

### A4 — Média: máscara de dados pessoais da IA não cobre formatos comuns

**Locais:** `api/src/zo.py:214`, `ui/politica-privacidade.html:89`.

`mascarar('CPF 123 456 789 01; telefone (11) 2345-6789')` devolveu a entrada intacta. O CPF separado por espaços e telefone fixo não são cobertos pelas expressões atuais. A política diz de forma abrangente que CPF e telefones são substituídos antes de sair do servidor.

**Impacto:** dados pessoais podem seguir em texto ao Workers AI, mediante uso do assistente. Não foi enviada informação real ao modelo durante a auditoria. Máscaras regex não equivalem a anonimização, e nomes, descrições e valores financeiros continuam informativos mesmo quando números são removidos.

**Correção proposta:** minimizar campos antes da transmissão, ampliar normalização/detecção com testes de variações, oferecer revisão dos dados enviados e descrever a proteção como tentativa de remoção, com seus limites. Não prometer anonimização completa.

### A5 — Média: parâmetros públicos revelam contas ainda em PBKDF2

**Local:** `api/src/nucleo.py:668`.

Uma conta antiga retorna `kdf: pbkdf2`, enquanto um e-mail inexistente retorna `argon2id-1`. A reprodução local confirmou a distinção. O comentário do código já reconhece a limitação; ela permanece enquanto houver contas antigas. O limite por IP reduz a velocidade, mas não remove o sinal de existência.

**Correção proposta:** concluir a transição das contas legadas e definir uma estratégia de descoberta dos parâmetros que não prometa indistinguibilidade durante a coexistência. Não alterar arbitrariamente KDF/sal de contas reais: isso impediria a abertura dos dados. Não foi enumerada nenhuma conta real.

### A6 — Média: publicação não comprova integridade dos arquivos de dependências

**Locais:** `scripts/deps-em-dia.mjs:8`, `scripts/deps-em-dia.mjs:13`, `api/publicar.ps1:66`, `api/publicar.ps1:130`.

O verificador compara metadados dos dois lockfiles; não calcula hashes dos arquivos em `node_modules`. Uma edição em um JS instalado, mantendo o lockfile interno intacto, não é detectada por ele. O script de publicação reutiliza essa instalação. Além disso, comandos `npx wrangler` não têm versão fixada no projeto; o `pywrangler` instalado usa internamente `npx --yes wrangler`. O workflow de backup, por sua vez, fixa Wrangler e hashes das Actions.

**Impacto:** uma dependência local adulterada ou resolução variável do publicador pode entrar na cadeia de build/publicação. Não há evidência de que isso tenha ocorrido. Testes e CSP não impedem um bundle malicioso publicado na própria origem de ler dados após desbloqueio.

**Correção proposta:** publicar a partir de checkout e dependências limpos, com lockfiles, ferramentas fixadas e ambiente isolado; exigir revisão e proteção de branch, restringir tokens e registrar a procedência do artefato. Não chamar a comparação de metadados de verificação da integridade dos arquivos instalados.

## Riscos adicionais e decisões de arquitetura

- **Custódia padrão:** banco mais `SEGREDO` podem abrir dados de contas sem proteção avançada. É decisão documentada, não falha do AES. `SEGREDO` também sustenta TOTP, envelopes e outras derivações: comprometimento ou perda tem alcance amplo. A rotação exige plano de migração; trocar apenas a variável pode quebrar 2FA e recuperação.
- **Revogação concorrente:** o teste de intercalação revogou sessão e verificador entre autorização e escrita; uma operação já autorizada retornou 200. Isso demonstra uma janela em requisições em andamento, não que novas requisições após logout funcionem. Se for exigida revogação estrita, conferir a geração de autenticação na mesma transação da alteração. O controle de versão já evita muitos conflitos de documento.
- **Verdade financeira:** AES-GCM autentica integridade em relação à chave, não a veracidade de um lançamento. O dono da chave, malware da sessão ou um bundle malicioso pode gerar dados falsos com etiqueta válida. O servidor recebe um documento opaco e não recalcula saldos. Isso diverge da regra genérica de autoridade financeira no servidor em `docs/SEGURANCA.md`; resolver a política considerando a criptografia no cliente. Não é um livro contábil com evidência imutável ou assinatura de instituição financeira.
- **Rollback:** o marcador de versão no navegador ajuda a detectar versões antigas, mas é local e removível. Não oferece proteção universal contra rollback para um aparelho novo ou após limpar armazenamento.
- **Recuperação:** histórico interno limitado a dez cópias e espaçamento de dez minutos não equivale às dez últimas gravações. A política pública simplifica esse comportamento. Backup diário pode deixar até aproximadamente um dia de alterações fora da última cópia externa, dependendo do horário e de falhas.
- **Criptografia própria:** TOTP usa construção própria com fluxo HMAC e etiqueta, e Google tem verificador RSA próprio. Não identifiquei quebra criptográfica nos testes/revisão. São componentes de maior custo de manutenção; preferir primitivas padronizadas do runtime em uma migração testada, sem invalidar dados existentes.
- **Turnstile:** Siteverify é chamado e `success` é exigido, mas hostname/action não são conferidos pelo núcleo. Mesma chave pública aparece em produção e prévia. Verificar restrições do widget e separar contextos se houver necessidade de isolamento de tokens. Não foi demonstrado bypass real do CAPTCHA.
- **Disponibilidade:** limites na API usam D1, de modo que requisições recusadas ainda podem consumir banco. Corpos externos são lidos por inteiro antes de truncamento em alguns adaptadores (`entry.py:91–103`). Os destinos são fixos, reduzindo SSRF, mas timeouts e limites de leitura devem ser explícitos. A proteção volumétrica depende também da borda.

## Evidência executada

| Verificação | Resultado |
|---|---|
| `npm test` | 161 passaram, 0 falhas, 0 pulados |
| `npm run typecheck` | Passou |
| `npm run build` | Passou; bundle principal ~595 kB, aviso de chunk acima de 500 kB |
| `npm run build:portfolio` | Passou |
| `uv run python -m unittest discover -s tests` | 165 passaram, incluindo FastAPI; sem indicação de testes pulados |
| `uv run python -m mypy` | Passou em 8 arquivos |
| `npm audit --json` | 0 vulnerabilidades reportadas |
| Consulta PyPI das versões de `uv.lock` | 27 pacotes, 0 avisos, 0 erros; não substitui todas as bases de advisories |
| Smoke HTTP Vite → Python | HTML/TS, proxy, cadastro, sessão, leitura/escrita em SQLite descartável passaram |
| Negativos HTTP local | Origem externa 403, documento anônimo 401, versão concorrente 409, `no-store` presente |
| Reproduções Python adicionais | Confirmados A2, A3, A4, A5 e janela de revogação |
| Reprodução criptográfica do host | Confirmado A1 usando AES-GCM real, com servidor falso |

As falhas iniciais de execução/rede no sandbox foram resolvidas com execução autorizada fora dele. O teste HTTP encerrou os processos que iniciou e utilizou banco temporário, separado do banco local habitual.

**Consultas remotas, somente públicas, aproximadamente 11:20 de Brasília:**

| Rota | Produção | Prévia |
|---|---|---|
| `GET /api/publico` | 200 | 200 |
| `GET /api/documento`, sem credenciais | 401 | 401 |
| `GET /api/conta/parametros`, e-mail fictício `.invalid` | 200 | 200 |

O último caminho consulta contas e atualiza um contador de limite; portanto, há evidência de operação básica Python/D1 em ambos os ambientes, não de gravação e recuperação de documentos financeiros reais. Curl validou TLS (`ssl_verify_result=0`) sem desabilitar certificados. A página principal de produção respondeu 200 com CSP restritiva, HSTS, `nosniff`, `DENY`, `no-referrer`, COOP/CORP e Permissions-Policy. `HEAD /api/publico` na prévia respondeu 404; `GET` respondeu normalmente. Não interpretar um monitor HEAD como prova de indisponibilidade dessa rota.

## Matriz do escopo solicitado

| Área | Evidência e conclusão delimitada |
|---|---|
| Vite e Python | Builds e integração HTTP local passaram; Vite em loopback, proxy mantém origem |
| Python e Cloudflare | Adaptador Worker/D1 revisado; rotas públicas reais responderam; não houve dry-run Pyodide nem E2E autenticado remoto |
| Armazenamento | SQL parametrizado, escopo por sessão, controle de versão, lotes e guardas; gravação local testada; restauração remota pendente |
| Criptografia | Argon2id/PBKDF2 + HKDF e AES-GCM com IV aleatório e AAD conta/versão; testes independentes passaram; ressalva A1 |
| Login e recuperação | Cookies HttpOnly/Secure/SameSite, sessão expira, prova, TOTP de uso único, códigos backup, tokens e revogação testados; ressalvas A2/A5 |
| SQL injection em banda | Não identificado caminho de concatenação de valores externos nas consultas revisadas; parâmetros separados |
| SQL injection inferencial | Mesma defesa estrutural; não foi executado ataque temporal em produção |
| SQL injection fora de banda | Não identificado caminho de injeção SQL ou saída controlada por SQL; sem sondas OOB em produção |
| Outras injeções / SSRF / traversal | Destinos externos fixos, sem shell/eval na API revisada; importação local limitada; servidor local limita arquivos à pasta pública |
| XSS / CSRF | DOM usa nós de texto e filtra esquemas de script; CSP; checagem de origem/JSON e cookie; testes negativos passaram; sem DAST completo de navegador |
| Acesso entre usuários | Identidade vem da sessão, queries filtram e-mail; casos negativos da suíte passaram; nenhum vazamento entre contas identificado |
| PDF | `window.print`, DOM local e nome sanitizado; não há conversor remoto de HTML/PDF; não foi gerado PDF em navegador nesta auditoria |
| CSV | Gerado no navegador; aspas/delimitadores escapados e prefixos de fórmula neutralizados; testes passaram; sem ensaio em Excel/LibreOffice nesta execução |
| Privacidade das exportações | PDF/CSV legíveis após baixar, sem criptografia ou assinatura de autenticidade embutida; proteção do banco não acompanha o arquivo |
| IA / prompt injection | Consentimento, limites, ferramentas conhecidas, validação e confirmação no cliente; sem acesso direto do modelo ao D1; máscara incompleta A4; sem red-team do modelo real |
| DoS / DDoS / ataques automatizados por IA | Quotas, limites de corpo/profundidade/descompressão e CAPTCHA observados; eficácia volumétrica/WAF não comprovada; IA atacante usa os mesmos vetores |
| TLS / certificados / configuração | HTTPS público validado; não encontrado bypass de validação TLS na API; inventário de versões TLS, painel e renovação não auditados |
| Manipulação do código | Lockfiles e alguns hashes fixos ajudam; A6 e controles de publicação/painel continuam relevantes |
| Funções / ações / consistência | Suítes cobrem serviço financeiro, importação, faturas, ações do Zo, busca e roteamento; não provam cada combinação visual/concorrente |
| Legado / redundâncias | PBKDF2 precisa de migração; produção direta e prévia FastAPI duplicam a superfície de validação; CSS legado é escolha documentada, não vulnerabilidade por si |
| Otimização / manutenção | Bundle principal grande; documento inteiro regravado e validado a cada ação; módulos centrais extensos; perfilar com dados representativos antes de refatorar |

## Etapas ainda necessárias para fechar a auditoria operacional

1. Corrigir A1 e validar a migração preservando documento/histórico, sessões e falhas de rede; corrigir a vinculação da biometria a operações.
2. Executar E2E autenticado em prévia com contas descartáveis: navegador real, Turnstile, Google, e-mail, WebAuthn em dispositivo, Workers AI e persistência após reiniciar/abrir outro aparelho.
3. Validar empacotamento no runtime Pyodide e paridade entre a versão testada e o artefato publicado. SQLite/CPython não substituem esse ensaio.
4. Conferir no painel Cloudflare WAF, limites de borda, TLS mínimo, domínios do Turnstile, tokens/escopos, MFA administrativa, logs e alertas. Não se conclui ativação só pelo arquivo Wrangler.
5. Comprovar execução recente do backup, retenção, posse e recuperação das chaves; restaurar em D1 novo com dados sintéticos e medir RPO/RTO. O documento anterior relata ensaio local, mas não prova o estado atual nem restauração remota completa.
6. Verificar proteções de branches/publicação, acessos GitHub/Cloudflare e procedência dos builds. Não foram inspecionados painéis administrativos, conteúdo de segredos ou todo o histórico Git.
7. Realizar ensaio de carga autorizado em ambiente isolado e testes de abuso do modelo, além de PDF/CSV nos aplicativos de destino. Não houve carga, DDoS, exclusão ou restauração sobre produção.

## Como reproduzir

Na pasta `app`, executar `node ui/tests/auditoria-protecao.mjs`. Na pasta `app/api`, executar `uv run python tests/auditoria_20261103.py` e `uv run python ../scripts/auditoria-http.py`. O smoke exige as portas 5173 e 8787 livres e recusa usá-las se já ocupadas. As asserções dos scripts de reprodução registram os comportamentos encontrados, não os comportamentos seguros desejados; devem ser invertidas/adaptadas após as correções.

Logs: `audit-revisao-tests.log`, `audit-revisao-api.log`, `audit-revisao-deps.json`, `audit-revisao-python-deps.json`. Consulta Python reproduzível com `uv run python ../scripts/auditoria-dependencias.py` (rede necessária).

Referências oficiais consultadas: [D1 Database e batch](https://developers.cloudflare.com/d1/worker-api/d1-database/), [runtime Python Workers](https://developers.cloudflare.com/workers/languages/python/how-python-workers-work/) e [validação Turnstile](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/). As garantias de lote e APIs documentadas foram usadas para interpretar o adaptador, sem substituir validação remota.
