# Préparation du lancement GILEADA

## État technique

- Les ventes et productions sont persistées dans Firestore.
- La validation d'une vente, la production, les transferts et les réceptions fournisseurs mettent à jour les stocks avec des transactions Firestore.
- Les ventes et productions alimentent le journal d'audit.
- Les achats fournisseur suivent le flux brouillon → approbation par un autre administrateur → livraison visible dans Transferts → réception par un utilisateur autorisé du magasin destinataire. Le stock n'est crédité qu'aux quantités acceptées, dans la même transaction que la réception et son audit.
- Les avances sur salaire sont enregistrées comme dépenses payées en brouillon par un administrateur ; leur validation crée atomiquement une avance déductible en paie et une trace d'audit. Les fiches du personnel affichent leurs dépenses et avances liées.
- La fiche « Droits & Magasins » permet d'autoriser par utilisateur la visibilité des matières premières, des produits de revente, des deux types ou d'aucun. Cette portée filtre les catalogues et les données produit présentées dans les stocks, ventes, production, transferts, achats, rapports et audit ; les changements de droits sont synchronisés dans la session utilisateur active.
- Les modifications du catalogue, des magasins, unités, fournisseurs, achats, dépenses, utilisateurs et transferts sont également tracées ; les écritures métier Firestore et leurs événements d'audit sont groupés lorsque la mutation est faite directement par l'application.
- L'import initial de stock est réservé aux administrateurs, exige un fichier approuvé (`review.ready_to_apply: true`), présente un aperçu, refuse les lignes invalides et produit des mouvements ainsi qu'une trace par ligne. Les lots sont limités pour respecter Firestore et peuvent reprendre un import interrompu avec le même fichier.
- Chaque utilisateur ne peut consulter que ses propres événements d'audit ; les administrateurs voient l'ensemble du journal.
- Les données métier de démonstration ne sont plus injectées automatiquement.
- Les comptes de test ne sont plus affichés sur la page de connexion.
- La suppression d'un utilisateur est une désactivation : son historique est conservé et ses permissions sont retirées.
- Un profil Firestore absent n'est jamais recréé automatiquement comme compte actif.
- Les rôles ADMIN et SUPER_ADMIN sont séparés dans les règles Firestore.
- Les références métier contiennent la date, l'heure et un suffixe aléatoire pour éviter les doublons entre appareils.
- La réinitialisation globale des magasins est désactivée.
- La réinitialisation du mot de passe par email est disponible depuis la connexion.

## Actions obligatoires avant mise en production

1. Corriger le catalogue importé : unités, catégories et prix signalés dans `imports/2026-09-30/points-a-verifier.json`.
2. Obtenir et importer un inventaire physique initial par article et par magasin. La sauvegarde Excel reçue ne contient aucun stock.
3. Créer un projet Firebase de préproduction distinct et y déployer les règles avec `firebase deploy --only firestore:rules`.
4. Exécuter les tests des règles avec l'émulateur Firestore (Java doit être disponible dans `PATH`).
5. Tester au minimum avec les sept rôles : inscription, approbation, connexion, vente complète, stock insuffisant, production, brouillon d'achat, approbation par un autre administrateur, réception d'achat par le responsable attribué, transfert avec écart, dépense, avance sur salaire réservée aux admins, validation et déduction de paie, fiche du personnel, visibilité des articles par type et rapports.
6. Vérifier les modèles d'emails Firebase et les domaines autorisés pour « Mot de passe oublié ».
7. Configurer les sauvegardes Firestore planifiées et effectuer un test réel de restauration.
8. Configurer la collecte d'erreurs et une procédure de support avant le pilote.
9. Faire un pilote dans un magasin, avec rapprochement quotidien du stock physique, avant le déploiement général.

## Déploiement

Le build local se crée avec `npm run build`. Ne pas déployer les règles ou l'hébergement sans avoir validé les imports et les parcours en préproduction. L'archive créée avant le durcissement se trouve dans `D:\Programs\posaistudio\backups` et permet de revenir à l'état précédent.

## Limites encore connues

- Les modifications de comptes gérés via le service d'authentification sont auditées après la mutation du compte : une panne pendant l'écriture de la trace peut nécessiter une vérification administrative manuelle.
- La création administrative directe d'un compte est masquée. Le parcours sûr actuel est : l'utilisateur crée son compte, puis un administrateur approuve le profil et lui affecte un rôle et des magasins. Une création directe nécessiterait un backend Firebase Admin.
- Le bundle JavaScript reste volumineux. Le découpage des écrans en chargement différé est conseillé, mais ne bloque pas le pilote.
- Les sauvegardes Firestore, la supervision et les tests multi-appareils dépendent de l'environnement Firebase et doivent être configurés hors du code.
- Le brouillon `imports/2026-09-30/stocks-a-verifier.json` reste explicitement non approuvé (`review.ready_to_apply: false`) et est refusé par l'import tant que les écarts ne sont pas rapprochés.
