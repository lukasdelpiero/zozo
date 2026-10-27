# ZoZo — backup e restauração do banco (D1)

Procedimento ensaiado em 18/10/2026 (versão 3.11.3). **Nunca restaure por cima do banco de usuários para "testar"**: o ensaio usa sempre um banco novo e isolado.

## O que precisa existir para restaurar

| Item | Onde fica | Sem ele |
|---|---|---|
| Export SQL do D1 (contas, documentos cifrados, histórico, sessões) | arquivo `.sql` gerado pelo `wrangler d1 export` | não há o que restaurar |
| Senha de cada usuário | só com o usuário (criptografia de ponta a ponta) | o documento continua cifrado — **é assim de propósito** |
| `SEGREDO` do Worker | segredo do Cloudflare (`wrangler secret`) | 2FA (TOTP), envelopes de sessão e a recuperação de senha (cópias da chave) deixam de funcionar; documentos **não** dependem dele (abrem com a senha) |
| `TURNSTILE_SECRET`, `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`, `RECURSOS_*` | segredos do Cloudflare | cadastro/login com CAPTCHA, Google, e-mail e recursos liberados param |

Os segredos **não** estão no export do banco: guarde um inventário deles (nome e onde obter) fora do Cloudflare.

## 0. Backup automático (diário, GitHub Actions)

`.github/workflows/backup-d1.yml` exporta o banco de produção, confere com `conferir_backup.py` (falha se houver problema) e **cifra com age antes de sair do runner**. Guarda o `.sql.age` como artifact do GitHub por 30 dias e, se configurado, copia para uma nuvem sua. Falha = e-mail do GitHub. O arquivo é sempre o mesmo `.sql.age` cifrado: quem tiver acesso ao GitHub ou à nuvem **não** abre sem a chave privada do age.

**O workflow só funciona no branch principal (`main`)**: o agendamento e o botão "Run workflow" do GitHub só enxergam workflows do `main`. Mescle a PR (ou leve o arquivo para o `main`) antes do passo 4.

### Preparar uma vez

1. **Chave do age** (no seu computador): `winget install FiloSottile.age` e `age-keygen -o zozo-backup-chave.txt`. A linha `# public key: age1…` é a chave pública. **Guarde `zozo-backup-chave.txt` fora deste computador** (cofre de senhas e um pendrive): sem ela nenhum backup abre; com ela, todos abrem. Nunca a coloque no GitHub nem na nuvem dos backups. Perdeu a chave: os backups antigos ficam perdidos (o banco e o Time Travel do D1 não dependem dela); gere um par novo, troque `BACKUP_AGE_RECIPIENT` e siga.
2. **Token da Cloudflare** (token da conta, não pessoal): abra https://dash.cloudflare.com/?to=/:account/api-tokens&permissionGroupKeys=%5B%7B%22key%22%3A%22d1%22%2C%22type%22%3A%22edit%22%7D%5D&name=ZoZo%20backup%20D1 (já vem com a permissão D1 e o nome preenchidos) — ou **Manage account → Account API tokens → Create Token → Create Custom Token → Get started**. Em **Permission policies**, recurso **Entire Account** e só a permissão **D1 Write** (o export do D1 exige escrita). **Review token → Create Token**; o valor aparece uma vez. O ID da conta: na página inicial da conta, menu ao lado do nome → **Copy Account ID**.
3. **Segredos do GitHub**: repositório → Settings → Secrets and variables → Actions → New repository secret: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` e `BACKUP_AGE_RECIPIENT` (a chave pública `age1…`).
4. **Primeiro teste**: Actions → "Backup do banco (D1)" → Run workflow. Abra a execução, baixe o artifact e teste abrir (abaixo).
5. **Ligar todo dia** (03:17 de Brasília): no workflow, apague o `#` das duas linhas de `schedule` e publique no `main`. O GitHub pausa agendamentos de repositórios sem atividade por 60 dias: se isso acontecer, ele avisa por e-mail; reative em Actions.

### Onde guardar uma segunda cópia (escolha uma)

O artifact do GitHub vence em 30 dias e fica na mesma conta do código. Para uma cópia independente:

**A) Direto do GitHub para a nuvem (rclone)** — não depende do seu computador ligado.
- Funciona bem: **Google Drive**, **Dropbox**, **Backblaze B2** (chaves de aplicação; 10 GB grátis). OneDrive também funciona, mas o token pode vencer em ~90 dias (gere de novo quando o backup avisar falha). Proton Drive no rclone ainda é beta: prefira o caminho B.
- No seu computador: `winget install Rclone.Rclone`, depois `rclone config` → `n` (novo) → nome `gdrive` → tipo `drive` (Google Drive), `dropbox` ou `b2` → aceite os padrões → faça login no navegador quando pedir. Teste: `rclone mkdir gdrive:ZoZo-backups`.
- Prefira uma conta ou pasta só para isso. No Google Drive, escolha o escopo `drive.file` no `rclone config` (o rclone só enxerga o que ele mesmo criou).
- `rclone config file` mostra onde está o `rclone.conf`. Copie **só o bloco do remoto** (de `[gdrive]` até o fim dele) para o segredo `RCLONE_CONFIG` e crie `RCLONE_DESTINO` = `gdrive:ZoZo-backups`.
- Pronto: cada execução copia o `.sql.age` para lá, nunca sobrescreve um que já existe e apaga da nuvem os que têm mais de 90 dias.

**B) Para uma pasta sincronizada no seu computador** — OneDrive, **Proton Drive**, Google Drive para computador, Dropbox ou um HD externo. Nenhuma senha de nuvem fica no GitHub.
- Precisa do GitHub CLI com login: `winget install GitHub.cli` e `gh auth login`.
- Teste: `.\api\dev\baixar_backup.ps1 -Pasta "$env:USERPROFILE\OneDrive\ZoZo-backups"` (troque pela pasta do Proton Drive, Google Drive etc.). Ele baixa só os backups que ainda não estão lá. `-ManterDias 365` apaga os de mais de um ano.
- Agendar todo dia às 09:00 (num terminal, uma vez): `schtasks /Create /SC DAILY /ST 09:00 /TN "ZoZo backup" /TR "powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\Lukas\Downloads\ZoZo17\ZoZo\api\dev\baixar_backup.ps1 -Pasta C:\Users\Lukas\OneDrive\ZoZo-backups"`. Se o computador estiver desligado, o dia seguinte pega o que faltou (os artifacts duram 30 dias).

### Abrir um backup

Pegue o `zozo-AAAA-MM-DD.sql.age` (artifact do GitHub, pasta da nuvem ou do computador) e: `age -d -i zozo-backup-chave.txt -o zozo.sql zozo-AAAA-MM-DD.sql.age`. Daí em diante, siga a seção 2 com esse `zozo.sql`. Teste abrir um backup de vez em quando: backup que nunca foi aberto não é backup comprovado.

## 1. Fazer o backup à mão (cópia independente)

```powershell
cd api
npx wrangler d1 export zozo --remote --output backup-AAAA-MM-DD.sql
python -I dev/conferir_backup.py backup-AAAA-MM-DD.sql conferencia.db
```

O export bloqueia o banco por alguns segundos (faça fora do horário de uso). Guarde o `.sql` fora do Cloudflare (ele contém e-mails em texto e documentos cifrados): disco cifrado ou cofre, com acesso restrito. Apague o `conferencia.db` depois de conferir.

`conferir_backup.py` restaura o export num SQLite **novo** e mostra: `integrity_check`, linhas por tabela, migrações aplicadas, contas por KDF, formato de cada documento e do histórico, documentos sem conta. Não imprime e-mails nem conteúdo.

Se o destino já existir, a conferência recusa sem alterá-lo: escolha outro nome. Problemas de formato, integridade ou referências retornam código de saída diferente de zero. O script confere estrutura, não autentica AES-GCM: o ensaio completo ainda exige abrir dados de teste com a senha correta. Importe somente exports SQL de origem confiável.

Na migração automática para Argon2id, todas as versões do histórico são preservadas. Se alguma não abrir, a migração é adiada sem apagar cópias. Se o conjunto não couber num pedido, a migração é feita em etapas: cada cópia recifrada fica na tabela `kdf_etapas` (sem uso até o fechamento) e `PUT /api/conta/kdf` troca documento, chave e histórico numa transação só. Linhas que sobrarem em `kdf_etapas` são de uma tentativa interrompida: não são backups (a próxima tentativa, a troca de senha ou a exclusão da conta as apagam). Não amplie os limites sem avaliar memória e D1.

## 2. Restaurar

**Voltar no tempo (mesmo banco, últimos 7 dias no plano gratuito / 30 no pago):** o `publicar.ps1 producao` registra um ponto antes de cada publicação em `api/restauracao.log`.

```powershell
npx wrangler d1 time-travel info zozo
npx wrangler d1 time-travel restore zozo --bookmark=<marcador>
```

Isso **substitui** o banco inteiro: tudo o que foi gravado depois do marcador é perdido. Use só em incidente real, de preferência depois de exportar o estado atual.

**A partir de um export (cópia independente):** crie um banco novo, importe e só então aponte o Worker para ele.

```powershell
npx wrangler d1 create zozo-restaurado
npx wrangler d1 execute zozo-restaurado --remote --file backup-AAAA-MM-DD.sql
# conferir (contagens, migrações) antes de trocar o database_id no wrangler.toml e publicar
```

## 3. Ensaio de 18/10/2026 — resultado

1. **Export real da prévia** (`wrangler d1 export zozo-previa --remote`): restaurado num SQLite novo com `integrity_check: ok`, as 7 migrações e o esquema completo. A prévia só tinha a conta de demonstração (nenhum documento), então essa etapa provou o export/import, não os dados.
2. **Ensaio completo local** (servidor local, banco descartável): conta nova com 50 lançamentos, conta, categoria e perfil → 2 gravações (versão 2 + 1 no histórico) → backup SQL → **desastre** (documento e histórico apagados) → o app detectou (`DOCUMENT_MISSING`, abriu só para leitura, não gravou nada por cima) → banco novo montado do backup (`integrity_check: ok`) → servidor religado → sessão e chave locais funcionaram → documento **decifrou idêntico**: 50 lançamentos, saldo 1.234,56, acentos, perfis e categorias. As únicas diferenças eram 2 campos de controle (`meta.saldoPorTransacao`, `meta.ultimaGravacao`) gravados pelo próprio app ao abrir.
3. **Time Travel**: responde nos dois bancos reais (`zozo` e `zozo-previa`); pontos de restauração de produção registrados em `api/restauracao.log`.

Não ensaiado (fica para o próximo): importar um export em um **D1 novo** no Cloudflare (`d1 create` + `d1 execute`) e abrir o site apontando para ele; restore de Time Travel (substitui o banco). Repetir o ensaio a cada mudança de esquema (migração nova).

## Pendências

- Backup externo **automático**: pronto no workflow (seção 0); falta ligar — workflow no `main`, segredos e `schedule`.
- Trocar a senha apaga o histórico cifrado com a senha anterior (as versões antigas não abririam com a nova).
- A detecção de "documento sumido" depende de um marcador neste navegador: num dispositivo novo, a ausência parece primeiro uso.
