Correction for Mr Ony Commercial (POS-16)

The user confirmed that 2 units in transfer TRF-20261014-155445-6009 were entered as NONI instead of ALOE NONI. The corrected transfer composition should include ALOE NONI (2) and NONI (1), with the transfer total remaining 74 units.

The supplied movement ledger records NONI +3 in this transfer, with a closing balance of 3 within that report. The separate current stock export shows NONI 5 and ALOE NONI 2. The correction uses the current stock export, preserving the difference from the earlier ledger period:

| Article | Code | Exported current stock | Adjustment | Corrected stock |
| --- | --- | ---: | ---: | ---: |
| NONI | NO052 | 5 | -2 | 3 |
| ALOE NONI | AN001 | 2 | +2 | 4 |

Use pos-16-noni-correction-import-2026-10-16.json in the regular stock CSV/JSON import, selecting POS-16 as SUPER_ADMIN. Check that the preview still shows current quantities 5 and 2, then corrected quantities 3 and 4. If current balances differ, regenerate before applying. The existing importer does not enforce expected_current_quantity. Apply only once.

This file records stock adjustments only; it does not rewrite the validated transfer or sales. No live database records have been changed during preparation.

The source warehouse Mahamasina (DEP-01) may also need a corresponding correction: NONI +2 and ALOE NONI -2, if the original transfer deducted the wrong product there. Its current stock export and relevant movements are needed to calculate those absolute quantities safely. Do not apply destination quantities to the warehouse.
