# ZoZo — publicar no Cloudflare
#
#   .\api\publicar.ps1 previa      → https://zozo-previa.zozo-finance-app.workers.dev  (só testes; usuários não veem)
#   .\api\publicar.ps1 producao    → https://zozo.zozo-finance-app.workers.dev         (usuários)
#
# Passos: testes automáticos → monta a interface → aplica migrações do banco → publica.
# Qualquer falha interrompe tudo. Produção pede confirmação.
param(
  [Parameter(Mandatory = $true)][ValidateSet("previa", "producao")][string]$Ambiente
)
# Falhas são detectadas pelo código de saída de cada comando ($LASTEXITCODE): o Python e o wrangler
# escrevem progresso em stderr, que o PowerShell 5.1 trataria como erro.
$ErrorActionPreference = "Continue"
$env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
Set-Location $PSScriptRoot

$banco = if ($Ambiente -eq "previa") { "zozo-previa" } else { "zozo" }
$extra = if ($Ambiente -eq "previa") { @("--env", "previa") } else { @() }

Write-Host "1/4 Testes automáticos..." -ForegroundColor Cyan
python -m unittest discover -s tests
if ($LASTEXITCODE -ne 0) { throw "Testes falharam: nada foi publicado." }

if ($Ambiente -eq "producao") {
  Write-Host ""
  Write-Host "Você vai publicar em PRODUÇÃO (os usuários verão as mudanças)." -ForegroundColor Yellow
  Write-Host "Já testou na prévia? Digite PUBLICAR para continuar:" -ForegroundColor Yellow
  if ((Read-Host) -ne "PUBLICAR") { Write-Host "Cancelado."; exit 1 }
}

Write-Host "2/4 Montando a interface (api/public)..." -ForegroundColor Cyan
python montar_interface.py
if ($LASTEXITCODE -ne 0) { throw "Falha ao montar a interface." }

Write-Host "3/4 Migrações do banco $banco..." -ForegroundColor Cyan
$env:CI = "true"      # sem perguntas interativas do wrangler
npx wrangler d1 migrations apply $banco --remote @extra
if ($LASTEXITCODE -ne 0) { throw "Falha nas migrações: nada foi publicado." }

Write-Host "4/4 Publicando ($Ambiente)..." -ForegroundColor Cyan
uv run pywrangler deploy @extra
if ($LASTEXITCODE -ne 0) { throw "Falha ao publicar." }
Write-Host "Pronto." -ForegroundColor Green
