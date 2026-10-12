param(
  [string]$Workbook = 'POINT0426.xlsx',
  [string]$StoresFile = 'magasins-2026-10-12.json',
  [string]$CatalogueFile = 'catalogue-2026-10-12.json'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression

$workbookPath = Join-Path $PSScriptRoot $Workbook
$storesPath = Join-Path $PSScriptRoot $StoresFile
$cataloguePath = Join-Path $PSScriptRoot $CatalogueFile
foreach ($path in @($workbookPath, $storesPath, $cataloguePath)) {
  if (-not (Test-Path $path -PathType Leaf)) {
    throw "Fichier introuvable : $path"
  }
}

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

function Write-Json($path, $document) {
  $json = ConvertTo-Json -InputObject $document -Depth 50
  [System.IO.File]::WriteAllText($path, "$json`n", [System.Text.UTF8Encoding]::new($false))
}

$storeDocument = Get-Content $storesPath -Raw -Encoding UTF8 | ConvertFrom-Json
$catalogueDocument = Get-Content $cataloguePath -Raw -Encoding UTF8 | ConvertFrom-Json
$stores = @($storeDocument.data)
$articles = @($catalogueDocument.data.articles)
$categories = @($catalogueDocument.data.categories)
$tsaralalanaStore = [pscustomobject]@{
  code = 'POS-20'
  created_at = 1791834369598
  id = 'MAG-042'
  is_active = $true
  location = ''
  name = 'Tsaralalana'
  store_type = 'POS'
  updated_at = 1791834369598
}
$storeWithId = @($stores | Where-Object id -eq $tsaralalanaStore.id)
$storeWithCode = @($stores | Where-Object code -eq $tsaralalanaStore.code)
if ($storeWithId.Count -eq 0 -and $storeWithCode.Count -eq 0) {
  $stores += $tsaralalanaStore
} elseif ($storeWithId.Count -ne 1 -or $storeWithCode.Count -ne 1 -or
    $storeWithId[0].id -ne $storeWithCode[0].id -or
    $storeWithId[0].name -ne $tsaralalanaStore.name -or
    $storeWithId[0].store_type -ne $tsaralalanaStore.store_type) {
  throw "Le code POS-20 ou l'ID MAG-042 existe déjà avec une autre définition."
}

$duplicateStoreGroups = @($stores | Group-Object {
  "$($_.store_type)|$(Normalize-Label ([string]$_.name))"
} | Where-Object Count -gt 1)
$excludedStores = [System.Collections.Generic.List[object]]::new()
foreach ($group in $duplicateStoreGroups) {
  $members = @($group.Group)
  if ($members.Count -eq 2 -and
      $members.id -contains 'store-pos-17' -and
      $members.id -contains 'MAG-030') {
    $excludedStores.Add(($members | Where-Object id -eq 'MAG-030'))
  } else {
    throw "Doublon de magasin non résolu : $($group.Name)."
  }
}
$stores = @($stores | Where-Object {
  $_.id -notin @($excludedStores | ForEach-Object { $_.id })
})

foreach ($field in @('id', 'code')) {
  $values = @($stores | ForEach-Object { [string]$_.$field })
  if (($values | Select-Object -Unique).Count -ne $values.Count) {
    throw "Le fichier magasins contient encore des doublons de $field."
  }
}
foreach ($field in @('id', 'code')) {
  $values = @($articles | ForEach-Object { [string]$_.$field })
  if (($values | Select-Object -Unique).Count -ne $values.Count) {
    throw "Le catalogue contient des doublons d'article ($field)."
  }
  $values = @($categories | ForEach-Object { [string]$_.$field })
  if (($values | Select-Object -Unique).Count -ne $values.Count) {
    throw "Le catalogue contient des doublons de catégorie ($field)."
  }
}
$articleNameGroups = @($articles | Group-Object {
  "$($_.article_type)|$(Normalize-Label ([string]$_.name))"
} | Where-Object Count -gt 1)
if ($articleNameGroups.Count -gt 0) {
  throw "Le catalogue contient des doublons article/type : $($articleNameGroups.Name -join ', ')."
}
$categoryNameGroups = @($categories | Group-Object {
  Normalize-Label ([string]$_.name)
} | Where-Object Count -gt 1)
if ($categoryNameGroups.Count -gt 0) {
  throw "Le catalogue contient des catégories en double : $($categoryNameGroups.Name -join ', ')."
}
$categoryIds = @($categories | ForEach-Object { $_.id })
if (@($articles | Where-Object { $_.category_id -notin $categoryIds }).Count -gt 0) {
  throw 'Le catalogue contient une référence de catégorie inconnue.'
}

$storesById = @{}
$storesByCode = @{}
$storesByName = @{}
foreach ($store in $stores) {
  $storesById[$store.id] = $store
  $storesByCode[$store.code] = $store
  $key = Normalize-Label ([string]$store.name)
  if (-not $storesByName.ContainsKey($key)) {
    $storesByName[$key] = [System.Collections.Generic.List[object]]::new()
  }
  $storesByName[$key].Add($store)
}

$articlesByName = @{}
$articlesByCode = @{}
foreach ($article in $articles) {
  $articlesByCode[$article.code] = $article
  $key = Normalize-Label ([string]$article.name)
  if (-not $articlesByName.ContainsKey($key)) {
    $articlesByName[$key] = [System.Collections.Generic.List[object]]::new()
  }
  $articlesByName[$key].Add($article)
}

$sheetStoreAliases = @{
  'ANALAMAHITSY'       = 'POS-08'
  'ANALAKELY'          = 'REV-02'
  'ANKADINDRATOMBO'    = 'REV-06'
  'DEPOTCENTRAL'       = 'DEP-01'
  'MAHAMASINA'         = 'POS-04'
  'MRISMAELCOMMERCIAL' = 'POS-17'
  'TSARALALANA'        = 'POS-20'
}
$articleAliases = @{
  'ANTISTRESSGM'       = 'AS017'
  'AVRPM'              = 'AV012'
  'ASHVAGANDA'         = 'AS087'
  'BAUMERAMBIA'        = 'BR149'
  'CHLONPHE'           = 'CH115'
  'DERMAGGM'           = 'DG039'
  'NONIGM'             = 'NO052'
  'SAVONANTIRIDE'      = 'SA079'
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
  'TESTST'             = 'FT117'
}
$ignoredLabels = @('ASPEGIC', 'HYDROCHLORE', 'OMEGACAPSULE', 'OMEPRAINJ', 'REHASINA', 'SHALLAKI', 'TESTCOMBO', 'CHARBON')
$serviceLabels = @('ANALYSE', 'AUTRES', 'CONSULTATION', 'CONTROLE', 'LIVRAISON', 'MASSAGEPARTIEL', 'MASSAGERELAXANT', 'REFLEXO')

$candidates = [System.Collections.Generic.List[object]]::new()
$provisionalArticles = [System.Collections.Generic.List[object]]::new()
$unmatchedSheets = [System.Collections.Generic.List[object]]::new()
$unmatchedArticles = @{}
$invalidRows = [System.Collections.Generic.List[object]]::new()
$matchedSheets = [System.Collections.Generic.List[object]]::new()
$skippedLabels = [System.Collections.Generic.List[object]]::new()
$emptyQuantityCounts = @{}
$timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()

$stream = [System.IO.FileStream]::new(
  $workbookPath,
  [System.IO.FileMode]::Open,
  [System.IO.FileAccess]::Read,
  [System.IO.FileShare]::ReadWrite
)
$archive = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Read)
try {
  $workbookXml = Read-XlsxXml $archive 'xl/workbook.xml'
  $relationships = Read-XlsxXml $archive 'xl/_rels/workbook.xml.rels'
  $targets = @{}
  foreach ($relationship in $relationships.GetElementsByTagName('Relationship')) {
    $targets[$relationship.GetAttribute('Id')] = $relationship.GetAttribute('Target')
  }

  $sharedStrings = [System.Collections.Generic.List[string]]::new()
  if ($archive.GetEntry('xl/sharedStrings.xml')) {
    foreach ($item in (Read-XlsxXml $archive 'xl/sharedStrings.xml').GetElementsByTagName('si')) {
      $sharedStrings.Add([string]::Concat(($item.GetElementsByTagName('t') | ForEach-Object { $_.InnerText })))
    }
  }

  foreach ($sheet in $workbookXml.GetElementsByTagName('sheet')) {
    $sheetName = $sheet.GetAttribute('name')
    $sheetKey = Normalize-Label $sheetName
    $store = $null
    if ($sheetStoreAliases.ContainsKey($sheetKey)) {
      $code = $sheetStoreAliases[$sheetKey]
      if (-not $storesByCode.ContainsKey($code)) {
        throw "Magasin requis pour l'alias $sheetName introuvable : $code."
      }
      $store = $storesByCode[$code]
    } elseif ($storesByName.ContainsKey($sheetKey) -and $storesByName[$sheetKey].Count -eq 1) {
      $store = $storesByName[$sheetKey][0]
    }

    $target = $targets[$sheet.GetAttribute('id', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')]
    $entryName = if ($target.StartsWith('/')) { $target.TrimStart('/') } else { "xl/$target" }
    $sheetXml = Read-XlsxXml $archive $entryName
    $sheetCandidates = [System.Collections.Generic.List[object]]::new()
    $sheetIssues = 0
    $sheetQuantityRows = 0

    foreach ($row in $sheetXml.GetElementsByTagName('row')) {
      $rowNumber = [int]$row.GetAttribute('r')
      if ($rowNumber -lt 3) {
        continue
      }
      $cells = @{}
      foreach ($cell in $row.GetElementsByTagName('c')) {
        $cells[$cell.GetAttribute('r')] = $cell
      }
      $label = (Get-CellText $cells["A$rowNumber"] $sharedStrings).Trim()
      if (-not $label -or (Normalize-Label $label) -eq 'PACK') {
        continue
      }
      $labelKey = Normalize-Label $label
      if ($serviceLabels -contains $labelKey -or $ignoredLabels -contains $labelKey) {
        $skippedLabels.Add([pscustomobject]@{ sheet = $sheetName; row = $rowNumber; label = $label })
        continue
      }

      $quantityText = (Get-CellText $cells["B$rowNumber"] $sharedStrings).Trim()
      if (-not $quantityText) {
        $emptyQuantityCounts[$sheetName] = 1 + [int]$emptyQuantityCounts[$sheetName]
        continue
      }
      $quantity = 0.0
      if (-not [double]::TryParse(
          $quantityText,
          [Globalization.NumberStyles]::Float,
          [Globalization.CultureInfo]::InvariantCulture,
          [ref]$quantity
        ) -or $quantity -lt 0) {
        $invalidRows.Add([pscustomobject]@{
          sheet = $sheetName
          row = $rowNumber
          label = $label
          value = $quantityText
          reason = if (-not $quantityText) { 'Quantité absente en colonne B' } else { 'Quantité non numérique ou négative en colonne B' }
        })
        $sheetIssues++
        continue
      }

      $sheetQuantityRows++
      if (-not $store) {
        continue
      }

      $article = $null
      if ($articleAliases.ContainsKey($labelKey)) {
        $articleCode = $articleAliases[$labelKey]
        if ($articlesByCode.ContainsKey($articleCode)) {
          $article = $articlesByCode[$articleCode]
        }
      } elseif ($articlesByName.ContainsKey($labelKey)) {
        $articleMatches = @($articlesByName[$labelKey])
        if ($store.store_type -in @('POS', 'RESELLER')) {
          $articleMatches = @($articleMatches | Where-Object article_type -eq 'RESALE')
        }
        if ($articleMatches.Count -eq 1) {
          $article = $articleMatches[0]
        }
      }
      if (-not $article) {
        if ($store.store_type -notin @('POS', 'RESELLER')) {
          $unmatchedArticles[$labelKey] = [pscustomobject]@{ label = $label; sheet = $sheetName; row = $rowNumber }
          $sheetIssues++
          continue
        }

        $category = $categories | Where-Object id -eq 'cat-a-classer' | Select-Object -First 1
        if (-not $category) {
          throw "Catégorie provisoire « À classer » introuvable."
        }
        $slug = $labelKey.ToLowerInvariant() -replace '[^a-z0-9]+', '-'
        $articleId = "article-resale-provisional-$slug"
        if ($articles.id -contains $articleId) {
          throw "L'ID provisoire d'article existe déjà : $articleId."
        }
        $provisionalNumber = $provisionalArticles.Count + 1
        $articleCode = "TMP$('{0:D3}' -f $provisionalNumber)"
        while ($articlesByCode.ContainsKey($articleCode)) {
          $provisionalNumber++
          $articleCode = "TMP$('{0:D3}' -f $provisionalNumber)"
        }
        $article = [pscustomobject]@{
          id = $articleId
          code = $articleCode
          name = $label
          category_id = $category.id
          article_type = 'RESALE'
          unit = 'Piece'
          prix_achat = 0
          prix_normal = 0
          prix_revendeur = 0
          is_active = $true
          created_at = $timestamp
          updated_at = $timestamp
        }
        $articles += $article
        $articlesByCode[$article.code] = $article
        $articlesByName[$labelKey] = [System.Collections.Generic.List[object]]::new()
        $articlesByName[$labelKey].Add($article)
        $provisionalArticles.Add([pscustomobject]@{
          id = $article.id
          code = $article.code
          name = $article.name
          category_id = $article.category_id
          article_type = $article.article_type
          unit = $article.unit
          prix_achat = $article.prix_achat
          prix_normal = $article.prix_normal
          prix_revendeur = $article.prix_revendeur
          reason = 'Fiche créée provisoirement avec les valeurs autorisées; prix réels à compléter avant vente.'
          occurrences = [System.Collections.Generic.List[object]]::new()
        })
        $sheetIssues++
      }
      $provisionalRecord = $provisionalArticles | Where-Object id -eq $article.id | Select-Object -First 1
      if ($provisionalRecord) {
        $provisionalRecord.occurrences.Add([pscustomobject]@{
          sheet = $sheetName
          row = $rowNumber
          quantity = $quantity
        })
      }
      if ($store.store_type -in @('POS', 'RESELLER') -and $article.article_type -ne 'RESALE') {
        $invalidRows.Add([pscustomobject]@{
          sheet = $sheetName
          row = $rowNumber
          label = $label
          value = $quantity
          reason = "Un magasin $($store.store_type) ne peut recevoir que des articles RESALE."
        })
        $sheetIssues++
        continue
      }

      $record = [pscustomobject]@{
        id = "stock-$($store.id)-$($article.id)"
        store_id = $store.id
        article_id = $article.id
        quantity = $quantity
        reserved_quantity = 0
        updated_at = 0
        legacy_source = [pscustomobject]@{
          workbook = [System.IO.Path]::GetFileName($workbookPath)
          sheet = $sheetName
          row = $rowNumber
          product_name = $label
          quantity_column = 'B'
        }
      }
      $candidates.Add($record)
      $sheetCandidates.Add($record)
    }

    if (-not $store -and $sheetQuantityRows -gt 0) {
      $unmatchedSheets.Add([pscustomobject]@{
        sheet = $sheetName
        quantity_rows = $sheetQuantityRows
        reason = 'Aucun magasin correspondant; les quantités ne sont pas importées.'
      })
    } elseif ($store) {
      $matchedSheets.Add([pscustomobject]@{
        sheet = $sheetName
        store_id = $store.id
        store_code = $store.code
        store_name = $store.name
        rows = $sheetCandidates.Count
        total_quantity = [double](($sheetCandidates | Measure-Object -Property quantity -Sum).Sum)
        rows_with_issues = $sheetIssues
      })
    }
  }
} finally {
  $archive.Dispose()
  $stream.Dispose()
}

$duplicateKeys = @{}
foreach ($group in @($candidates | Group-Object { "$($_.store_id)|$($_.article_id)" })) {
  if ($group.Count -gt 1) {
    $duplicateKeys[$group.Name] = $true
    foreach ($record in $group.Group) {
      $invalidRows.Add([pscustomobject]@{
        sheet = $record.legacy_source.sheet
        row = $record.legacy_source.row
        label = $record.legacy_source.product_name
        value = $record.quantity
        reason = 'Article présent plusieurs fois pour le même magasin; toutes ses lignes sont exclues.'
      })
    }
  }
}

$data = @($candidates | Where-Object {
  -not $duplicateKeys.ContainsKey("$($_.store_id)|$($_.article_id)")
} | ForEach-Object {
  $_.updated_at = $timestamp
  $_
} | Sort-Object store_id, article_id)
$unmatchedArticleReport = @($unmatchedArticles.Values | Sort-Object label | ForEach-Object {
  [pscustomobject]@{
    label = $_.label
    occurrences = @($_.occurrences)
  }
})
$hasUnresolvedIssues = $unmatchedSheets.Count -gt 0 -or
  $unmatchedArticleReport.Count -gt 0 -or
  $invalidRows.Count -gt 0
$allArticleIds = @($articles | ForEach-Object { [string]$_.id })
$allArticleCodes = @($articles | ForEach-Object { [string]$_.code })
if (($allArticleIds | Select-Object -Unique).Count -ne $allArticleIds.Count -or
    ($allArticleCodes | Select-Object -Unique).Count -ne $allArticleCodes.Count) {
  throw 'Le catalogue final contient des IDs ou codes article en double.'
}

$storeDocument.data = $stores
$catalogueDocument.data = [pscustomobject]@{
  articles = $articles
  categories = $categories
}
$stockDocument = [pscustomobject]@{
  version = 1
  exportedAt = [DateTimeOffset]::UtcNow.ToString('o')
  source_file = [System.IO.Path]::GetFileName($workbookPath)
  data = $data
  review = [pscustomobject]@{
    ready_to_apply = -not $hasUnresolvedIssues
    quantity_column = 'B'
    excluded_duplicate_stores = @($excludedStores)
    provisional_articles = $provisionalArticles
    matched_sheets = $matchedSheets
    unmatched_sheets = $unmatchedSheets
    unmatched_articles = $unmatchedArticleReport
    invalid_rows = $invalidRows
    empty_quantity_row_count = [int](($emptyQuantityCounts.Values | Measure-Object -Sum).Sum)
    empty_quantity_rows_by_sheet = $emptyQuantityCounts
    skipped_non_stock_labels = $skippedLabels
    record_count = $data.Count
    positive_quantity_count = @($data | Where-Object quantity -gt 0).Count
    note = if ($hasUnresolvedIssues) {
      'Rapprochement incomplet : corriger les magasins, articles ou quantités listés avant de passer ready_to_apply à true.'
    } elseif ($provisionalArticles.Count -gt 0) {
      'Import des quantités approuvé avec articles provisoires; compléter et vérifier leurs prix réels avant toute vente. Vérifier les totaux et les stocks déjà présents avant import.'
    } else {
      'Toutes les lignes de stock ont été rapprochées; vérifier les totaux par magasin avant import.'
    }
  }
}

$outputStores = Join-Path $PSScriptRoot 'magasins-importables-2026-10-12.json'
$outputCatalogue = Join-Path $PSScriptRoot 'catalogue-importable-2026-10-12.json'
$outputStocks = Join-Path $PSScriptRoot 'stocks-initiaux-2026-10-12.json'
$outputReview = Join-Path $PSScriptRoot 'rapprochement-stocks-initiaux-2026-10-12.json'

Write-Json $outputStores $storeDocument
Write-Json $outputCatalogue $catalogueDocument
Write-Json $outputStocks $stockDocument
Write-Json $outputReview ([pscustomobject]@{
  source_file = [System.IO.Path]::GetFileName($workbookPath)
  quantity_column = 'B'
  excluded_duplicate_stores = @($excludedStores)
  matched_sheets = $matchedSheets
  unmatched_sheets = $unmatchedSheets
  unmatched_articles = $unmatchedArticleReport
  provisional_articles = $provisionalArticles
  invalid_rows = $invalidRows
  empty_quantity_row_count = [int](($emptyQuantityCounts.Values | Measure-Object -Sum).Sum)
  empty_quantity_rows_by_sheet = $emptyQuantityCounts
  skipped_non_stock_labels = $skippedLabels
  record_count = $data.Count
  positive_quantity_count = @($data | Where-Object quantity -gt 0).Count
  ready_to_apply = -not $hasUnresolvedIssues
})

[pscustomobject]@{
  stores = $stores.Count
  duplicate_stores_removed = $excludedStores.Count
  articles = $articles.Count
  provisional_articles = $provisionalArticles.Count
  categories = $categories.Count
  matched_sheets = $matchedSheets.Count
  unmatched_sheets = $unmatchedSheets.Count
  unmatched_articles = $unmatchedArticleReport.Count
  invalid_rows = $invalidRows.Count
  stock_rows = $data.Count
  positive_stock_rows = @($data | Where-Object quantity -gt 0).Count
  ready_to_apply = -not $hasUnresolvedIssues
  outputs = @($outputStores, $outputCatalogue, $outputStocks, $outputReview)
} | ConvertTo-Json -Depth 10
