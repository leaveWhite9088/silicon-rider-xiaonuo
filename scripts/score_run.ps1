# 给一次运行打分（--Seed 用于核对种子承诺；-NoRecord 只写文件不追加排行榜）
param(
    [Parameter(Mandatory = $true)][string]$Run,
    [Parameter(Mandatory = $true)][string]$Model,
    [int]$Seed = 0,
    [switch]$NoRecord
)
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$py = Join-Path $root 'src\scoring\score_run.py'
$folder = if (Test-Path $Run) { (Resolve-Path $Run).Path } else { Join-Path $root "runs\$Run" }
$argv = @($py, $folder, $Model)
if ($Seed -gt 0) { $argv += @('--seed', $Seed) }
if ($NoRecord) { $argv += '--no-record' }
python @argv
