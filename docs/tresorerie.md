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

## Suivi et contrôle des fonds

Le module propose des filtres par période, administrateur, origine, opération et référence. Le résumé de période suit uniquement la période et l’administrateur ; les filtres de recherche, de fonds, d’origine et d’opération concernent les lignes d’historique. Les soldes sont reconstruits depuis le solde courant et les mouvements enregistrés. Les transferts internes ne créent pas de recettes : leur effet global est nul.

La fiche d’un fonds affiche les montants reçus, utilisés, transférés, déposés et remboursés. Les fonds épuisés restent consultables. Les liens d’un mouvement permettent de consulter sa dépense, son achat ou sa remise et de remonter vers les fonds source et destination.

Les alertes portent sur l’âge du fonds depuis sa réception par son détenteur courant. Le seuil est modifiable et mémorisé dans ce navigateur. Il ne déclenche pas de notification externe.

Le contrôle physique enregistre une déclaration immuable du détenteur : solde attendu des fonds lus lors du contrôle, montant compté et motif obligatoire en cas d’écart. Il ne modifie aucun solde. Les règles contrôlent l’auteur et la cohérence de la déclaration ; elles ne certifient pas la somme déclarée. Éviter toute réception simultanée pendant le comptage : un nouveau fonds créé pendant la lecture peut être absent du périmètre, dont les identifiants sont conservés.

Les justificatifs PDF, JPEG, PNG et WebP sont limités à 350 Ko par fichier et conservés dans une collection Firestore distincte. Les administrateurs actifs peuvent les ajouter aux mouvements existants et les télécharger. Les ajouts sont immuables. Les fichiers sont chargés dans le module : surveiller le volume si le nombre de pièces augmente.

L’export CSV UTF-8, compatible Excel, reprend les mouvements filtrés et protège les cellules textuelles contre les formules. Le bouton Imprimer / PDF ouvre un rapport indépendant avec les filtres et les soldes de période ; choisir Enregistrer en PDF dans le navigateur.

Déployer les nouvelles règles Firestore avec l’application pour activer les collections `treasuryChecks` et `treasuryAttachments`. Aucun déploiement n’est effectué par les vérifications locales.

Vérifications supplémentaires : `node --import tsx --test src/services/treasuryTracking.test.ts` et `firebase emulators:exec --only firestore --project demo-sale-rules --config firebase.test.json "node --test scripts/treasury-tracking-rules.integration.cjs"` (Java requis).

### Paiement fournisseur avec plusieurs fonds

Dans le formulaire de paiement d’un achat, choisir « Payer avec plusieurs fonds » puis indiquer le montant pris sur chaque fonds. Le total doit correspondre au montant versé. Un paiement accepte au maximum trois fonds distincts appartenant au payeur, dont deux remises POS / DEP au maximum. Pour davantage de fonds, enregistrer plusieurs paiements sur le même achat.

Un seul règlement fournisseur est créé avec sa répartition ; chaque origine a son mouvement de trésorerie. Tous les débits, les allocations des remises, le paiement et son audit sont enregistrés dans une même transaction. Les soldes sont relus au moment de confirmer et aucun débit n’est appliqué si un fonds est insuffisant. Les paiements historiques avec un seul fonds restent compatibles.

### Transfert par le super administrateur

Dans Trésorerie > Nouvelle opération > Transférer à un administrateur, le super administrateur peut choisir un fonds positif quel que soit son détenteur. Il peut le transférer à un autre administrateur actif, y compris lui-même, sans validation du détenteur source. La référence est obligatoire.

Le mouvement indique le détenteur source, le destinataire et le super administrateur ayant enregistré le transfert. La source et sa référence sont conservées. Le fonds source, le fonds destinataire et l’allocation de la remise POS éventuelle sont enregistrés dans une même transaction. Les administrateurs ordinaires restent limités à leurs propres fonds ; cette faculté ne permet pas de payer un achat ou une dépense directement avec les fonds d’un autre administrateur.

### Annulation des achats fournisseurs

Le super administrateur peut utiliser « Annuler l’achat » avec un motif obligatoire. L’achat et sa livraison sont conservés avec le statut CANCELLED. Les statuts de l’achat, de la livraison et des paiements sont rapprochés avant toute écriture. Une livraison absente ou incohérente impose un rapprochement manuel.

Pour les réceptions validées ou avec écart, seules les quantités acceptées sont retirées du stock. L’opération est bloquée si cela entame les quantités réservées ou rend le stock négatif, si un stock est absent ou en doublon, ou si les données ont changé. Achat, livraison, stocks, mouvements et audit sont enregistrés dans une seule transaction (200 articles distincts maximum).

Les paiements réalisés restent inchangés, ainsi que les fonds débités : le montant payé est affiché comme montant à récupérer auprès du fournisseur (refund_due_amount), sans prétendre qu’un remboursement a eu lieu. Aucun remboursement effectif n’est enregistré automatiquement. Les paiements supplémentaires sont interdits, le reste dû devient nul dans l’interface et l’achat est exclu des échéances futures.
