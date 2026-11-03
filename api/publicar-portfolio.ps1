# ZoZo — publicar SÓ o portfólio (usezozo.com.br/portfolio), sem publicar o app
#
#   .\api\publicar-portfolio.ps1 previa     → https://zozo-portfolio-previa.zozo-finance-app.workers.dev/portfolio
#   .\api\publicar-portfolio.ps1 producao   → https://usezozo.com.br/portfolio
#
# É outro Worker (api/portfolio/wrangler.toml), só com arquivos estáticos. Passos: monta a página
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
node scripts/deps-em-dia.mjs
if ($LASTEXITCODE -ne 0) {
  Write-Host "   Dependências diferentes do package-lock.json: reinstalando (npm ci)..." -ForegroundColor Gray
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
npx wrangler deploy --config portfolio/wrangler.toml @extra
if ($LASTEXITCODE -ne 0) { Parar "Falha ao publicar o portfólio." }
Write-Host ""
Write-Host "Pronto: $endereco" -ForegroundColor Green
