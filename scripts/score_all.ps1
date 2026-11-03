# 把 runs/ 下所有运行按种子自动评分（种子从 seeds.json 按承诺哈希匹配），可选接着做多种子汇总
param(
    [string]$SeedsFile = 'seeds.json',
    [string]$Prefix = ''
)
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$py = Join-Path $root 'src\scoring\score_run.py'
$agg = Join-Path $root 'src\scoring\aggregate.py'

$seeds = @{}
$sf = Join-Path $root $SeedsFile
if (Test-Path $sf) {
    (Get-Content $sf -Raw | ConvertFrom-Json).seeds | ForEach-Object { $seeds[$_.commit] = $_.seed }
} else {
    Write-Host "!! 找不到 $SeedsFile，将无法核对种子承诺（只跑评分）"
}

Get-ChildItem (Join-Path $root 'runs') -Directory |
    Where-Object { Test-Path (Join-Path $_.FullName 'protocol.json') } |
    ForEach-Object {
        $proto = Get-Content (Join-Path $_.FullName 'protocol.json') -Raw | ConvertFrom-Json
        $commit = $proto.scene.seed_commit
        $seed = $seeds[$commit]
        if ($seed) {
            python $py $_.FullName $_.Name --seed $seed
        } else {
            Write-Host "跳过（seeds 中没有该承诺）：$($_.Name)"
        }
    }

if ($Prefix) {
    python $agg --prefix (Join-Path $root "runs\$Prefix")
}
