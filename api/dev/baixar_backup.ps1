# ZoZo — baixa os backups do banco (feitos pelo GitHub Actions) para uma pasta sua.
# Use a pasta do OneDrive, do Proton Drive, do Google Drive para computador ou do Dropbox: o programa
# de sincronização leva os arquivos para a nuvem. Os arquivos são .sql.age (cifrados): sem a chave
# PRIVADA do age (zozo-backup-chave.txt), ninguém abre — nem quem tiver acesso à nuvem.
#
#   .\api\dev\baixar_backup.ps1 -Pasta "$env:USERPROFILE\OneDrive\ZoZo-backups"
#   .\api\dev\baixar_backup.ps1 -Pasta "D:\Proton Drive\ZoZo-backups" -ManterDias 365
#
# Precisa do GitHub CLI com login (gh auth login). Só baixa o que ainda não baixou (lista em .baixados.txt
# na própria pasta). O GitHub guarda cada backup por 30 dias: rode pelo menos uma vez por semana
# (agendamento diário: docs/RESTAURACAO.md, seção 0).
param(
  [Parameter(Mandatory = $true)][string]$Pasta,
  [string]$Repositorio = "lukasdelpiero/zozo",
  # 0 = guarda todos; ex.: 365 apaga da pasta os backups com mais de 1 ano (pela data no nome do arquivo)
  [int]$ManterDias = 0
)
$ErrorActionPreference = "Continue"
function Parar($mensagem) { Write-Host $mensagem -ForegroundColor Red; exit 1 }

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { Parar "GitHub CLI (gh) não encontrado. Instale: winget install GitHub.cli" }
gh auth status *> $null
if ($LASTEXITCODE -ne 0) { Parar "Faça login no GitHub CLI: gh auth login" }
New-Item -ItemType Directory -Force -Path $Pasta | Out-Null
$registro = Join-Path $Pasta ".baixados.txt"
$baixados = @()
if (Test-Path $registro) { $baixados = @(Get-Content $registro | Where-Object { $_ }) }

$saida = gh run list --repo $Repositorio --workflow backup-d1.yml --status success --limit 40 --json databaseId
if ($LASTEXITCODE -ne 0) { Parar "Não foi possível listar as execuções do backup (repositório $Repositorio). O workflow backup-d1.yml precisa estar no branch principal (main) do GitHub." }
$execucoes = @(($saida -join "`n") | ConvertFrom-Json)

$novos = 0
foreach ($e in $execucoes) {
  $id = [string]$e.databaseId
  if ($baixados -contains $id) { continue }
  $temp = Join-Path ([IO.Path]::GetTempPath()) ("zozo-backup-" + $id)
  if (Test-Path $temp) { Remove-Item -Recurse -Force $temp }
  gh run download $id --repo $Repositorio --dir $temp *> $null
  if ($LASTEXITCODE -ne 0) {
    # o GitHub apaga os artifacts depois de 30 dias: execução antiga sem arquivo é só pulada
    Write-Host "  execução $id sem arquivo disponível (vencido?): pulada" -ForegroundColor Yellow
    continue
  }
  foreach ($f in Get-ChildItem -Path $temp -Recurse -Filter "zozo-*.sql.age") {
    $destino = Join-Path $Pasta $f.Name
    if (-not (Test-Path $destino)) { Copy-Item $f.FullName $destino; $novos += 1; Write-Host "  + $($f.Name)" }
  }
  Remove-Item -Recurse -Force $temp
  Add-Content -Path $registro -Value $id
}

if ($ManterDias -gt 0) {
  $limite = (Get-Date).Date.AddDays(-$ManterDias)
  foreach ($f in Get-ChildItem -Path $Pasta -Filter "zozo-*.sql.age") {
    if ($f.Name -match '^zozo-(\d{4}-\d{2}-\d{2})') {
      $dia = [datetime]::ParseExact($Matches[1], "yyyy-MM-dd", $null)
      if ($dia -lt $limite) { Remove-Item $f.FullName; Write-Host "  - $($f.Name) (mais de $ManterDias dias)" }
    }
  }
}
Write-Host "Backups novos: $novos · pasta: $Pasta" -ForegroundColor Green
