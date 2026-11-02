# Préparation du lancement GILEADA

## Synchronisation et mises à jour

- Les droits effectifs d'un `SUPER_ADMIN` actif sont hérités de son rôle, même si la liste des permissions explicites ne contient que la gestion des utilisateurs et si les magasins attribués sont vides. Le profil affiche cet accès effectif.
- Les fonctions de règles lisent le profil une fois par contrôle et regroupent les permissions de stock afin de rester dans le budget d'évaluation lors des validations multi-articles. En POS/revendeur, une vente est limitée à 18 articles distincts pour respecter les 20 lectures de règles d'un commit atomique ; un message explicite remplace le refus générique au-delà de cette limite. Les entrepôts ne nécessitent pas la même lecture de catalogue par article.
- Régression des règles : avec Java et Firebase CLI disponibles, lancer `npm run test:rules`. Le scénario utilise uniquement l'émulateur local `127.0.0.1:8189` et le projet fictif `demo-sale-rules`.

- Les stocks, ventes, transferts, inventaires et achats se synchronisent en temps réel dans la portée autorisée. Une erreur de lecture reste isolée à sa source et affiche une commande pour réessayer ; les refus d'accès ne sont pas relancés comme des pannes réseau.
- Les changements de nom ne rechargent pas les données. Les changements de droits ou de magasins détachent les anciens abonnements et réinitialisent leur portée.
- Les journaux d'audit et mouvements se chargent par pages de 50 documents par portée, avec un délai maximal de lecture et un compteur de progression. Le catalogue des rapports reste accessible ; seuls les rapports de mouvements ou d'audit attendent leur historique complet avant calcul ou export. Les autres rapports ne dépendent pas de ces historiques. Les index nécessaires sont définis dans `firestore.indexes.json`.
- Le bouton et la bannière de mise à jour sont masqués. L'utilisateur recharge avec le bouton du navigateur ; ce rechargement permet l'activation du service worker en attente.
- La grille des mouvements utilise une lecture dédiée, par pages de 500, limitée aux magasins et dates choisis. La période initiale est le mois en cours, modifiable ou effaçable pour tout l'historique. L'affichage est progressif ; les exports et l'impression conservent toutes les lignes de la période.
- Vérification terrain à effectuer avec deux appareils : créer puis approuver une vente ou un transfert, changer les magasins et droits d'un compte, interrompre puis rétablir la connexion, charger une deuxième page d'historique et installer une mise à jour avec un formulaire ouvert.

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

L'application web est installable comme PWA depuis un navigateur compatible et son shell statique est mis en cache pour démarrer hors connexion après une première visite en ligne. Firestore conserve ses données en cache local. Une session déjà ouverte peut afficher le profil et les données mis en cache ; les droits affichés hors connexion ne sont pas revalidés avant le retour du réseau. Les nouvelles connexions nécessitent Internet. Les brouillons de vente sans compte crédit et les nouvelles demandes de transfert en brouillon peuvent être mis en attente localement ; leur synchronisation reste soumise aux règles Firestore et aux droits vérifiés au retour du réseau. La création de brouillons liés à un compte crédit, leur modification, ainsi que les approbations nécessitent une connexion. Les ventes finalisées, mouvements de stock, transferts exécutés, productions et autres opérations transactionnelles sont bloqués hors connexion. L'indicateur signale les écritures non encore confirmées.

## Limites encore connues

- Les modifications de comptes gérés via le service d'authentification sont auditées après la mutation du compte : une panne pendant l'écriture de la trace peut nécessiter une vérification administrative manuelle.
- La création administrative directe d'un compte est masquée. Le parcours sûr actuel est : l'utilisateur crée son compte, puis un administrateur approuve le profil et lui affecte un rôle et des magasins. Une création directe nécessiterait un backend Firebase Admin.
- Le bundle JavaScript reste volumineux. Le découpage des écrans en chargement différé est conseillé, mais ne bloque pas le pilote.
- Les sauvegardes Firestore, la supervision et les tests multi-appareils dépendent de l'environnement Firebase et doivent être configurés hors du code.
- Le brouillon `imports/2026-09-30/stocks-a-verifier.json` reste explicitement non approuvé (`review.ready_to_apply: false`) et est refusé par l'import tant que les écarts ne sont pas rapprochés.
