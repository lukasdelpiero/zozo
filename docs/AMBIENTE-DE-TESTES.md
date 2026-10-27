# Ambiente de testes (prévia) — passo a passo

O ZoZo tem **dois sites separados**, cada um com o **seu próprio banco de dados**:

| | Endereço | Quem usa |
|---|---|---|
| **Principal (produção)** | https://usezozo.com.br (o workers.dev da produção fica desligado desde a 3.14) | os usuários |
| **Testes (prévia)** | https://zozo-previa.zozo-finance-app.workers.dev | só você, para testar antes |

Tudo o que você faz na prévia (criar conta, lançamentos, apagar dados…) **não afeta** o site principal.
A ideia é sempre: **mudou algo → publica na prévia → testa → só então publica no principal.**

---

## 1. Configurar (uma vez só)

A prévia é aberta (sem Cloudflare Access): qualquer pessoa com o endereço vê a tela de login, mas o banco é separado e só tem dados de teste.

**Perfis, boletos e Pix** aparecem só para a conta de demonstração e para os e-mails que você liberar. Para liberar a sua conta (uma vez em cada ambiente), dentro de `ZoZo/api`:

- `npx wrangler secret put RECURSOS_AVANCADOS --env previa` → cole o seu e-mail (vários: separados por vírgula) e Enter.
- `npx wrangler secret put RECURSOS_AVANCADOS` → o mesmo, para o site principal.

## 2. Publicar a prévia (sempre que quiser testar algo)

**Pelo VS Code (mais fácil):**
1. Menu **Terminal** → **Executar Tarefa…** (Run Task…).
2. Escolha **ZoZo: publicar na prévia (testes)**.
3. Espere aparecer **"Pronto: https://zozo-previa…"** em verde (1 a 2 minutos).

O que acontece por trás: roda os testes automáticos (se algo falhar, **nada é publicado**), monta o site, atualiza o banco de testes e publica.

**Pelo terminal (alternativa):** `.\api\publicar.ps1 previa` (dentro da pasta `ZoZo`).

## 3. Acessar a prévia

1. Abra **https://zozo-previa.zozo-finance-app.workers.dev**.
2. Aparece a tela do ZoZo (**Entrar no ZoZo**).
   - **Conta de demonstração:** **Continuar com e-mail** → **demo@usezozo.com.br** → senha **zozo1234** (dados fictícios, nada é salvo).
   - **Sua conta de testes:** **Inscreva-se** na primeira vez; depois, **Continuar com e-mail** → seu e-mail → sua senha.

## 4. Publicar no site principal

Depois de testar e gostar do resultado:
1. **Terminal** → **Executar Tarefa…** → **ZoZo: publicar em produção**.
2. O terminal pergunta se você já testou: digite **PUBLICAR** e Enter.
3. Antes de mexer no banco, o script registra um **ponto de restauração** e mostra o comando para voltar, se algo der errado.

## Se algo der errado

| O que aparece | O que fazer |
|---|---|
| "Não foi possível falar com o servidor do ZoZo" | A prévia está com configuração antiga: publique de novo (passo 2). |
| "Verificação de segurança" / "A proteção do Cloudflare pediu uma nova verificação" | O modo Under Attack (ou uma regra de desafio) está barrando a API. Recarregue a página; para não acontecer mais, veja "Cloudflare na frente do ZoZo" no LEIA-ME. |
| "Não foi possível concluir a operação (código …)" | Me mande o código que aparece entre parênteses: ele diz exatamente o que falhou. |
| A publicação parou com texto vermelho | Leia a mensagem: se foram os testes, nada foi publicado (seguro). Me mande o texto. |
| Voltar o banco principal a um momento anterior | Use o comando mostrado na publicação (também fica em `api/restauracao.log`). |

---

## Opcional: ligar o "Continuar com Google"

O botão já existe; falta criar a "credencial" do ZoZo no Google (gratuito):

1. Acesse **console.cloud.google.com** → crie um projeto chamado **ZoZo**.
2. **APIs e serviços** → **Tela de consentimento OAuth** → tipo **Externo** → nome **ZoZo**, seu e-mail de suporte → Salvar. Em *Escopos*, adicione `openid`, `email` e `profile`.
3. **APIs e serviços** → **Credenciais** → **Criar credenciais** → **ID do cliente OAuth** → tipo **Aplicativo da Web**.
4. Em **URIs de redirecionamento autorizados**, adicione os dois:
   - `https://usezozo.com.br/api/google/retorno` (produção: o workers.dev da produção está desligado)
   - `https://zozo-previa.zozo-finance-app.workers.dev/api/google/retorno`
5. Clique em **Criar**. Aparecem o **ID do cliente** e a **Chave secreta do cliente**.
6. No `api/wrangler.toml`, preencha `GOOGLE_CLIENT_ID = "…"` em `[vars]` **e** em `[env.previa.vars]` (é público, pode ficar no arquivo).
7. A chave secreta **não** vai no arquivo. No terminal, dentro de `ZoZo/api`:
   - `npx wrangler secret put GOOGLE_CLIENT_SECRET --env previa` (cole a chave quando pedir)
   - `npx wrangler secret put GOOGLE_CLIENT_SECRET` (para o site principal)
8. Publique (prévia primeiro).

**Como funciona:** o Google confirma **quem você é** (o e-mail). A **senha do ZoZo continua necessária**, porque ela é a chave que cifra seus dados — nem o Google nem o servidor do ZoZo conseguem lê-los. Com o Google, você pula a digitação do e-mail e o CAPTCHA.
