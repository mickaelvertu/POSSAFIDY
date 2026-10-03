$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.IO.Compression.FileSystem

$sourceFile = Get-ChildItem -Path $PSScriptRoot -Filter 'POINT DE VENTE SEPTEMBRE*.xlsx' -File | Select-Object -First 1
if (-not $sourceFile) {
  throw 'Classeur POINT DE VENTE SEPTEMBRE introuvable.'
}

$stores = (Get-Content (Join-Path $PSScriptRoot 'magasins.json') -Raw | ConvertFrom-Json).data
$articles = (Get-Content (Join-Path $PSScriptRoot 'catalogue-a-verifier.json') -Raw | ConvertFrom-Json).data.articles

function Normalize-Label([string]$value) {
  $decomposed = $value.Normalize([System.Text.NormalizationForm]::FormD)
  $withoutMarks = [regex]::Replace($decomposed, '\p{Mn}', '')
  return [regex]::Replace($withoutMarks.ToUpperInvariant(), '[^A-Z0-9]', '')
}

function Read-XlsxXml([System.IO.Compression.ZipArchive]$archive, [string]$entryName) {
  $entry = $archive.GetEntry($entryName)
  if (-not $entry) {
    throw "Entrée XLSX manquante : $entryName"
  }

  $reader = [System.IO.StreamReader]::new($entry.Open())
  try {
    return [xml]$reader.ReadToEnd()
  } finally {
    $reader.Dispose()
  }
}

function Get-CellText($cell, [System.Collections.Generic.List[string]]$sharedStrings) {
  if (-not $cell) {
    return ''
  }

  if ($cell.GetAttribute('t') -eq 'inlineStr') {
    return [string]::Concat(($cell.GetElementsByTagName('t') | ForEach-Object { $_.InnerText }))
  }

  $value = $cell.GetElementsByTagName('v') | Select-Object -First 1
  if (-not $value) {
    return ''
  }
  if ($cell.GetAttribute('t') -eq 's') {
    return $sharedStrings[[int]$value.InnerText]
  }
  return $value.InnerText
}

$storesByName = @{}
foreach ($store in $stores) {
  $key = Normalize-Label $store.name
  if (-not $storesByName.ContainsKey($key)) {
    $storesByName[$key] = [System.Collections.Generic.List[object]]::new()
  }
  $storesByName[$key].Add($store)
}

$articlesByName = @{}
foreach ($article in $articles) {
  $key = Normalize-Label $article.name
  if (-not $articlesByName.ContainsKey($key)) {
    $articlesByName[$key] = [System.Collections.Generic.List[object]]::new()
  }
  $articlesByName[$key].Add($article)
}

$archive = [System.IO.Compression.ZipFile]::OpenRead($sourceFile.FullName)
try {
  $workbook = Read-XlsxXml $archive 'xl/workbook.xml'
  $relationships = Read-XlsxXml $archive 'xl/_rels/workbook.xml.rels'
  $targets = @{}
  foreach ($relationship in $relationships.GetElementsByTagName('Relationship')) {
    $targets[$relationship.GetAttribute('Id')] = $relationship.GetAttribute('Target')
  }

  $sharedStrings = [System.Collections.Generic.List[string]]::new()
  if ($archive.GetEntry('xl/sharedStrings.xml')) {
    $sharedStringXml = Read-XlsxXml $archive 'xl/sharedStrings.xml'
    foreach ($item in $sharedStringXml.GetElementsByTagName('si')) {
      $sharedStrings.Add([string]::Concat(($item.GetElementsByTagName('t') | ForEach-Object { $_.InnerText })))
    }
  }

  $candidates = [System.Collections.Generic.List[object]]::new()
  $unmatchedSheets = [System.Collections.Generic.List[object]]::new()
  $unmatchedArticles = @{}
  $invalidRows = [System.Collections.Generic.List[object]]::new()
  $matchedSheets = [System.Collections.Generic.List[object]]::new()

  foreach ($sheet in $workbook.GetElementsByTagName('sheet')) {
    $sheetName = $sheet.GetAttribute('name')
    if ((Normalize-Label $sheetName) -in @('GILEADA', 'RECAP', 'RECAP2', 'RECYCLAGE')) {
      continue
    }

    $relationshipId = $sheet.GetAttribute('id', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
    $target = $targets[$relationshipId]
    $entryName = if ($target.StartsWith('/')) { $target.TrimStart('/') } else { "xl/$target" }
    $sheetXml = Read-XlsxXml $archive $entryName

    $storeKey = Normalize-Label $sheetName
    $storeMatches = if ($storesByName.ContainsKey($storeKey)) { $storesByName[$storeKey] } else { @() }
    if ($storeMatches.Count -ne 1) {
      $unmatchedSheets.Add([pscustomobject]@{
        sheet = $sheetName
        reason = if ($storeMatches.Count -gt 1) { 'Nom correspondant à plusieurs magasins' } else { 'Aucun nom de magasin identique' }
      })
      continue
    }

    $store = $storeMatches[0]
    $sheetCandidateStart = $candidates.Count
    foreach ($row in $sheetXml.GetElementsByTagName('row')) {
      $rowNumber = [int]$row.GetAttribute('r')
      if ($rowNumber -lt 5 -or $rowNumber -gt 130) {
        continue
      }

      $cells = @{}
      foreach ($cell in $row.GetElementsByTagName('c')) {
        $cells[$cell.GetAttribute('r')] = $cell
      }

      $productName = (Get-CellText $cells["A$rowNumber"] $sharedStrings).Trim()
      if (-not $productName -or $productName -eq 'PACK') {
        continue
      }

      $stockCell = $cells["DW$rowNumber"]
      $stockText = Get-CellText $stockCell $sharedStrings
      $quantity = 0.0
      $validQuantity = $stockCell -and $stockCell.GetAttribute('t') -ne 'e' -and
        [double]::TryParse($stockText, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$quantity)
      if (-not $validQuantity -or $quantity -lt 0) {
        $invalidRows.Add([pscustomobject]@{
          sheet = $sheetName
          row = $rowNumber
          product_name = $productName
          stock_cell = "DW$rowNumber"
          value = $stockText
          reason = if (-not $validQuantity) { 'Quantité absente ou non numérique' } else { 'Solde négatif' }
        })
        continue
      }

      $articleKey = Normalize-Label $productName
      $articleMatches = if ($articlesByName.ContainsKey($articleKey)) { $articlesByName[$articleKey] } else { @() }
      if ($articleMatches.Count -ne 1) {
        $issueKey = "$articleKey|$productName"
        if (-not $unmatchedArticles.ContainsKey($issueKey)) {
          $unmatchedArticles[$issueKey] = [pscustomobject]@{
            product_name = $productName
            reason = if ($articleMatches.Count -gt 1) { 'Nom correspondant à plusieurs articles' } else { 'Article absent du catalogue préparé' }
            occurrences = [System.Collections.Generic.List[object]]::new()
          }
        }
        $unmatchedArticles[$issueKey].occurrences.Add([pscustomobject]@{
          sheet = $sheetName
          row = $rowNumber
          quantity = $quantity
        })
        continue
      }

      $article = $articleMatches[0]
      $candidates.Add([pscustomobject]@{
        id = "stock-$($store.id)-$($article.id)"
        store_id = $store.id
        article_id = $article.id
        quantity = $quantity
        reserved_quantity = 0
        updated_at = 0
        legacy_source = [pscustomobject]@{
          workbook = $sourceFile.Name
          sheet = $sheetName
          row = $rowNumber
          product_name = $productName
          stock_quantity_column = 'DW'
          stock_value_column = 'DZ'
        }
      })
    }

    $matchedSheets.Add([pscustomobject]@{
      sheet = $sheetName
      store_id = $store.id
      store_name = $store.name
      recognized_rows = $candidates.Count - $sheetCandidateStart
    })
  }

  $duplicateKeys = @{}
  foreach ($group in ($candidates | Group-Object { "$($_.store_id)|$($_.article_id)" })) {
    if ($group.Count -gt 1) {
      $duplicateKeys[$group.Name] = $true
      foreach ($record in $group.Group) {
        $invalidRows.Add([pscustomobject]@{
          sheet = $record.legacy_source.sheet
          row = $record.legacy_source.row
          product_name = $record.legacy_source.product_name
          value = $record.quantity
          reason = 'Article présent plusieurs fois pour le même magasin; toutes ses lignes sont exclues'
        })
      }
    }
  }

  $timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $data = @($candidates | Where-Object { -not $duplicateKeys.ContainsKey("$($_.store_id)|$($_.article_id)") } | ForEach-Object {
    $_.updated_at = $timestamp
    $_
  } | Sort-Object store_id, article_id)
  $positiveCount = @($data | Where-Object { $_.quantity -gt 0 }).Count
  $review = [pscustomobject]@{
    ready_to_apply = $false
    source_file = $sourceFile.Name
    quantity_column = 'DW'
    quantity_column_formula = 'Solde final (DS + DT - DU)'
    value_column = 'DZ'
    value_column_formula = 'Valeur en ariary (DY - DX), à ne pas importer comme quantité'
    matched_sheets = @($matchedSheets)
    unmatched_sheets = @($unmatchedSheets)
    unmatched_articles = @($unmatchedArticles.Values | Sort-Object product_name, sheet)
    invalid_rows = @($invalidRows)
    record_count = $data.Count
    positive_quantity_count = $positiveCount
    note = 'Partial review only. Exact matches only. Verify excluded sheets and articles before any import; no data was sent to Firebase.'
  }

  $result = [pscustomobject]@{
    version = 1
    exportedAt = [DateTimeOffset]::UtcNow.ToString('o')
    data = $data
    review = $review
  }
  $outputPath = Join-Path $PSScriptRoot 'stocks-a-verifier.json'
  $result | ConvertTo-Json -Depth 30 | Set-Content -Path $outputPath -Encoding utf8

  [pscustomobject]@{
    output = $outputPath
    records = $data.Count
    positive_quantities = $positiveCount
    matched_sheets = $matchedSheets.Count
    unmatched_sheets = $unmatchedSheets.Count
    unmatched_articles = $unmatchedArticles.Count
    invalid_rows = $invalidRows.Count
    ready_to_apply = $false
  } | ConvertTo-Json
} finally {
  $archive.Dispose()
}