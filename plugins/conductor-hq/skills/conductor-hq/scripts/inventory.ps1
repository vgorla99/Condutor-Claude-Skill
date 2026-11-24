# conductor-hq inventory - READ-ONLY. Lists files under one or more roots and hashes them; never prints file contents.
# Usage: powershell -ExecutionPolicy Bypass -File inventory.ps1 -Out "C:\Projects\Name\HQ\migration" "C:\path\one" "C:\path\two"
# Roots are the trailing arguments (with -File, a comma list would arrive as one string).
[CmdletBinding(PositionalBinding = $false)]
param(
  [Parameter(Mandatory = $true)][string]$Out,
  [Parameter(Mandatory = $true, ValueFromRemainingArguments = $true)][string[]]$Roots,
  [int]$HashMaxMB = 50
)

$skip = '\\(node_modules|\.git|\.venv|venv|__pycache__|\.next|dist|build|out|\.cache)\\'
$secret = '(?i)(^\.env|\.pem$|\.key$|id_rsa|credentials|secret|service-account|firebase-adminsdk)'
New-Item -ItemType Directory -Force -Path $Out | Out-Null

$rows = foreach ($root in $Roots) {
  $base = (Resolve-Path -LiteralPath $root).Path.TrimEnd('\')
  Get-ChildItem -LiteralPath $base -Recurse -File -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch $skip } |
    ForEach-Object {
      $rel = $_.FullName.Substring($base.Length + 1)
      $hash = ''
      if ($_.Length -le $HashMaxMB * 1MB) { $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }
      [pscustomobject]@{
        Root     = $base
        RelPath  = $rel
        TopDir   = ($rel -split '\\')[0]
        Ext      = $_.Extension.ToLower()
        SizeKB   = [math]::Round($_.Length / 1KB, 1)
        Modified = $_.LastWriteTime.ToString('yyyy-MM-dd')
        Hash     = $hash
        Private  = [bool]($_.Name -match $secret)
      }
    }
}

$rows = @($rows)
$rows | Export-Csv -Path (Join-Path $Out 'inventory.csv') -NoTypeInformation -Encoding utf8

$sum = New-Object System.Collections.Generic.List[string]
$sum.Add("# Inventory summary ($(Get-Date -Format 'yyyy-MM-dd HH:mm'))")
$sum.Add('')
$sum.Add("Files: $($rows.Count)   Total: $([math]::Round((($rows | Measure-Object SizeKB -Sum).Sum)/1024,1)) MB")
$sum.Add('')
$sum.Add('## Per root / top folder (files, MB, newest change)')
$rows | Group-Object Root, TopDir | Sort-Object Name | ForEach-Object {
  $mb = [math]::Round((($_.Group | Measure-Object SizeKB -Sum).Sum) / 1024, 1)
  $new = ($_.Group | Sort-Object Modified -Descending | Select-Object -First 1).Modified
  $sum.Add("- $($_.Name): $($_.Count) files, $mb MB, newest $new")
}
$sum.Add('')
$sum.Add('## File types')
$rows | Group-Object Ext | Sort-Object Count -Descending | Select-Object -First 20 | ForEach-Object { $sum.Add("- $(if ($_.Name) { $_.Name } else { '(none)' }): $($_.Count)") }
$sum.Add('')
$dupes = @($rows | Where-Object Hash | Group-Object Hash | Where-Object Count -gt 1)
$dupMB = [math]::Round((($dupes | ForEach-Object { ($_.Group | Select-Object -Skip 1 | Measure-Object SizeKB -Sum).Sum } | Measure-Object -Sum).Sum) / 1024, 1)
$sum.Add("## Duplicates (same content): $($dupes.Count) groups, $dupMB MB reclaimable")
$dupes | Sort-Object { $_.Group[0].SizeKB } -Descending | Select-Object -First 25 | ForEach-Object { $sum.Add("- " + (($_.Group | ForEach-Object { "$($_.Root)\$($_.RelPath)" }) -join '  =  ')) }
$sum.Add('')
$names = @($rows | Group-Object { Split-Path $_.RelPath -Leaf } | Where-Object { $_.Count -gt 1 -and (($_.Group.Hash | Select-Object -Unique).Count -gt 1) })
$sum.Add("## Same name, different content (conflicts): $($names.Count)")
$names | Select-Object -First 25 | ForEach-Object { $sum.Add("- $($_.Name): " + (($_.Group | ForEach-Object { "$($_.Root)\$($_.RelPath) ($($_.Modified))" }) -join ' | ')) }
$sum.Add('')
$priv = @($rows | Where-Object Private)
$sum.Add("## Possibly private (names only, never opened): $($priv.Count)")
$priv | Select-Object -First 50 | ForEach-Object { $sum.Add("- $($_.Root)\$($_.RelPath)") }

$sum | Set-Content -Path (Join-Path $Out 'SUMMARY.md') -Encoding utf8
Write-Output "Wrote $(Join-Path $Out 'inventory.csv') and SUMMARY.md ($($rows.Count) files)."
