# Ambiente de testes (prévia) — passo a passo

O ZoZo tem **dois sites separados**, cada um com o **seu próprio banco de dados**:

| | Endereço | Quem usa |
|---|---|---|
| **Principal (produção)** | https://zozo.zozo-finance-app.workers.dev | os usuários |
| **Testes (prévia)** | https://zozo-previa.zozo-finance-app.workers.dev | só você, para testar antes |

Tudo o que você faz na prévia (criar conta, lançamentos, apagar dados…) **não afeta** o site principal.
A ideia é sempre: **mudou algo → publica na prévia → testa → só então publica no principal.**

---

## 1. Configurar (uma vez só)

> Você já fez a parte do Cloudflare Access e colou o AUD no `api/wrangler.toml`. Falta só publicar (passo 2).
> Os passos abaixo ficam como referência caso precise refazer.

1. Entre em **dash.cloudflare.com** com a sua conta.
2. Menu da esquerda: **Workers e Pages** → clique em **zozo-previa**.
3. Aba **Configurações** (Settings) → **Domínios e rotas** (Domains & Routes) → na linha **workers.dev**, clique em **Ativar Cloudflare Access** (Enable Cloudflare Access).
4. Clique em **Gerenciar** (Manage) → na política, deixe **apenas** o e-mail `testenviroment@usezozo.com.br` → Salvar.
5. Na mesma tela, copie o **Application Audience (AUD) Tag** (um código longo de letras e números).
6. No VS Code, abra `ZoZo/api/wrangler.toml`, procure `ACCESS_AUD` dentro de `[env.previa.vars]` e cole o código entre as aspas. Salve.

## 2. Publicar a prévia (sempre que quiser testar algo)

**Pelo VS Code (mais fácil):**
1. Menu **Terminal** → **Executar Tarefa…** (Run Task…).
2. Escolha **ZoZo: publicar na prévia (testes)**.
3. Espere aparecer **"Pronto: https://zozo-previa…"** em verde (1 a 2 minutos).

O que acontece por trás: roda os testes automáticos (se algo falhar, **nada é publicado**), monta o site, atualiza o banco de testes e publica.

**Pelo terminal (alternativa):** `.\api\publicar.ps1 previa` (dentro da pasta `ZoZo`).

## 3. Acessar a prévia

1. Abra **https://zozo-previa.zozo-finance-app.workers.dev**.
2. Aparece uma tela da **Cloudflare** pedindo e-mail: digite **testenviroment@usezozo.com.br** → **Enviar código**.
3. Abra a caixa de entrada desse e-mail, copie o código de 6 dígitos e cole na tela da Cloudflare.
4. Agora aparece a tela do ZoZo (**Entrar no ZoZo**).
   - **Primeira vez:** clique em **Inscreva-se** → nome + **insight@usezozo.com.br** → crie a senha que quiser (é a conta de testes do ZoZo).
   - **Próximas vezes:** **Continuar com e-mail** → insight@usezozo.com.br → sua senha.

São duas "portas": a da Cloudflare (só o e-mail de testes passa) e a do próprio ZoZo (a conta de testes).

## 4. Publicar no site principal

Depois de testar e gostar do resultado:
1. **Terminal** → **Executar Tarefa…** → **ZoZo: publicar em produção**.
2. O terminal pergunta se você já testou: digite **PUBLICAR** e Enter.
3. Antes de mexer no banco, o script registra um **ponto de restauração** e mostra o comando para voltar, se algo der errado.

## Se algo der errado

| O que aparece | O que fazer |
|---|---|
| "Não foi possível falar com o servidor do ZoZo" | A prévia está com configuração antiga: publique de novo (passo 2). Se continuar, confira o AUD (passo 1.5–1.6). |
| "Acesso não autorizado a este ambiente" | Você entrou na Cloudflare com outro e-mail. Feche o navegador e entre com testenviroment@usezozo.com.br. |
| A publicação parou com texto vermelho | Leia a mensagem: se foram os testes, nada foi publicado (seguro). Me mande o texto. |
| Voltar o banco principal a um momento anterior | Use o comando mostrado na publicação (também fica em `api/restauracao.log`). |

---

## Opcional: ligar o "Continuar com Google"

O botão já existe; falta criar a "credencial" do ZoZo no Google (gratuito):

1. Acesse **console.cloud.google.com** → crie um projeto chamado **ZoZo**.
2. **APIs e serviços** → **Tela de consentimento OAuth** → tipo **Externo** → nome **ZoZo**, seu e-mail de suporte → Salvar. Em *Escopos*, adicione `openid`, `email` e `profile`.
3. **APIs e serviços** → **Credenciais** → **Criar credenciais** → **ID do cliente OAuth** → tipo **Aplicativo da Web**.
4. Em **URIs de redirecionamento autorizados**, adicione os dois:
   - `https://zozo.zozo-finance-app.workers.dev/api/google/retorno`
   - `https://zozo-previa.zozo-finance-app.workers.dev/api/google/retorno`
5. Clique em **Criar**. Aparecem o **ID do cliente** e a **Chave secreta do cliente**.
6. No `api/wrangler.toml`, preencha `GOOGLE_CLIENT_ID = "…"` em `[vars]` **e** em `[env.previa.vars]` (é público, pode ficar no arquivo).
7. A chave secreta **não** vai no arquivo. No terminal, dentro de `ZoZo/api`:
   - `npx wrangler secret put GOOGLE_CLIENT_SECRET --env previa` (cole a chave quando pedir)
   - `npx wrangler secret put GOOGLE_CLIENT_SECRET` (para o site principal)
8. Publique (prévia primeiro).

**Como funciona:** o Google confirma **quem você é** (o e-mail). A **senha do ZoZo continua necessária**, porque ela é a chave que cifra seus dados — nem o Google nem o servidor do ZoZo conseguem lê-los. Com o Google, você pula a digitação do e-mail e o CAPTCHA.
