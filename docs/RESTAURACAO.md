# ZoZo — backup e restauração do banco (D1)

Procedimento ensaiado em 18/10/2026 (versão 3.11.3). **Nunca restaure por cima do banco de usuários para "testar"**: o ensaio usa sempre um banco novo e isolado.

## O que precisa existir para restaurar

| Item | Onde fica | Sem ele |
|---|---|---|
| Export SQL do D1 (contas, documentos cifrados, histórico, sessões) | arquivo `.sql` gerado pelo `wrangler d1 export` | não há o que restaurar |
| Senha de cada usuário | só com o usuário (criptografia de ponta a ponta) | o documento continua cifrado — **é assim de propósito** |
| `SEGREDO` do Worker | segredo do Cloudflare (`wrangler secret`) | 2FA (TOTP) e envelopes de sessão deixam de abrir; documentos **não** dependem dele |
| `TURNSTILE_SECRET`, `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`, `RECURSOS_*` | segredos do Cloudflare | cadastro/login com CAPTCHA, Google, e-mail e recursos liberados param |

Os segredos **não** estão no export do banco: guarde um inventário deles (nome e onde obter) fora do Cloudflare.

## 0. Backup automático (diário, GitHub Actions)

`.github/workflows/backup-d1.yml` roda todo dia às 03:17 (Brasília), ou à mão em Actions → "Backup do banco (D1)" → Run workflow. Exporta o banco de produção, confere com `conferir_backup.py` (falha se houver problema) e **cifra com age antes de sair do runner**. Guarda o arquivo `.sql.age` como artifact por 30 dias (repositório privado; cabe no espaço gratuito enquanto o banco for pequeno). Falha = e-mail do GitHub.

Preparar uma vez:
1. Instale o age (`winget install FiloSottile.age`) e gere o par: `age-keygen -o zozo-backup-chave.txt`. A linha `# public key: age1…` é a chave pública. **Guarde `zozo-backup-chave.txt` fora deste computador** (pendrive/cofre de senhas): sem ela nenhum backup abre; com ela, todos abrem.
2. Cloudflare → Manage account → Account API tokens → Create → Custom: permissão **Account → D1 → Edit**, só esta conta.
3. GitHub → repositório → Settings → Secrets and variables → Actions: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` e `BACKUP_AGE_RECIPIENT` (a chave pública `age1…`).
4. Rode o workflow uma vez à mão e confira o artifact.

Abrir um backup: baixe o artifact (Actions → execução → Artifacts), descompacte e `age -d -i zozo-backup-chave.txt -o zozo.sql zozo-AAAA-MM-DD.sql.age`. Daí em diante, siga a seção 2 com esse `zozo.sql`.

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

- Backup externo **automático** (hoje o export é manual): agendar o `wrangler d1 export` e guardar fora do Cloudflare.
- Trocar a senha apaga o histórico cifrado com a senha anterior (as versões antigas não abririam com a nova).
- A detecção de "documento sumido" depende de um marcador neste navegador: num dispositivo novo, a ausência parece primeiro uso.
