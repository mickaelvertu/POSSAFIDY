Latest file to use: antsahabe-stock-correction-latest-transfer-import-2026-10-15.json. This replaces the earlier import file for application purposes; do not apply both.

Refreshed using stock-tous-magasins-2026-10-15 (1).json, exported at 14:31:48 Africa/Nairobi on 2026-10-15. It preserves all latest balances, including +58 units across 11 articles since the earlier reports. Antsahabe currently totals 498 units; the correction adds a net 11 units, giving 509 units. Only 59 Antsahabe articles are included. Other stores remain outside the import. This assumes the earlier correction has not been applied already.

Stock correction originally prepared from the revised STOCK ANTSAHABE.xlsx and the two stock reports exported on 2026-10-15. The figures below describe the earlier report snapshot.

- Initial quantities: 485 units across 115 articles; blanks mean zero.
- Original import: SYNC-109F1A1D, 474 units.
- Subsequent movements: net -34 units. All 89 movement rows agree with the ledger.
- Current exported balance: 440 units. Corrected current balance: 451 units.
- The import changes 59 articles; 56 remain unchanged. No negative results.
- Live ledger code BR150 identifies Baume RAVINTSARA; the older catalogue spells BR150 as Baume RAVITSARA. The import uses article codes to follow the live export.

Apply using a SUPER_ADMIN account in Stocks, select Antsahabe (POS-02), then use “Exporter / importer le stock par magasin” > “Importer CSV / JSON” with antsahabe-stock-correction-latest-transfer-import-2026-10-15.json. Use the regular stock import, which records adjustment movements. Do not use the initial inventory import.

Before applying, compare the preview's current quantities with expected_current_quantity in the file. If anything has changed since the reports were exported, regenerate the correction using fresh reports first. The existing importer does not enforce expected_current_quantity; it replaces stock with the prepared current quantities.

No live database changes were made during preparation. The audit JSON contains all per-article calculations. Original sale and transfer records are preserved. A future correction must include these new inventory adjustments; do not reuse the old exported baseline as though this correction had not occurred.
