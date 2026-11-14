# Commandes Point de vente

Accès depuis l’accueil : **Commandes Point de vente**.

- Le responsable magasin commande pour un point de vente actif qui lui est assigné et suit ses propres commandes.
- ADMIN et SUPER_ADMIN consultent les commandes, ajustent les articles et quantités, enregistrent leur analyse ou refusent avec un motif.
- La création du transfert exige un dépôt central actif et conserve les lignes initiales de la commande.
- La commande et le transfert CENTRAL_TO_POS au statut DRAFT sont enregistrés dans une transaction unique. Le transfert poursuit le circuit habituel dans le module Transferts. Aucun stock n’est déplacé à la création.
- Une commande déjà traitée ne peut plus être convertie. Les modifications concurrentes sont refusées.

Collection Firestore : posOrders. Les règles firestore.rules doivent être déployées avec cette version. Aucun index composé n’est requis pour les deux filtres d’égalité utilisés par les responsables (fusion des index simples Firestore).

Vérifications : npm.cmd run lint ; npm.cmd run build ; node_modules/.bin/tsx.cmd --test src/services/posOrderValidation.test.ts.

Style de référence : docs/style-vente-caisse.md. La même présentation est appliquée au module Commandes de production.
