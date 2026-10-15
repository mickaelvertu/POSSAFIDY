$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression

function Normalize-Label([string]$value) {
  [regex]::Replace([regex]::Replace($value.Normalize([Text.NormalizationForm]::FormD), '\p{Mn}', '').ToUpperInvariant(), '[^A-Z0-9]', '')
}
function Read-Xml($archive, [string]$name) {
  $reader = [IO.StreamReader]::new($archive.GetEntry($name).Open())
  try { [xml]$reader.ReadToEnd() } finally { $reader.Dispose() }
}
function Cell-Text($cell, $strings) {
  if (-not $cell) { return '' }
  if ($cell.GetAttribute('t') -eq 'inlineStr') { return ($cell.GetElementsByTagName('t') | ForEach-Object InnerText) -join '' }
  $values = $cell.GetElementsByTagName('v')
  if (-not $values.Count) { return '' }
  if ($cell.GetAttribute('t') -eq 's') { return $strings[[int]$values[0].InnerText] }
  return $values[0].InnerText
}

$stores = (Get-Content (Join-Path $PSScriptRoot 'magasins-importables-2026-10-12.json') -Raw -Encoding UTF8 | ConvertFrom-Json).data
$articles = (Get-Content (Join-Path $PSScriptRoot 'catalogue-importable-2026-10-12.json') -Raw -Encoding UTF8 | ConvertFrom-Json).data.articles
$oldRows = (Get-Content (Join-Path $PSScriptRoot 'stocks-initiaux-2026-10-12.json') -Raw -Encoding UTF8 | ConvertFrom-Json).data
$store = @($stores | Where-Object { (Normalize-Label $_.name) -eq 'ANTSAHABE' })
if ($store.Count -ne 1) { throw 'Antsahabe store is missing or ambiguous.' }
$store = $store[0]
# Reuse only aliases explicitly established by the existing preparation script.
$source = Get-Content (Join-Path $PSScriptRoot 'prepare-initial-stocks.ps1') -Raw -Encoding UTF8
$aliasBlock = [regex]::Match($source, '(?s)\$articleAliases = @\{(.*?)\r?\n\}').Groups[1].Value
$aliases = @{}
foreach ($match in [regex]::Matches($aliasBlock, "'([^']+)'\s*=\s*'([^']+)'")) { $aliases[$match.Groups[1].Value] = $match.Groups[2].Value }
$rows = [Collections.Generic.List[object]]::new()
$unmatched = [Collections.Generic.List[object]]::new()
$seen = @{}
$stream = [IO.File]::Open((Join-Path $PSScriptRoot 'STOCK ANTSAHABE.xlsx'), [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
$archive = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Read)
try {
  $sheets = (Read-Xml $archive 'xl/workbook.xml').GetElementsByTagName('sheet')
  if ($sheets.Count -ne 1 -or $sheets[0].GetAttribute('name') -ne 'ANTSAHABE') { throw 'Unexpected workbook sheets.' }
  $strings = @()
  if ($archive.GetEntry('xl/sharedStrings.xml')) { $strings = @((Read-Xml $archive 'xl/sharedStrings.xml').GetElementsByTagName('si') | ForEach-Object InnerText) }
  foreach ($row in (Read-Xml $archive 'xl/worksheets/sheet1.xml').GetElementsByTagName('row')) {
    $number = [int]$row.GetAttribute('r')
    if ($number -lt 3) { continue }
    $cells = @{}
    foreach ($cell in $row.GetElementsByTagName('c')) { $cells[$cell.GetAttribute('r')] = $cell }
    $label = (Cell-Text $cells["A$number"] $strings).Trim()
    if (-not $label) { continue }
    $raw = (Cell-Text $cells["B$number"] $strings).Trim()
    $quantity = 0.0
    if ($raw -and (-not [double]::TryParse($raw, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$quantity) -or [double]::IsNaN($quantity) -or [double]::IsInfinity($quantity) -or $quantity -lt 0)) { throw "Invalid quantity at B$number" }
    $key = Normalize-Label $label
    $matches = @($articles | Where-Object { $_.article_type -eq 'RESALE' -and (Normalize-Label $_.name) -eq $key })
    if ($matches.Count -eq 0 -and $aliases.ContainsKey($key)) { $matches = @($articles | Where-Object code -eq $aliases[$key]) }
    if ($matches.Count -ne 1) { $unmatched.Add([pscustomobject]@{ row = $number; label = $label; corrected_initial_quantity = $quantity; reason = 'No unique catalogue match' }); continue }
    $article = $matches[0]
    if ($seen.ContainsKey($article.id)) { throw "Duplicate article: $label" }
    $seen[$article.id] = $true
    $previous = @($oldRows | Where-Object { $_.store_id -eq $store.id -and $_.article_id -eq $article.id })
    if ($previous.Count -gt 1) { throw "Duplicate previous initial stock: $label" }
    $old = if ($previous.Count) { $previous[0].quantity } else { 0 }
    $rows.Add([pscustomobject]@{
      store_id = $store.id; article_id = $article.id; article_name = $article.name; source_label = $label; source_row = $number
      blank_as_zero = (-not $raw); previous_initial_quantity_local_file = $old
      corrected_initial_quantity = $quantity; proposed_delta_from_local_file = ($quantity - $old)
    })
  }
} finally { $archive.Dispose(); $stream.Dispose() }
$document = [ordered]@{
  kind = 'INITIAL_STOCK_CORRECTION_PLAN'; source = 'STOCK ANTSAHABE.xlsx'; store_id = $store.id; store_name = $store.name
  review = @{ ready_to_apply = $false; reason = 'Verify live initial import movements and current stock before applying. Local previous quantities are comparison only.' }
  application_rule = 'new current stock = live current stock - sum of live initial import/reimport movements + corrected initial quantity'
  scope = 'Only listed matched Antsahabe articles. Other stores and unlisted articles remain unchanged.'
  summary = @{ matched_rows = $rows.Count; unmatched_rows = $unmatched.Count; zero_rows = @($rows | Where-Object corrected_initial_quantity -eq 0).Count; corrected_quantity_total = ($rows | Measure-Object corrected_initial_quantity -Sum).Sum }
  corrections = @($rows.ToArray()); unmatched = @($unmatched.ToArray())
}
$out = Join-Path $PSScriptRoot 'correction-stock-initial-antsahabe-2026-10-15.json'
[IO.File]::WriteAllText($out, (($document | ConvertTo-Json -Depth 20) + "`n"), [Text.UTF8Encoding]::new($false))
$rows | Export-Csv (Join-Path $PSScriptRoot 'correction-stock-initial-antsahabe-2026-10-15.csv') -Delimiter ';' -NoTypeInformation -Encoding UTF8
$document.summary | ConvertTo-Json
$unmatched | ConvertTo-Json
