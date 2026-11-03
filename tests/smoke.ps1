# 端到端冒烟：跑一班（固定 4 行）→ 断言产物 → 评分（不写排行榜）→ 清理
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$client = Join-Path $root 'src\client\rider_client.mjs'
$scorer = Join-Path $root 'src\scoring\score_run.py'
$out = Join-Path $root 'tests\_tmp\smoke'
if (Test-Path (Join-Path $root 'tests\_tmp')) { Remove-Item (Join-Path $root 'tests\_tmp') -Recurse -Force }

$cmds = @(
    '{"toolName":"search_nearby_orders","parameters":{"radius":5}}',
    '{"toolName":"move_to","parameters":{"targetLocationId":"node_22"}}',
    '{"toolName":"wait","parameters":{"minutes":6}}',
    'quit'
) -join "`n"

$cmds | node $client --model smoke --seed 12345 --t0 ((Get-Date).AddMinutes(-2).ToString('o')) --out $out | Out-Null
foreach ($f in 'trace.jsonl', 'result.json', 'protocol.json') {
    if (-not (Test-Path (Join-Path $out $f))) { throw "冒烟失败：缺少 $f" }
}
python $scorer $out smoke --seed 12345 --no-record | Out-Null
if (-not (Test-Path (Join-Path $out 'factcard.md'))) { throw '冒烟失败：缺少 factcard.md' }
$score = Get-Content (Join-Path $out '评分.json') -Raw | ConvertFrom-Json
if ($null -eq $score.A_outcome) { throw '冒烟失败：评分缺 A_outcome' }
if ($score.seed_verified -ne $true) { throw '冒烟失败：种子承诺未通过核对' }
if ($score.t0_source -ne 'external') { throw "冒烟失败：t0 来源应为 external，实际 $($score.t0_source)" }
if ($score.b2_reliable -ne $true) { throw '冒烟失败：B2 应被标为可信' }

$rounds = (Get-Content (Join-Path $out 'result.json') -Raw | ConvertFrom-Json).rounds
node (Join-Path $root 'tools\verify_replay.mjs') $out --seed 12345 --quiet
if ($LASTEXITCODE -ne 0) { throw '冒烟失败：回放与结算不一致' }
Write-Host "冒烟通过：轮数=$rounds  A=$($score.A_outcome)  B=$($score.B_efficiency)  C=$($score.C_quality)  回放一致"
Remove-Item (Join-Path $root 'tests\_tmp') -Recurse -Force
