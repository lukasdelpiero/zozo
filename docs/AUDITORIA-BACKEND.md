# Auditoria de segurança do back-end — 27/10/2026

Referência: OWASP ASVS 5.0, nível 2 (requisitos aplicáveis). **Não é uma declaração de conformidade completa**: a tabela de cobertura diz o que foi verificado, como, e o que ficou de fora.

## Escopo e ambiente

- Commit analisado: `72841c0` (ramo `correcao-login-e-seguranca`), versão 3.18.0. Correções desta auditoria no commit seguinte.
- Back-end: Python 3.12+ no Cloudflare Python Workers (Pyodide, Python 3.14 no Worker) + D1 (SQLite). Núcleo `api/src/nucleo.py`; adaptador `api/src/entry.py`; FastAPI + Pydantic na frente do núcleo **só na prévia** (`API_FASTAPI`).
- Front-end: Vite 8 + TypeScript; criptografia de ponta a ponta no navegador (`ui/js/bridge/host-web.ts`).
- Serviços externos: Turnstile (CAPTCHA), Google OIDC, Resend (e-mail), Have I Been Pwned (k-anonimato).
- Ambiente de teste: banco SQLite em memória e servidor local, **dados sintéticos**. Nada foi executado contra produção; a única consulta à Cloudflare foi de leitura (configurações da zona e local dos bancos).
- Estado inicial: 118 testes da API, 117 do front, mypy e typecheck — todos passando, sem alterações pendentes.

## Fronteiras de confiança

| Fronteira | Quem decide | Observação |
|---|---|---|
| Navegador → API | servidor (`nucleo._rota`) | identidade só do cookie de sessão; dados exigem sessão **e** prova da senha |
| API → D1 | servidor | SQL sempre parametrizado; operações de várias etapas em lote atômico com a tabela `guarda` |
| API → terceiros | servidor | URLs fixas em HTTPS (sem SSRF); respostas de terceiros validadas (assinatura RS256 do Google) |
| Servidor ↔ dados financeiros | navegador | o servidor só guarda o documento cifrado (AES-256-GCM); regras de dinheiro rodam no navegador |
| Borda | Cloudflare | TLS ≥ 1.2, HTTPS forçado; regras de WAF/limite da zona **não verificadas** (ver abaixo) |

## Cobertura (ASVS 5.0 — áreas aplicáveis)

| Área | Situação | Como foi verificado |
|---|---|---|
| V1 Codificação e injeção (SQL, HTML, cabeçalhos, CSV) | Verificado | leitura de todas as consultas; sondas com `' OR '1'='1` e `"; DROP TABLE` (recusadas, banco intacto); e-mails com `html.escape`; CSV neutraliza `= + - @` tab CR (teste existente) |
| V2 Validação e lógica de negócio | Verificado (2 correções) | sondas de tipo, tamanho e profundidade; regras financeiras cobertas por 60 testes do serviço |
| V3 Segurança do front-end web | Verificado | CSP sem `unsafe-inline`/`unsafe-eval`, `frame-ancestors 'none'`, HSTS, COOP/CORP, `nosniff`, `no-referrer`; sem CORS; sem source maps |
| V4 API e web service | Verificado | métodos fora da lista → 404; `Content-Type` JSON obrigatório (415); limite de corpo; erros só com código |
| V5 Arquivos | Não aplicável | não há upload no servidor (foto do perfil fica dentro do documento cifrado, validada no navegador) |
| V6 Autenticação | Verificado / decisões pendentes | bloqueio progressivo, CAPTCHA, mensagens genéricas, 2FA TOTP com proteção a reuso, recuperação; ver achados M1 e B2 |
| V7 Sessão | Verificado | cookie `__Host-`, `HttpOnly`, `Secure`, `SameSite=Strict`, sem `Max-Age`; token trocado no login e após o 2FA; 24 h absolutas; revogação no servidor |
| V8 Autorização | Verificado | identidade da sessão; sondas: `email` de outra conta no corpo ignorado; sessão de A com prova de B → 403; testes de isolamento existentes |
| V9 Tokens autocontidos (JWT) | Verificado | ID token do Google: `alg` fixo RS256, `kid`, assinatura, `iss`, `aud`, `exp`, `nonce`, `email_verified`; ver B4 |
| V10 OAuth/OIDC | Verificado | código + PKCE S256 + `state` + `nonce`, troca no servidor, cookies assinados de 10 min |
| V11 Criptografia | Verificado | AES-GCM com IV aleatório de 96 bits por gravação; AAD com e-mail+versão; HKDF separa chave e prova; Argon2id/PBKDF2 com parâmetros mínimos impostos pelo cliente; ver B3 |
| V12 Comunicação segura | Parcial | TLS da zona lido na Cloudflare; o `fetch` do Worker valida certificados por padrão (não há opção que desligue) |
| V13 Configuração | Verificado | segredos só por `wrangler secret`; nenhum segredo versionado ou no pacote; sem `SEGREDO` a API recusa tudo (503); CAPTCHA com chave pública e sem secreta recusa (503) |
| V14 Proteção de dados | Verificado | `Cache-Control: no-store` na API; logs com HMAC de e-mail/IP; dados apagados em cascata ao excluir a conta |
| V15 Arquitetura segura e dependências | Verificado | 136 pacotes dos lockfiles consultados na base OSV: nenhuma vulnerabilidade conhecida; `ignore-scripts=true`; versões exatas; ações do GitHub fixadas por hash |
| V16 Registro de eventos | Verificado | eventos de segurança sem senha, prova, cookie, código ou e-mail em texto (teste existente) |
| V17 WebRTC | Não aplicável | — |
| IA | Não aplicável | não há recurso de IA; automação abusiva coberta por limites por IP/conta e CAPTCHA |
| PDF | Não aplicável no servidor | a fatura é impressa pelo próprio navegador a partir do DOM (sem renderização no servidor) |
| Backup e restauração | Parcial | ver M2 |
| Regras de WAF/limite da zona Cloudflare | Não verificado | a API devolveu "sem regras ou sem acesso" (o token não distingue); plano gratuito; `security_level` quase desligado |

## Achados

### Média

**M1 — Ações destrutivas sem fator recente para quem tem 2FA** (corrigido depois da auditoria, por decisão do produto: código atual do 2FA nas três ações; excluir a conta pede a frase EXCLUIR CONTA no lugar da senha e manda e-mail de aviso — testes em `Teste2FA` e `TesteDocumento`)
- `DELETE /api/conta` (`api/src/nucleo.py:1294`), `PUT /api/conta/protecao` desligando a proteção avançada (`:1351`) e `PUT /api/conta/senha` (`:1232`) exigem sessão + prova da senha, mas **não** um código atual do 2FA — ao contrário de `POST /api/2fa/desativar`, que já exige.
- Condição: alguém com a sessão aberta e a prova em memória (aparelho destravado, extensão maliciosa, XSS) exclui a conta de forma irreversível ou religa a cópia da chave no servidor. A prova não é "reautenticação" nesse cenário, porque o navegador a guarda.
- Recomendação: pedir o código do 2FA (quando ativo) nessas três ações, como em desativar o 2FA, e mandar aviso por e-mail ao excluir a conta. Muda telas e fluxo: precisa de decisão.

**M2 — Backup automático desligado; restauração não comprovada nesta auditoria**
- `.github/workflows/backup-d1.yml:15`: o agendamento está comentado (só roda à mão). O D1 guarda histórico próprio (Time Travel: 7 dias no plano gratuito, 30 no pago), e o `publicar.ps1` registra um ponto de restauração antes de cada publicação em produção.
- Não executei restauração nesta auditoria (exigiria exportar o banco de produção). Há um ensaio anterior, de 18/10/2026 (`docs/RESTAURACAO.md`, seção 3): export real da prévia e ciclo completo local com o documento decifrado idêntico; não ensaiado: importar num D1 novo na Cloudflare.
- Depois da auditoria: o workflow ganhou cópia opcional para uma nuvem (rclone) e `api/dev/baixar_backup.ps1` baixa os backups para uma pasta sincronizada (OneDrive, Proton Drive…); passo a passo na seção 0 de `docs/RESTAURACAO.md`. O workflow precisa estar no `main` para rodar.
- Recomendação: cadastrar os 3 segredos do workflow, ligar o `schedule` e fazer um ensaio de restauração num banco isolado (`docs/RESTAURACAO.md`), conferindo contagens e que uma conta de teste abre os dados.

### Baixa

**B1 — JSON aninhado demais derrubava a leitura do corpo em erro 500** (corrigido)
- Sem login, `POST /api/sessao` com `[[[[…` (100 mil níveis) estourava a recursão do leitor de JSON: 500 + evento `falha_no_servidor`. No Worker (Pyodide) a pilha é menor.
- Correção: `RecursionError` vira 400 `INVALID_REQUEST` — `api/src/nucleo.py:303`. O caminho do FastAPI já recusava (Pydantic).
- Teste: `test_json_aninhado_demais_e_recusado_sem_erro_interno` (`api/tests/test_api.py:1338`) — falhava antes, passa depois.

**B2 — Nome aceitava objeto e lista** (corrigido)
- `{"nome": {"x": 1}}` era gravado como o texto `{'x': 1}` (cadastro e troca de nome). Sem impacto de segurança direto (o nome é exibido como texto e escapado no e-mail), mas é validação de tipo ausente.
- Correção: nome tem de ser texto — `api/src/nucleo.py:282`.
- Teste: `test_nome_precisa_ser_texto` (`api/tests/test_api.py:1327`) — falhava antes, passa depois.

**B3 — Cifra do segredo do 2FA é uma construção própria** (aceito, documentado)
- `api/src/totp.py`: fluxo HMAC-SHA256 em modo contador + etiqueta HMAC (cifrar-depois-autenticar), chaves derivadas do `SEGREDO`. É uma construção conhecida e correta, mas não uma primitiva de biblioteca; existe porque o Python do Worker não tem AES nativo. Adulteração e chave errada são recusadas (testes existentes).

**B4 — `aud` em lista sem conferir `azp`** (`api/src/google.py:164`)
- Se o Google mandasse `aud` com vários destinatários, o OIDC pede conferir `azp`. O Google emite `aud` como texto para este fluxo; risco teórico.

**B5 — E-mails em Unicode não normalizados** (não alterado)
- "joão@…" composto (NFC) e decomposto (NFD) criam duas contas distintas (`api/src/nucleo.py:289`). Normalizar agora deixaria sem acesso uma conta já criada na forma NFD (o e-mail também entra no AAD da criptografia). Impacto baixo (navegadores enviam NFC); se for corrigir, fazer com migração.

**B6 — Cadastro revela conta existente quando o e-mail está desligado**
- Sem `RESEND_API_KEY`, `POST /api/conta` responde 409 para e-mail já cadastrado. Com o e-mail ligado, a resposta é sempre 202. O `publicar.ps1` avisa quando falta a chave. Contas antigas ainda em PBKDF2 também se revelam em `/api/conta/parametros` até o próximo login (documentado no código; limitado por IP).

### Informativo (decisões já documentadas)

- **Recuperação de senha com cópia da chave no servidor** (`custodia`): quem tem o banco **e** o `SEGREDO` abre os dados de quem não ligou a proteção avançada; quem só tem o link do e-mail (sem 2FA) recupera os dados. Escolha do produto, descrita no `CLAUDE.md`.
- **XSS continua sendo comprometimento total da sessão**: a chave dos dados e a prova ficam na memória do navegador, e `GET /api/sessao` entrega o envelope ao JavaScript da página. A CSP estrita e a ausência de `innerHTML` são a defesa.
- **Senha mínima e lista de senhas vazadas** são impostas no navegador: o servidor nunca vê a senha (só a prova). Um cliente modificado só enfraquece a própria conta.
- **Lógica financeira no cliente**: o servidor não pode conferir saldos (dados cifrados); as regras estão no serviço de dados, em centavos, com 60 testes.

## Correções e testes

| Achado | Arquivo | Teste | Antes → depois |
|---|---|---|---|
| B1 | `api/src/nucleo.py:303` | `test_json_aninhado_demais_e_recusado_sem_erro_interno` | falha → passa |
| B2 | `api/src/nucleo.py:282` | `test_nome_precisa_ser_texto` | erro → passa |

## Comandos executados

| Comando | Resultado |
|---|---|
| `cd api; uv run python -m unittest discover -s tests` | antes 118 OK; depois 120 OK |
| `cd api; uv run mypy` | sem erros (6 arquivos) |
| `npm test` | 117 de 117 |
| `npm run typecheck` · `npm run build` | ok · ok (sem source maps) |
| Sondas no núcleo (SQLite em memória) | injeção, mass assignment, prova de outra conta, tipos, profundidade, Unicode — resultados acima |
| Sonda no app FastAPI | JSON de 100 mil níveis → 400 |
| OSV `querybatch` (136 pacotes de `package-lock.json` e `api/uv.lock`) | 0 vulnerabilidades conhecidas |
| Busca de segredos em `api/public` | nenhum (um falso positivo nos dados de emojis) |
| Cloudflare (leitura) | bancos em ENAM, sem replicação; zona: TLS ≥ 1.2, HTTPS forçado, TLS 1.3, 0-RTT desligado, plano gratuito |

## Pendências

- **Decisão de produto:** M1 (fator recente nas ações destrutivas), B5 (normalizar e-mails com migração).
- **Infraestrutura/credenciais:** M2 (ligar o backup e ensaiar restauração); conferir no painel da Cloudflare as regras de WAF e de limite de pedidos da zona (a leitura pela API não foi conclusiva); a prévia em `workers.dev` não recebe as regras da zona (aceitável: banco separado, mesmos limites da aplicação).
- **Validação manual:** testar na prévia os fluxos com o FastAPI ligado e o placement novo; confirmar que `RESEND_API_KEY` está configurada em produção (B6).

## Riscos residuais

- XSS ou extensão maliciosa no navegador da pessoa expõem os dados dela (inerente ao modelo; mitigado pela CSP).
- Comprometimento conjunto do banco e do `SEGREDO` expõe os dados das contas sem proteção avançada (escolha do produto).
- Sem WAF/limites de borda comprovados, a proteção contra abuso é a da aplicação (limites por IP e conta, CAPTCHA), que foi testada; volume alto de pedidos ainda consome a cota do Worker e do D1.
