# ZoZo — publicar SÓ o portfólio (usezozo.com.br/portfolio), sem publicar o app
#
#   .\api\publicar-portfolio.ps1 previa     → https://zozo-portfolio-previa.zozo-finance-app.workers.dev/portfolio
#   .\api\publicar-portfolio.ps1 producao   → https://usezozo.com.br/portfolio
#
# É outro Worker (api/portfolio/wrangler.toml): arquivos estáticos + o formulário de contato (POST /portfolio/contato,
# segredos TURNSTILE_SECRET e RESEND_API_KEY; ver o wrangler.toml). Passos: monta a página
# (npm run build:portfolio → api/portfolio/public) → publica. Produção pede confirmação.
param(
  [Parameter(Mandatory = $true)][ValidateSet("previa", "producao")][string]$Ambiente
)
$ErrorActionPreference = "Continue"
$env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
Set-Location $PSScriptRoot
$env:CI = "true"      # sem perguntas interativas do wrangler

$extra = if ($Ambiente -eq "previa") { @("--env", "previa") } else { @() }
$endereco = if ($Ambiente -eq "previa") { "https://zozo-portfolio-previa.zozo-finance-app.workers.dev/portfolio" } else { "https://usezozo.com.br/portfolio" }

function Parar($mensagem) { Write-Host ""; Write-Host $mensagem -ForegroundColor Red; exit 1 }

Write-Host "1/2 Montando o portfólio..." -ForegroundColor Cyan
Push-Location ..
# Produção: sempre do zero (npm ci confere o hash de cada pacote baixado). Prévia: só reinstala se o node_modules
# não bate com o package-lock.json (o deps-em-dia compara versão e integridade REGISTRADAS, não o conteúdo dos arquivos)
$reinstalar = $Ambiente -eq "producao"
if (-not $reinstalar) { node scripts/deps-em-dia.mjs; $reinstalar = $LASTEXITCODE -ne 0 }
if ($reinstalar) {
  Write-Host "   Instalando as dependências do package-lock.json (npm ci)..." -ForegroundColor Gray
  npm ci
  if ($LASTEXITCODE -ne 0) { Pop-Location; Parar "Falha ao instalar as dependências (npm ci): nada foi publicado." }
}
npm run build:portfolio
if ($LASTEXITCODE -ne 0) { Pop-Location; Parar "Falha ao montar o portfólio: nada foi publicado." }
Pop-Location

if ($Ambiente -eq "producao") {
  Write-Host ""
  Write-Host "Você vai publicar o portfólio em PRODUÇÃO (usezozo.com.br/portfolio). O app não muda." -ForegroundColor Yellow
  Write-Host "Já conferiu na prévia? Digite PUBLICAR para continuar:" -ForegroundColor Yellow
  if ((Read-Host) -ne "PUBLICAR") { Write-Host "Cancelado: nada foi publicado."; exit 1 }
}

Write-Host "2/2 Publicando..." -ForegroundColor Cyan
npx --no-install wrangler deploy --config portfolio/wrangler.toml @extra
if ($LASTEXITCODE -ne 0) { Parar "Falha ao publicar o portfólio." }
Write-Host ""
Write-Host "Pronto: $endereco" -ForegroundColor Green
