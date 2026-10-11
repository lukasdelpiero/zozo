# Plano — e-mails do ZoZo (confirmação, recuperação de senha, avisos)

Status (3.0.0): **confirmação de e-mail no cadastro, avisos de senha alterada / 2FA desativado e Argon2id implementados** (Resend; `api/src/emails.py`, migrações 0006 e 0007). **Recuperação de senha continua planejada** — depende da migração de chaves v3 descrita abaixo.

### Como ficou a confirmação (diferente do plano original)

O plano previa `POST /api/email/confirmar { token }` só com o link. Na implementação isso se mostrou um **sequestro de conta por pré-cadastro**: quem cadastrasse o e-mail de outra pessoa com uma senha própria teria essa senha confirmada quando a pessoa clicasse no link. Por isso:

- o link (`#confirmar=<token>`) só **guarda o token na memória da página**; a conta é ativada no **login** (`POST /api/sessao { email, prova, confirmacao }`), com o token **e** a senha certa — quem lê a caixa de entrada e sabe a senha;
- a rota `/api/email/confirmar` não existe; um cadastro pendente é substituído pelo mais recente (quem errou a senha refaz), e o cadastro com Google substitui um pendente;
- o e-mail de confirmação não leva o nome digitado no cadastro (o endereço ainda não foi comprovado);
- testes negativos em `TesteEmail` (`api/tests/test_api.py`).

## O ponto que muda tudo: criptografia de ponta a ponta

Hoje a **chave dos dados é derivada da senha** (PBKDF2 → HKDF `zozo/dados/v2`). O servidor nunca a vê. Consequência:
um link "redefinir senha" **troca o acesso, mas não abre os dados antigos** — sem a senha antiga, ninguém (nem o ZoZo) decifra o documento.

Para a recuperação servir de verdade é preciso, antes, a **migração de chaves v3**:

1. Cada conta passa a ter uma **chave de dados aleatória** (DEK, 256 bits) que cifra o documento.
2. A DEK é guardada **embrulhada** (AES-GCM / AES-KW) duas vezes:
   - com a chave da senha (como hoje, derivada no navegador);
   - com uma **chave de recuperação** — 24 palavras ou um código base32 mostrado **uma vez** no cadastro (e na migração), para a pessoa guardar.
3. Trocar a senha = reembrulhar a DEK (rápido, sem recifrar o documento).
4. Esqueci a senha + tenho a chave de recuperação = abro a DEK, defino senha nova, dados preservados.
5. Esqueci a senha **e** perdi a chave = recomeçar do zero (o link apaga o documento, com confirmação explícita).

Junto com a v3 vale trocar o PBKDF2 por **Argon2id** no navegador (WebAssembly; exige `'wasm-unsafe-eval'` no CSP e um pacote auditado com versão fixa). Os parâmetros ficam gravados por conta, como `iteracoes` hoje.

## Provedor de e-mail (gratuito e compatível com Workers)

| Opção | Como envia | Observação |
|---|---|---|
| **Cloudflare Email Service** (envio pelo Worker) | binding no `wrangler.toml` | Mesmo painel e conta; conferir disponibilidade e limites do plano gratuito na hora de implementar. |
| **Resend** | API HTTPS (`fetch`) | Plano gratuito com cota diária/mensal; DNS (SPF/DKIM) no `usezozo.com.br`. |
| **Brevo** | API HTTPS | Plano gratuito com cota diária. |

Em todos: chave da API só por `npx wrangler secret put EMAIL_API_KEY` (nunca no código/log), domínio com **SPF, DKIM e DMARC** (`p=quarantine` → `reject`), remetente fixo `nao-responda@usezozo.com.br`, texto simples + HTML sem imagens remotas, sem dados financeiros.

## Fluxos

### 1. Confirmação de e-mail obrigatória no cadastro
- `POST /api/conta` cria a conta como **pendente** e responde sempre o mesmo: "Enviamos um link para o seu e-mail" (também se o e-mail já existe — aí o e-mail enviado diz "alguém tentou criar uma conta com este e-mail"). Isso **fecha a enumeração de contas** que existe hoje.
- O link: `https://usezozo.com.br/#confirmar=<token>` — o token vai no **fragmento** (`#`): não aparece em logs do servidor, proxies nem no `Referer`. A página lê o fragmento, apaga-o da barra (`history.replaceState`) e faz `POST /api/email/confirmar { token }`.
- Conta pendente: não entra (ou entra só para reenviar o link). Pendentes com mais de 7 dias são apagadas.
- "Continuar com Google" continua confirmando direto (o Google já provou o e-mail).

### 2. Recuperação de senha
- `POST /api/senha/esqueci { email, turnstile }` → resposta sempre igual ("se houver conta, enviamos um link"), com CAPTCHA e limite por IP e por e-mail.
- `POST /api/senha/redefinir { token, sal, iteracoes, prova, dekEmbrulhada, codigo2fa? }`:
  - com a chave de recuperação (v3): a página abre a DEK com ela e grava a nova senha → dados preservados;
  - sem a chave: a página avisa que os dados serão apagados e só segue com confirmação explícita;
  - **2FA ativo continua exigindo o código** (o e-mail sozinho não basta para tomar a conta);
  - todas as sessões são encerradas.

### 3. Aviso de senha alterada (e de outras mudanças sensíveis)
- Depois de `PUT /api/conta/senha` (e de desativar o 2FA, excluir a conta, redefinir a senha): e-mail "Sua senha do ZoZo foi alterada em 10/10/2026 às 14:32". Sem IP e sem localização; com "Não foi você?" → link para redefinir a senha e a orientação de ativar o 2FA.
- O envio acontece **depois** da gravação ter dado certo; uma falha no envio é registrada (`ctx.evento("email_falhou")`) e não desfaz a troca.

## Tokens (confirmação e recuperação)

- 32 bytes de `secrets.token_urlsafe`; o banco guarda **só o SHA-256** (tabela nova `tokens_email`: `hash`, `email`, `finalidade`, `criado`, `expira`, `usado`) — migração `0006_tokens_email.sql`.
- Validade: confirmação 24 h; recuperação **30 min**. **Uso único** (marcado como usado na mesma transação que aplica a mudança); um novo pedido invalida os anteriores da mesma finalidade.
- Comparação em tempo constante; nunca em logs ou analytics.
- Limites: 3 envios/h por e-mail, 10/h por IP; CAPTCHA no pedido.

## Testes negativos a escrever (api/tests/test_api.py)

Token reutilizado → recusado; token vencido → recusado; token de outra finalidade → recusado; resposta igual para e-mail com e sem conta; 2FA exigido na redefinição; sessões antigas encerradas após redefinir; limite de envios por e-mail/IP; o token não aparece em nenhum log.
