# Règlements partiels des dépenses

Un administrateur peut régler une dépense en plusieurs versements, depuis des fonds différents ou à plusieurs reprises depuis le même fonds. Le montant proposé se limite au solde disponible du fonds choisi et au reste à payer. Les versements sont des montants entiers en ariary.

- Le statut reste `PARTIAL` jusqu’au règlement intégral. Le détail conserve chaque montant, fonds d’origine, payeur et date.
- Les rapports et l’indicateur « Reste à payer » utilisent le solde dû, et non le montant initial d’une dépense partiellement réglée.
- Le débit du fonds, l’ajout à l’historique, le statut et la trace d’audit sont enregistrés dans la même transaction. Les règlements à partir d’un écran périmé sont refusés.
- Les anciens règlements intégraux restent compatibles. Les avances sur salaire conservent leur règlement intégral, lié à la création de l’avance en paie.
- Les versements en espèces pris en charge par le magasin sont déduits de sa caisse à leur date de règlement. Les fonds personnels ne sont pas déduits de la caisse magasin.

L’annulation conserve l’historique et rembourse chaque versement de trésorerie à son fonds d’origine. Chaque remboursement est une transaction avec un identifiant déterministe. Si la connexion est interrompue, le bouton **Terminer les remboursements** reprend les remboursements manquants sans doubler ceux déjà effectués. La suppression reste bloquée jusqu’à la fin des remboursements. Les versements pris en charge directement par un magasin sortent des totaux de caisse après annulation, comme dans le circuit existant.

Champs additionnels sur `expenses` : `payments`, `amount_paid`, `treasury_paid_amount`, `refunded_amount` et `refunded_payment_ids`. Aucun changement de données historiques n’est nécessaire. L’interface doit être publiée avec les nouvelles règles Firestore.

Vérifications : `npm.cmd run lint`, `npm.cmd run build`, tests unitaires `expensePayments.test.ts`, `cashClosingCalculation.test.ts`, `financialReports.test.ts`, et `npm.cmd run test:expense-partial-payments` contre Firestore Emulator (Java 21 requis).
