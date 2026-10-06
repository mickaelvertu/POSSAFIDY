param(
  [datetime]$Date = (Get-Date).Date,
  [string]$Workbook = 'POINT0426.xlsx'
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

# Rapport de stock de cloture pour une date, a partir du classeur par magasin.
# Chaque jour occupe 4 colonnes : entree | vente | montant | stock de fin.
# L'en-tete de date (ligne 1) est au-dessus de la colonne "entree" : le stock de cloture est donc 3 colonnes plus loin.
# Rien n'est envoye a Firebase.

# Alias de feuilles -> code magasin (nom de feuille normalise).
$sheetAliases = @{
  'ANALAMAHITSY'    = 'POS-08'
  'ANKADINDRATOMBO' = 'REV-06'
  'ANALAKELY'       = 'REV-02'
  'MAJUNGA'         = 'POS-01'
}

# Alias d'articles du classeur -> code article du catalogue (libelle normalise).
# Les libelles incertains ne sont volontairement pas listes : ils apparaissent dans non-rapproches.json.
$articleAliases = @{
  'ANTISTRESSGM'       = 'AS146'
  'AVRPM'              = 'AV147'
  'ASHVAGANDA'         = 'AS087'
  'BAUMEANTICELLULITE' = 'BA010'
  'BEUREDEKARITE'      = 'BK016'
  'HEEUCALUPT'         = 'HE106'
  'HEHELICRISE'        = 'HH059'
  'HERAVITSARA'        = 'HR046'
  'OMEGADIABETA'       = 'OD065'
  'OMEGAGM'            = 'O3050'
  'OMEGAPM'            = 'O3055'
  'SAVONACNE'          = 'SA073'
  'SAVONAMINC'         = 'SA071'
  'SAVONREP'           = 'SR078'
  'TESTGLYCEMIE'       = 'GL109'
  'TESTPALU'           = 'PA113'
  'TESTST'             = 'ST111'
}

# Lignes de services (pas des articles en stock).
$serviceLabels = @('ANALYSE', 'AUTRES', 'CONSULTATION', 'CONTROLE', 'LIVRAISON', 'MASSAGEPARTIEL', 'MASSAGERELAXANT', 'REFLEXO')

function Normalize-Label([string]$value) {
  $decomposed = $value.Normalize([System.Text.NormalizationForm]::FormD)
  $withoutMarks = [regex]::Replace($decomposed, '\p{Mn}', '')
  return [regex]::Replace($withoutMarks.ToUpperInvariant(), '[^A-Z0-9]', '')
}

function ColumnIndex([string]$letters) {
  $n = 0
  foreach ($ch in $letters.ToCharArray()) { $n = $n * 26 + ([int]$ch - 64) }
  return $n
}

function ColumnLetters([int]$index) {
  $s = ''
  while ($index -gt 0) {
    $rem = ($index - 1) % 26
    $s = [string][char](65 + $rem) + $s
    $index = [math]::Floor(($index - 1) / 26)
  }
  return $s
}

function Read-XlsxXml([System.IO.Compression.ZipArchive]$archive, [string]$entryName) {
  $entry = $archive.GetEntry($entryName)
  if (-not $entry) { throw "Entree XLSX manquante : $entryName" }
  $reader = [System.IO.StreamReader]::new($entry.Open())
  try { return [xml]$reader.ReadToEnd() } finally { $reader.Dispose() }
}

function Get-CellText($cell, $sharedStrings) {
  $value = $cell.GetElementsByTagName('v') | Select-Object -First 1
  if (-not $value) { return '' }
  if ($cell.GetAttribute('t') -eq 's') { return $sharedStrings[[int]$value.InnerText] }
  return $value.InnerText
}

$workbookPath = Join-Path $PSScriptRoot $Workbook
if (-not (Test-Path $workbookPath)) { throw "Classeur introuvable : $workbookPath" }

$stores = (Get-Content (Join-Path $PSScriptRoot 'magasins.json') -Raw -Encoding UTF8 | ConvertFrom-Json).data
$articles = (Get-Content (Join-Path $PSScriptRoot 'catalogue-2026-10-01.json') -Raw -Encoding UTF8 | ConvertFrom-Json).data.articles

$storeByName = @{}; foreach ($s in $stores) { $storeByName[(Normalize-Label $s.name)] = $s }
$storeByCode = @{}; foreach ($s in $stores) { $storeByCode[$s.code] = $s }
$articleByName = @{}; foreach ($a in $articles) { $articleByName[(Normalize-Label $a.name)] = $a }
$articleByCode = @{}; foreach ($a in $articles) { $articleByCode[$a.code] = $a }

$serial = [int]($Date.Date - [datetime]'1899-12-30').TotalDays
$dateText = $Date.ToString('yyyy-MM-dd')
$outDir = Join-Path $PSScriptRoot "rapport-stock-$dateText"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$rows = [System.Collections.Generic.List[object]]::new()
$unmatchedSheets = [System.Collections.Generic.List[object]]::new()
$unmatchedArticles = @{}
$skippedServices = @{}
$negatives = [System.Collections.Generic.List[object]]::new()
$duplicates = [System.Collections.Generic.List[object]]::new()
$rowsWithoutStock = [System.Collections.Generic.List[object]]::new()
$totals = [System.Collections.Generic.List[object]]::new()

$archive = [System.IO.Compression.ZipFile]::OpenRead($workbookPath)
try {
  $workbookXml = Read-XlsxXml $archive 'xl/workbook.xml'
  $relationships = Read-XlsxXml $archive 'xl/_rels/workbook.xml.rels'
  $targets = @{}
  foreach ($r in $relationships.GetElementsByTagName('Relationship')) { $targets[$r.GetAttribute('Id')] = $r.GetAttribute('Target') }

  $sharedStrings = [System.Collections.Generic.List[string]]::new()
  if ($archive.GetEntry('xl/sharedStrings.xml')) {
    foreach ($item in (Read-XlsxXml $archive 'xl/sharedStrings.xml').GetElementsByTagName('si')) {
      $sharedStrings.Add([string]::Concat(($item.GetElementsByTagName('t') | ForEach-Object { $_.InnerText })))
    }
  }

  foreach ($sheet in $workbookXml.GetElementsByTagName('sheet')) {
    $sheetName = $sheet.GetAttribute('name')
    $key = Normalize-Label $sheetName
    $store = $null
    if ($sheetAliases.ContainsKey($key)) { $store = $storeByCode[$sheetAliases[$key]] }
    elseif ($storeByName.ContainsKey($key)) { $store = $storeByName[$key] }
    if (-not $store) {
      $unmatchedSheets.Add([pscustomobject]@{ sheet = $sheetName; reason = 'Aucun magasin correspondant' })
      continue
    }

    $target = $targets[$sheet.GetAttribute('id', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')]
    $entryName = if ($target.StartsWith('/')) { $target.TrimStart('/') } else { "xl/$target" }
    $sheetXml = Read-XlsxXml $archive $entryName

    $closingColumn = $null
    foreach ($row in $sheetXml.GetElementsByTagName('row')) {
      if ([int]$row.GetAttribute('r') -ne 1) { continue }
      foreach ($cell in $row.GetElementsByTagName('c')) {
        $text = Get-CellText $cell $sharedStrings
        if ($text -eq [string]$serial) {
          $closingColumn = ColumnLetters ((ColumnIndex ($cell.GetAttribute('r') -replace '\d', '')) + 3)
          break
        }
      }
      break
    }
    if (-not $closingColumn) { throw "La date $dateText n'est pas dans la feuille $sheetName." }

    $seenCodes = @{}
    $storeRows = 0
    $storeUnits = 0.0
    foreach ($row in $sheetXml.GetElementsByTagName('row')) {
      $rowNumber = [int]$row.GetAttribute('r')
      if ($rowNumber -lt 5 -or $rowNumber -gt 130) { continue }
      $label = ''
      $closingText = $null
      foreach ($cell in $row.GetElementsByTagName('c')) {
        $col = $cell.GetAttribute('r') -replace '\d', ''
        if ($col -eq 'A') { $label = (Get-CellText $cell $sharedStrings).Trim() }
        elseif ($col -eq $closingColumn) { $closingText = Get-CellText $cell $sharedStrings }
      }
      if (-not $label) { continue }

      $labelKey = Normalize-Label $label
      if ($serviceLabels -contains $labelKey) { $skippedServices[$label] = $true; continue }

      $article = $null
      if ($articleAliases.ContainsKey($labelKey)) { $article = $articleByCode[$articleAliases[$labelKey]] }
      elseif ($articleByName.ContainsKey($labelKey)) { $article = $articleByName[$labelKey] }
      if (-not $article) {
        if (-not $unmatchedArticles.ContainsKey($label)) { $unmatchedArticles[$label] = [System.Collections.Generic.List[string]]::new() }
        $unmatchedArticles[$label].Add($sheetName)
        continue
      }

      $quantity = 0.0
      if ([string]::IsNullOrWhiteSpace($closingText) -or -not [double]::TryParse($closingText, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$quantity)) {
        $rowsWithoutStock.Add([pscustomobject]@{ sheet = $sheetName; row = $rowNumber; label = $label; value = $closingText })
        continue
      }
      if ($quantity -lt 0) {
        $negatives.Add([pscustomobject]@{ sheet = $sheetName; row = $rowNumber; label = $label; article_code = $article.code; quantity = $quantity })
        continue
      }
      if ($seenCodes.ContainsKey($article.code)) {
        $duplicates.Add([pscustomobject]@{ sheet = $sheetName; row = $rowNumber; label = $label; article_code = $article.code; quantity = $quantity })
        continue
      }
      $seenCodes[$article.code] = $true

      $rows.Add([pscustomobject][ordered]@{
        store_id      = $store.id
        store_code    = $store.code
        store_name    = $store.name
        article_id    = $article.id
        article_code  = $article.code
        article_name  = $article.name
        unit          = $article.unit
        quantity      = $quantity
      })
      $storeRows++
      $storeUnits += $quantity
    }
    $totals.Add([pscustomobject][ordered]@{ sheet = $sheetName; store_code = $store.code; store_name = $store.name; articles = $storeRows; total_units = $storeUnits })
  }
} finally {
  $archive.Dispose()
}

function Escape-Csv($value) {
  $text = [string]$value
  if ($text -match '[";\r\n]') { return '"' + $text.Replace('"', '""') + '"' }
  return $text
}

$headers = 'store_id', 'store_code', 'store_name', 'article_id', 'article_code', 'article_name', 'unit', 'quantity'
$lines = [System.Collections.Generic.List[string]]::new()
$lines.Add(($headers -join ';'))
foreach ($row in $rows) {
  $lines.Add((($headers | ForEach-Object {
    $v = $row.$_
    if ($_ -eq 'quantity') { ([double]$v).ToString([Globalization.CultureInfo]::InvariantCulture) } else { Escape-Csv $v }
  }) -join ';'))
}
$utf8Bom = [System.Text.UTF8Encoding]::new($true)
$utf8 = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText((Join-Path $outDir "stock-$dateText.csv"), ($lines -join "`r`n"), $utf8Bom)

$json = [ordered]@{
  version      = 1
  exportedAt   = (Get-Date).ToString('o')
  report_date  = $dateText
  source_file  = $Workbook
  data         = $rows
}
[System.IO.File]::WriteAllText((Join-Path $outDir "stock-$dateText.json"), ($json | ConvertTo-Json -Depth 5), $utf8)

$review = [ordered]@{
  report_date          = $dateText
  unmatched_sheets     = $unmatchedSheets
  unmatched_articles   = @($unmatchedArticles.Keys | Sort-Object | ForEach-Object { [pscustomobject]@{ label = $_; sheets = $unmatchedArticles[$_].Count } })
  skipped_service_rows = @($skippedServices.Keys | Sort-Object)
  negative_balances    = $negatives
  duplicate_rows       = $duplicates
  rows_without_stock   = $rowsWithoutStock
  totals_by_store      = $totals
}
[System.IO.File]::WriteAllText((Join-Path $outDir 'non-rapproches.json'), ($review | ConvertTo-Json -Depth 5), $utf8)

"Date $dateText (serie $serial) : $($rows.Count) lignes, $($totals.Count) magasins."
"Feuilles non rapprochees : $($unmatchedSheets.Count) ; libelles non rapproches : $($unmatchedArticles.Count) ; soldes negatifs : $($negatives.Count) ; doublons : $($duplicates.Count) ; sans stock : $($rowsWithoutStock.Count)"
"Sortie : $outDir"
