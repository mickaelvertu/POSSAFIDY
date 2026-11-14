# Commandes DEP · Matières premières

Depuis l’accueil, **Commandes DEP · Matières premières** reprend le fonctionnement des commandes des points de vente.

- Le responsable magasin commande des articles actifs de type `RAW_MATERIAL` pour un dépôt central actif qui lui est assigné. Il consulte ses propres demandes.
- ADMIN et SUPER_ADMIN consultent toutes les demandes, ajustent les articles et quantités, renseignent les prix unitaires et sélectionnent un fournisseur actif.
- Ils peuvent enregistrer leur analyse, refuser avec un motif ou créer le brouillon d’achat.
- La création de l’achat et le passage de la commande à `PURCHASE_CREATED` sont atomiques. Un identifiant d’achat déterministe empêche les doublons et une vérification de version refuse les analyses périmées.
- Le brouillon apparaît automatiquement dans **Achats et fournisseurs**, sans paiement ni mouvement de stock. La facture et l’échéance sont à compléter avant l’approbation. L’approbation et la réception utilisent le circuit d’achat existant.
- Les lignes initialement demandées restent conservées séparément des lignes retenues. L’achat conserve `raw_material_order_id` et la référence de commande dans ses notes ; sa création est auditée.

Collection Firestore : `rawMaterialOrders`. Déployer `firestore.rules` avec l’interface. Les responsables utilisent une requête par dépôt avec filtres d’égalité sur `created_by` et `store_id`, sans index composé.

Vérifications : `npm.cmd run lint`, `npm.cmd run build`, `npx.cmd tsx --test src/services/rawMaterialOrderValidation.test.ts` et `npm.cmd run test:raw-material-orders` contre l’émulateur Firestore (Java 21 requis).
