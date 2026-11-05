# Encaissements revendeurs et remises DEP

Chaque utilisateur enregistre uniquement les paiements qu'il a personnellement reçus. L'identifiant de l'encaisseur est celui du compte connecté, vérifié par les règles Firestore. Le nom de l'encaisseur est affiché dans le formulaire ; aucune case de confirmation supplémentaire n'est demandée.

Le règlement garde son montant, son mode, sa date réelle, son encaisseur et l'auteur de la saisie dans un registre `resellerReceipts`. Le registre et la facture sont écrits dans la même transaction. Pour une facture à crédit, la dette du revendeur diminue dans cette même transaction. Un responsable peut encaisser pour son DEP attribué sans pouvoir modifier les plafonds des comptes.

- Espèces reçues par un administrateur : création immédiate d'un fonds de trésorerie à son nom, lié au règlement. Aucun passage supplémentaire par une remise DEP.
- Espèces reçues par un responsable : fonds à remettre par cet encaisseur. La remise DEP utilise les règlements du magasin, de l'encaisseur et du jour de paiement sélectionnés.
- Paiement hors espèces : conservé dans le registre et dans la facture, exclu de la remise d'espèces et des fonds d'espèces.
- Montant reçu au moment de la création d'une vente DEP : identifié également, même si la vente est encore en brouillon. Une validation ultérieure n'est pas un nouvel encaissement.

Les remises prennent jusqu'à cinq règlements par transaction pour respecter les limites des règles Firestore. Le montant de chaque lot est affiché avant déclaration. Les règlements restants peuvent faire l'objet d'une remise supplémentaire le même jour. Les règles vérifient les montants, l'identité du détenteur, le magasin, la date et le rattachement exclusif des règlements. Une déclaration concurrente ne peut pas reprendre un règlement déjà remis. Une autre personne confirme ensuite l'argent effectivement reçu.

Les dépenses d'un DEP restent dans leurs modules et ne réduisent pas automatiquement les règlements identifiés d'un encaisseur. Les dépenses financées par la trésorerie sont déduites des fonds utilisés lors de leur paiement. Les espèces confiées au responsable doivent être remises pour leur montant intégral ; ce registre ne constitue pas un mécanisme de dépenses locales sur les règlements à remettre.

Les anciennes ventes et anciens paiements ne sont pas migrés automatiquement : l'auteur d'une saisie n'est pas une preuve de réception de l'argent. Les montants sans encaisseur identifié sont signalés comme à rapprocher et exclus des nouvelles remises DEP. Les anciennes remises restent consultables. Leur reprise éventuelle dans la trésorerie suit le contrôle existant du réceptionnaire.

L'annulation ou la suppression d'une vente ne signifie pas que l'argent a été remboursé : le registre d'encaissement est conservé. Les nouveaux registres sont immuables, hormis leur rattachement à une remise. Aucun remboursement automatique n'est ajouté par cette évolution.

Validation : `npm run test:reseller-receipts` (Java 21 ou plus récent dans le PATH), puis `npm run lint` et `npm run build`. Le test d'intégration utilise uniquement l'émulateur local et le projet fictif `demo-sale-rules`.
