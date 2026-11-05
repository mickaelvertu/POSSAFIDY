# Trésorerie des administrateurs

Le bouton **Trésorerie** est accessible aux administrateurs actifs (ADMIN et SUPER_ADMIN). Chaque réception constitue un fonds distinct, en ariary, dont l'origine reste visible après un transfert.

## Utilisation

1. Réceptionner une nouvelle remise POS : son montant réellement reçu alimente automatiquement les fonds de l'administrateur qui confirme la réception.
2. Pour une ancienne remise encore détenue, utiliser **Reprendre dans la trésorerie** sur la remise de caisse. Seul le solde non déposé est repris, une seule fois, par son réceptionnaire. Vérifier au préalable que cet argent est toujours détenu et n'a pas déjà été dépensé hors application.
3. Pour un retrait bancaire ou une autre entrée, ouvrir **Trésorerie → Recevoir des fonds**, choisir l'origine et indiquer la référence du justificatif. Le solde initial vérifié exclut les remises POS à reprendre et les fonds déjà enregistrés.
4. Pour un transfert, choisir un fonds personnel et un autre administrateur actif. Le transfert est immédiat : il débite l'expéditeur et crédite le destinataire sans seconde validation. L'historique identifie les deux fonds et conserve l'origine de la réception.
5. Dans le règlement d'un achat fournisseur, un administrateur doit sélectionner son fonds. Un paiement partiel est possible ; pour plusieurs origines, enregistrer plusieurs paiements. Le paiement et le débit sont enregistrés ensemble.
6. Déposer un fonds POS d'origine depuis sa remise de caisse. Les fonds reçus par transfert, les retraits bancaires et les autres fonds se déposent depuis **Trésorerie → Déposer à la banque**, avec la banque et le bordereau dans la référence.
7. Pour une dépense marquée **Payée**, choisir sa **Prise en charge** lors de la validation : **Fonds du magasin** (proposé par défaut si un magasin est affecté) ou un fonds personnel. Un paiement pris en charge par le magasin n'utilise pas la trésorerie personnelle du déclarant ; son paiement en espèces entre dans la clôture de la caisse POS. Le magasin doit être actif. Pour **Tous magasins / siège**, choisir un fonds personnel ou affecter d'abord un magasin. Le brouillon peut être modifié ou supprimé sans débit. Pour une dépense validée **À payer**, utiliser **Régler** pour choisir la source au moment du paiement. Le payeur, la source et la date sont enregistrés séparément du créateur et du magasin d'affectation.

Une dépense financée par la trésorerie ne diminue pas une seconde fois la caisse POS du magasin auquel elle est affectée. Les avances sur salaire validées par un administrateur suivent également ce règlement, en créant l'avance et le débit dans la même transaction. Les anciennes dépenses déjà payées ne sont pas débitées rétroactivement.

## Annulation et suppression des dépenses

ADMIN et SUPER_ADMIN peuvent annuler une dépense, avec un motif obligatoire. Pour une dépense réglée par la trésorerie, confirmer que l'argent a été récupéré : l'annulation recrédite le fonds du payeur d'origine une seule fois, rétablit la disponibilité de la remise POS correspondante et conserve le paiement initial ainsi qu'un mouvement de remboursement. Les brouillons et les dépenses sans paiement de trésorerie ne créent aucun crédit.

Une dépense annulée reste visible dans le filtre **Annulées**, avec le motif, l'auteur et la date, et ne contribue plus aux totaux de charges ni aux montants à payer. Elle ne peut plus être modifiée, validée ou réglée. Seul SUPER_ADMIN peut supprimer un brouillon ou une dépense déjà annulée. Une dépense validée doit être annulée avant suppression. Les mouvements de trésorerie et les traces d'audit subsistent après suppression ; une dépense payée supprimée ne peut pas être recréée avec le même identifiant.

Une avance sur salaire encore intacte est retirée du suivi des avances dans la même transaction d'annulation. Si une retenue sur salaire a déjà été enregistrée, l'annulation est bloquée jusqu'à correction de la paie.

Le reste à déposer d'une remise est égal au montant reçu moins les dépôts et les montants utilisés ou transférés. Un transfert quitte la disponibilité de la remise initiale et devient un fonds du destinataire. Les rapports présentent séparément les montants utilisés ou transférés.

## Compatibilité et périmètre

Les anciennes données ne sont pas réécrites automatiquement. Une ancienne remise peut toujours être déposée selon le parcours précédent jusqu'à sa reprise explicite. Les utilisateurs non administrateurs conservent leur parcours existant de réception et de paiement ; ils ne disposent pas de fonds dans ce module. La paie n'est pas reliée à cette trésorerie, à l'exception des avances enregistrées depuis les dépenses.

Les mouvements enregistrés sont immuables. L'annulation d'une dépense crée un mouvement inverse ; elle ne modifie pas le paiement initial. Les autres opérations de trésorerie n'ont pas encore d'action d'annulation dans l'interface. Le module suit les fonds détenus par les administrateurs ; il ne tient pas le solde global des comptes bancaires et ne crée pas de nouvelle vente lors d'une remise ou d'un transfert.

## Mise en service et vérification

Déployer les règles `firestore.rules` et cette version de l'application lors de la même mise en service. Les anciens clients administrateurs ne pourront plus enregistrer de paiement fournisseur ni valider une dépense payée sans fonds. Les clients doivent recharger l'application après le déploiement.

- `npm run lint` : vérification TypeScript.
- `npm run build` : compilation de l'application.
- `npm run test:treasury` : tests des vrais services et des règles sur le projet d'émulation `demo-sale-rules` (Java et Firebase CLI requis).
- `npm run test:rules` : régressions des droits, ventes, stocks et paie.

Les tests de trésorerie couvrent la réception unique, la conservation de l'origine, les achats, les dépenses du siège, les paiements différés, les avances sur salaire, les dépôts, les débits concurrents, les écritures falsifiées, les droits et la reprise des anciennes remises. Ils ne modifient aucune donnée de production.
