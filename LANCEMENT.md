# Préparation du lancement GILEADA

## État technique

- Les ventes et productions sont persistées dans Firestore.
- La validation d'une vente, la production, les transferts et les réceptions fournisseurs mettent à jour les stocks avec des transactions Firestore.
- Les ventes et productions alimentent le journal d'audit.
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
4. Installer Java, puis exécuter les tests des règles avec l'émulateur Firestore. L'émulateur local ne démarre pas actuellement car Java est absent.
5. Tester au minimum avec les sept rôles : inscription, approbation, connexion, vente complète, stock insuffisant, production, achat, transfert avec écart, dépense et rapports.
6. Vérifier les modèles d'emails Firebase et les domaines autorisés pour « Mot de passe oublié ».
7. Configurer les sauvegardes Firestore planifiées et effectuer un test réel de restauration.
8. Configurer la collecte d'erreurs et une procédure de support avant le pilote.
9. Faire un pilote dans un magasin, avec rapprochement quotidien du stock physique, avant le déploiement général.

## Déploiement

Le build local se crée avec `npm run build`. Ne pas déployer les règles ou l'hébergement sans avoir validé les imports et les parcours en préproduction. L'archive créée avant le durcissement se trouve dans `D:\Programs\posaistudio\backups` et permet de revenir à l'état précédent.

## Limites encore connues

- Le journal d'audit couvre actuellement les ventes et productions. Les modifications du catalogue, des utilisateurs, des dépenses et des fournisseurs doivent encore être ajoutées au journal pour une traçabilité exhaustive.
- La création administrative directe d'un compte est masquée. Le parcours sûr actuel est : l'utilisateur crée son compte, puis un administrateur approuve le profil et lui affecte un rôle et des magasins. Une création directe nécessiterait un backend Firebase Admin.
- Le bundle JavaScript reste volumineux. Le découpage des écrans en chargement différé est conseillé, mais ne bloque pas le pilote.
- Les sauvegardes Firestore, la supervision et les tests multi-appareils dépendent de l'environnement Firebase et doivent être configurés hors du code.
