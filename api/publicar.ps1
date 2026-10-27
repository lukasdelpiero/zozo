# ZoZo — publicar no Cloudflare
#
#   .\api\publicar.ps1 previa      → https://zozo-previa.zozo-finance-app.workers.dev  (só testes; usuários não veem)
#   .\api\publicar.ps1 producao    → https://usezozo.com.br                            (usuários; workers.dev desligado)
#
# No VS Code: Terminal › Executar Tarefa… › "ZoZo: publicar na prévia" / "ZoZo: publicar em produção".
#
# Passos: testes automáticos (API + tipos do back-end + serviço de dados + tipos) → segredos → monta a interface (Vite) → (produção: ponto de restauração do banco)
#         → migrações do banco → publica. Qualquer falha interrompe tudo. Produção pede confirmação.
param(
  [Parameter(Mandatory = $true)][ValidateSet("previa", "producao")][string]$Ambiente,
  # Produção sem ponto de restauração do banco só com esta opção, de propósito
  [switch]$SemPontoDeRestauracao
)
# Falhas são detectadas pelo código de saída de cada comando ($LASTEXITCODE): o Python e o wrangler
# escrevem progresso em stderr, que o PowerShell 5.1 trataria como erro.
$ErrorActionPreference = "Continue"
$env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
Set-Location $PSScriptRoot
$env:CI = "true"      # sem perguntas interativas do wrangler

$banco = if ($Ambiente -eq "previa") { "zozo-previa" } else { "zozo" }
$extra = if ($Ambiente -eq "previa") { @("--env", "previa") } else { @() }
$endereco = if ($Ambiente -eq "previa") { "https://zozo-previa.zozo-finance-app.workers.dev" } else { "https://usezozo.com.br" }

function Parar($mensagem) { Write-Host ""; Write-Host $mensagem -ForegroundColor Red; exit 1 }

Write-Host "1/6 Testes automáticos..." -ForegroundColor Cyan
# uv run: usa o ambiente do projeto (FastAPI/Pydantic nas mesmas versões do Worker; mypy do grupo dev)
uv run python -m unittest discover -s tests
if ($LASTEXITCODE -ne 0) { Parar "Testes da API falharam: nada foi publicado." }
uv run mypy
if ($LASTEXITCODE -ne 0) { Parar "Erros de tipo no back-end (mypy): nada foi publicado." }
Push-Location ..
# Dependências da interface exatamente como no package-lock.json (sem scripts de instalação: .npmrc)
# Exatamente como no package-lock.json (versão e integridade de cada pacote). Se o node_modules já confere,
# não reinstala — no Windows, arquivos em uso (ex.: "npm run dev" aberto) impediriam o npm ci de apagá-lo.
node scripts/deps-em-dia.mjs
if ($LASTEXITCODE -ne 0) {
  Write-Host "   Dependências diferentes do package-lock.json: reinstalando (npm ci)..." -ForegroundColor Gray
  npm ci
  if ($LASTEXITCODE -ne 0) { Pop-Location; Parar "Falha ao instalar as dependências da interface (npm ci). Se apareceu EPERM, feche o 'npm run dev' (e a tarefa 'ZoZo: interface (Vite)' do VS Code) e publique de novo." }
} else {
  Write-Host "   Dependências conferem com o package-lock.json." -ForegroundColor Gray
}
npm test
if ($LASTEXITCODE -ne 0) { Pop-Location; Parar "Testes do serviço de dados falharam: nada foi publicado." }
npm run typecheck
if ($LASTEXITCODE -ne 0) { Pop-Location; Parar "Erros de tipo (TypeScript): nada foi publicado." }
Pop-Location

if ($Ambiente -eq "producao") {
  $pendentes = git -C .. status --porcelain
  Write-Host ""
  if ($pendentes) {
    Write-Host "Atenção: há mudanças NÃO salvas no git (commit). O ideal é publicar só código já salvo e revisado." -ForegroundColor Yellow
  }
  Write-Host "Você vai publicar em PRODUÇÃO (os usuários verão as mudanças)." -ForegroundColor Yellow
  Write-Host "Já testou na prévia? Digite PUBLICAR para continuar:" -ForegroundColor Yellow
  if ((Read-Host) -ne "PUBLICAR") { Write-Host "Cancelado: nada foi publicado."; exit 1 }
}

Write-Host "2/6 Segredos do ambiente..." -ForegroundColor Cyan
# A lista precisa vir certa: uma falha (rede, login vencido) NUNCA pode parecer "segredo ausente".
# Trocar o SEGREDO sem querer deixa o 2FA de todos sem funcionar.
$saida = npx wrangler secret list @extra 2>$null
if ($LASTEXITCODE -ne 0) { Parar "Não foi possível listar os segredos (rede ou login do wrangler). Nada foi publicado e nenhum segredo foi alterado." }
try { $segredos = @(($saida -join "`n") | ConvertFrom-Json) } catch { Parar "Resposta inesperada ao listar os segredos. Nada foi publicado e nenhum segredo foi alterado." }
$nomes = @($segredos | ForEach-Object { $_.name })
if ($nomes -notcontains "SEGREDO") {
  if ($Ambiente -eq "producao") {
    # Em produção o SEGREDO só é criado de propósito, uma vez, fora da publicação
    Parar "SEGREDO não encontrado em produção. Se é mesmo a primeira publicação, crie-o de propósito: npx wrangler secret put SEGREDO (um texto aleatório longo). Nada foi publicado."
  }
  Write-Host "   SEGREDO não existe na prévia: gerando um aleatório (não aparece na tela)..."
  python -c "import secrets; print(secrets.token_urlsafe(48), end='')" | npx wrangler secret put SEGREDO @extra
  if ($LASTEXITCODE -ne 0) { Parar "Não foi possível criar o SEGREDO." }
}
if ($nomes -notcontains "TURNSTILE_SECRET") {
  # Com a chave pública no wrangler.toml e sem a secreta, a API recusa cadastro e logins que pedem CAPTCHA
  Write-Host "   TURNSTILE_SECRET não configurado: sem ele, o cadastro e o login com CAPTCHA são recusados." -ForegroundColor Yellow
  Write-Host "   Para configurar: Cloudflare › Turnstile › ZoZo login › copie a Secret Key e rode: npx wrangler secret put TURNSTILE_SECRET $($extra -join ' ')" -ForegroundColor Yellow
  if ($Ambiente -eq "producao") { Parar "Configure o TURNSTILE_SECRET e publique de novo: nada foi publicado." }
}
if ($nomes -notcontains "RESEND_API_KEY") {
  Write-Host "   Aviso: RESEND_API_KEY não configurado — sem e-mail: o cadastro não pede confirmação e não há aviso de senha alterada." -ForegroundColor Yellow
  Write-Host "   Para ligar: npx wrangler secret put RESEND_API_KEY $($extra -join ' ')  (chave em resend.com › API Keys, permissão só de envio)" -ForegroundColor Yellow
}
if ($nomes -notcontains "RECURSOS_CAMBIO") {
  Write-Host "   Aviso: RECURSOS_CAMBIO não configurado — levar transações entre moedas fica só para a demonstração e as contas de RECURSOS_AVANCADOS." -ForegroundColor Yellow
}
if ($nomes -notcontains "RECURSOS_AVANCADOS") {
  Write-Host "   Aviso: RECURSOS_AVANCADOS não configurado — Perfis, boletos e Pix ficam só na conta de demonstração." -ForegroundColor Yellow
  Write-Host "   Para liberar a sua conta: npx wrangler secret put RECURSOS_AVANCADOS $($extra -join ' ')  (e-mails separados por vírgula)" -ForegroundColor Yellow
}

Write-Host "3/6 Montando a interface (Vite → api/public)..." -ForegroundColor Cyan
Push-Location ..
npm run build
$falhou = $LASTEXITCODE -ne 0
Pop-Location
if ($falhou) { Parar "Falha ao montar a interface." }
if (-not (Test-Path "public/_headers")) { Parar "Interface montada sem os cabeçalhos de segurança: nada foi publicado." }

if ($Ambiente -eq "producao") {
  Write-Host "4/6 Ponto de restauração do banco (antes das migrações)..." -ForegroundColor Cyan
  $info = (npx wrangler d1 time-travel info $banco 2>$null) -join "`n"
  $marcador = [regex]::Match($info, "bookmark[^\w]*([0-9a-f\-]{20,})").Groups[1].Value
  if ($marcador) {
    Add-Content -Path (Join-Path $PSScriptRoot "restauracao.log") -Value "$(Get-Date -Format s)  $banco  $marcador"
    Write-Host "   Se precisar voltar o banco a este momento:" -ForegroundColor Gray
    Write-Host "   npx wrangler d1 time-travel restore $banco --bookmark=$marcador" -ForegroundColor Gray
  } else {
    if (-not $SemPontoDeRestauracao) {
      Parar "Não foi possível registrar o ponto de restauração do banco: nada foi publicado. Confira o login do wrangler ('npx wrangler d1 time-travel info $banco'). Para publicar mesmo assim, de propósito: .\publicar.ps1 producao -SemPontoDeRestauracao"
    }
    Write-Host "   Atenção: publicando SEM ponto de restauração (-SemPontoDeRestauracao). O D1 guarda histórico (30 dias no plano pago, 7 no gratuito): veja 'npx wrangler d1 time-travel info $banco'" -ForegroundColor Yellow
  }
} else {
  Write-Host "4/6 (prévia: banco de testes, sem ponto de restauração)" -ForegroundColor Cyan
}

Write-Host "5/6 Migrações do banco $banco..." -ForegroundColor Cyan
npx wrangler d1 migrations apply $banco --remote @extra
if ($LASTEXITCODE -ne 0) { Parar "Falha nas migrações: nada foi publicado." }

Write-Host "6/6 Publicando ($Ambiente)..." -ForegroundColor Cyan
uv run pywrangler deploy @extra
# As migrações acima já valeram no banco: por isso elas são sempre aditivas (a versão anterior do site continua funcionando)
if ($LASTEXITCODE -ne 0) { Parar "Falha ao publicar o código. Atenção: as migrações do banco JÁ foram aplicadas (são compatíveis com a versão no ar). Corrija e publique de novo." }
Write-Host ""
Write-Host "Pronto: $endereco" -ForegroundColor Green
