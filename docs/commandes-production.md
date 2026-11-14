# Commandes de production

Accès depuis l’accueil : **Commandes de production**.

- ADMIN et SUPER_ADMIN choisissent un magasin PRD actif et une date dans la semaine ou le mois à analyser.
- Les semaines vont du lundi au dimanche et les mois sont civils, en heure Africa/Nairobi (UTC+3). La borne de fin est exclusive.
- Le calcul regroupe les quantités des ventes VALIDATED de tous les magasins, sur leur date de création. Seuls les articles RESALE actifs sont retenus ; les prestations et matières premières sont exclues.
- Une période en cours fournit un total provisoire. Les données sont figées à la génération ; une nouvelle commande recalcule les ventes courantes.
- Les administrateurs peuvent modifier, ajouter et retirer des articles, enregistrer l’analyse et ajouter des consignes.
- La publication rend les quantités retenues visibles aux rôles PRODUCTION, MAGASINIER et RESPONSABLE_MAGASIN affectés au magasin destinataire. Les brouillons restent réservés aux administrateurs.
- Les quantités initiales sont conservées. Une commande publiée ne peut plus être modifiée ; aucun stock ni transfert n’est créé.
- Les enregistrements concurrents sont refusés et invitent à rouvrir la commande.

Collection : productionOrders. Déployer firestore.rules avec cette version. Les requêtes PRD utilisent deux filtres d’égalité, compatibles avec la fusion des index simples.

Vérifications : npm.cmd run lint ; npm.cmd run build ; node_modules/.bin/tsx.cmd --test src/services/productionOrderCalculation.test.ts.

Présentation harmonisée avec le guide docs/style-vente-caisse.md : panneaux blancs, accents émeraude, filtres de statut, magasin et recherche, badges et actions d’analyse / consultation.

Dans le détail d’une commande, la colonne Stock global affiche le stock physique actuel par article de tous les magasins pour l’administrateur. Pour les utilisateurs PRD, elle est limitée aux magasins autorisés et porte le libellé correspondant. La quarantaine est exclue, les réservations sont incluses. Les stocks en cache sont signalés ; un stock non chargé ou en erreur affiche un tiret.

Le stock normal utilise uniquement quantity ; quarantine_quantity est affiché séparément et ne doit pas être soustrait de quantity. La colonne Prêt à recycler utilise les transferts RECYCLING réceptionnés (VALIDATED/DISCREPANCY), décidés RECYCLED et recycled_available, moins les consommations RECYCLED des productions COMPLETED. Le résultat est plafonné à la quarantaine restante pour chaque magasin avant consolidation. Les rôles sans accès aux productions ne voient pas un faux zéro.
