# 起一班：开始前记录 t0（B2 从这一刻算起；命令传入或进程启动均可）
param(
    [Parameter(Mandatory = $true)][string]$Model,
    [Parameter(Mandatory = $true)][int]$Seed,
    [string]$T0 = (Get-Date -Format o),
    [ValidateSet('sim_time', 'rounds')][string]$Arrival = 'sim_time'
)
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$client = Join-Path $root 'src\client\rider_client.mjs'
Write-Host "模型=$Model  种子=*****  t0=$T0  供给=$Arrival"
Write-Host "会话为交互式：每轮把一行工具调用 JSON 交给 stdin；status=看状态，quit=收工。"
node $client --model $Model --seed $Seed --t0 $T0 --arrival $Arrival
