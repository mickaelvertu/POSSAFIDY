# Dettes manuelles des revendeurs

Dans **Crédits revendeurs → Dettes manuelles → Ajouter une dette**, sélectionner un compte actif, saisir le montant restant réellement dû, une référence et une date d’échéance. La date inclut toute la journée locale choisie ; les anciennes échéances sont acceptées pour reprendre des impayés.

Le montant s’ajoute à l’encours existant et doit respecter le plafond du compte. Ne pas reprendre une dette déjà portée par une vente ou déjà incluse dans l’encours. Aucune vente, aucun chiffre d’affaires et aucun mouvement de stock ne sont créés. La même référence normalisée pour le même revendeur est refusée lors d’une seconde saisie depuis l’application.

Les dettes sont stockées dans `manualCreditDebts`, séparément des ventes. Elles sont consultables par les administrateurs et les utilisateurs actifs disposant de `credit.manage`. Les filtres revendeur et recherche du module s’appliquent à la liste. Les dettes soldées sont disponibles avec la case correspondante. La fiche présente la date, l’auteur et l’historique des remboursements.

Chaque remboursement diminue ensemble le reste de la dette et l’encours du compte, dans une transaction. Le montant doit être un entier positif inférieur ou égal au solde actuel ; la transaction relit les données pour prévenir les paiements concurrents excessifs. Les administrateurs peuvent encaisser en espèces : le paiement crée alors leur fonds de trésorerie dans la même transaction. Les gestionnaires de crédit disposent des modes hors espèces. Ces remboursements ne sont pas des ventes POS ni des remises de dépôt.

La création de la dette ne crée aucune entrée de trésorerie. Les remboursements hors espèces ne modifient pas les fonds personnels. Les dettes et paiements manuels ne sont pas ajoutés aux rapports basés sur les ventes ni au détail des factures du portail revendeur ; ils contribuent à l’encours du compte. La suppression et la modification d’une dette enregistrée ne sont pas exposées.

Une trace d’audit est obligatoire pour chaque écriture de dette. Les règles Firestore contrôlent les droits, la cohérence de l’encours, les champs immuables, l’historique et le fonds créé pour les espèces. Déployer ces règles avec l’application.

Vérification : `npm test`, `npm run lint`, `npm run build`. Le test `scripts/manual-credit-rules.integration.cjs` nécessite l’émulateur Firestore et Java : `firebase emulators:exec --only firestore --project demo-sale-rules --config firebase.test.json "node --test scripts/manual-credit-rules.integration.cjs"`.
