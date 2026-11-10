# Fonctionnement de l'application

## 1. Objet général

Cette application est un système de gestion commerciale et de stock pour un réseau de magasins / points de vente / entrepôts. Elle centralise :

- la gestion des utilisateurs et des rôles,
- le catalogue des articles,
- les stocks par magasin,
- les ventes et validations,
- la production et les transferts,
- les achats fournisseurs,
- les dépenses et avances sur salaire,
- les rapports, audit et trésorerie.

Le cœur fonctionne avec React + Vite côté front, et Firestore / Firebase côté données et synchronisation.

## 2. Architecture technique

### Frontend
- Interface web React.
- Mise en page et UX avec Vite + composants React / Tailwind.
- L'application est installable comme PWA et peut démarrer hors ligne après une première visite internet.

### Backend / données
- Base de données principale : Firestore.
- Authentification et profils utilisateur gérés via Firebase.
- Les écritures métier et les événements d'audit sont stockés séparément pour permettre le suivi des changements.

### Sécurité et droits
- Les utilisateurs ne voient que les données de la portée autorisée.
- Les rôles et permissions déterminent ce qu'un compte peut consulter, valider, approuver ou modifier.
- Les règles Firestore filtrent les accès selon le magasin, le rôle et les permissions.

## 3. Démarrage et accès

Au lancement, l'application vérifie si l'utilisateur est authentifié.

- Si aucun compte n'est connecté, l'écran d'authentification s'affiche.
- Si le profil est chargé et valide, l'utilisateur accède à la session authentifiée.
- Pendant le chargement, un écran de transition est affiché.

Les comptes peuvent avoir plusieurs rôles ou profils d'accès, selon la configuration du magasin et des autorisations attribuées.

## 4. Gestion des utilisateurs et des rôles

Le système distingue plusieurs profils comme :

- SUPER_ADMIN
- ADMIN
- VENDEUR
- MAGASINIER
- RESPONSABLE_MAGASIN
- CONTROLEUR
- PRODUCTION
- COMPTABLE
- GESTIONNAIRE_CREDIT
- STAFF
- REVENDEUR

Chaque utilisateur possède :

- un identifiant utilisateur,
- un profil métier (nom, prénom, email, téléphone, magasin(s)),
- un rôle principal,
- une liste de permissions associées,
- une portée de visibilité sur les types d'articles et/ou magasins.

Les changements de droit ou de magasin déclenchent une mise à jour de la portée active de l'utilisateur. L'historique et les événements d'audit restent conservés même en cas de désactivation du compte.

## 5. Catalogue et articles

Le catalogue contient les éléments suivants :

- articles de vente,
- matières premières,
- catégories,
- unités de mesure,
- fournisseurs,
- prix d'achat / prix normal / prix revendeur / prix spécial.

Les articles sont classés par type :

- RESALE
- RAW_MATERIAL

Les règles métier imposent notamment :

- un code unique par article,
- une catégorie et une unité définies,
- une alertes de stock minimum possible,
- un filtrage selon les droits de visibilité de l'utilisateur.

## 6. Gestion des stocks

Les mouvements de stock sont centralisés et se basent sur des transactions Firestore pour garantir la cohérence.

### Flux de stock couverts
- vente,
- production,
- transfert entre magasins,
- réception fournisseur,
- inventaire physique,
- import initial de stock,
- ajustement manuel.

### Règles de fonctionnement
- Une vente validée met à jour le stock selon les quantités vendues.
- Une production consomme ou produit des stocks selon le plan de fabrication.
- Un transfert est approuvé puis reçu par le magasin destinataire.
- Une réception fournisseur crédite le stock uniquement sur les quantités acceptées.
- Les stocks sont calculés par magasin et par article.
- Les écarts de stock peuvent être détectés par les contrôles d'inventaire.

## 7. Ventes

Le processus de vente suit plusieurs étapes :

1. création d'un dossier / brouillon,
2. ajout d'articles,
3. calcul du montant,
4. validation selon les droits,
5. mise à jour du stock,
6. écriture dans le journal d'audit.

Le système garde aussi la trace de la validité et des contraintes commerciales :

- limite de quantité ou de lignes autorisées,
- validation du stock disponible,
- contrôle selon le rôle et le magasin,
- gestion des ventes à crédit ou sécurisées selon les permissions.

## 8. Production

La production est traitée comme une opération métier ayant un impact sur les stocks.

- elle consomme des matières premières,
- elle produit des articles finis,
- elle déclenche des mouvements de stock,
- elle enregistre des traces d'audit.

Les règles de production sont contrôlées pour éviter les écarts de stock ou les opérations non autorisées.

## 9. Transferts et achats

### Transferts
Le système permet :

- la création d'un transfert,
- l'approbation par un responsable,
- l'expédition,
- la réception dans le magasin cible,
- le traitement des écarts s'il y a lieu.

### Achats fournisseurs
Le flux est généralement le suivant :

1. création du brouillon d'achat,
2. validation par un administrateur,
3. livraison visible dans les transferts / réceptions,
4. réception de la marchandise,
5. mise à jour du stock et du journal d'audit.

Les achats peuvent aussi être associés à la trésorerie, aux paiements et aux mouvements comptables.

## 10. Dépenses, avances et trésorerie

Le système gère les postes suivants :

- dépenses de magasin,
- dépenses administratives,
- avances sur salaire,
- soldes de caisse,
- mouvements de trésorerie,
- fonds de caisse / banque / autres.

Les avancements sur salaire sont enregistrés comme dépenses à valider puis converties en avances déductibles. Cette opération est atomique : elle modifie la paie et crée une trace d'audit.

La gestion de la trésorerie permet d'associer les mouvements aux comptes et aux utilisateurs concernés, avec suivi de balances et références.

## 11. Rapports, audit et contrôle

L'application inclut une logique de reporting pour :

- les ventes,
- les stocks,
- les mouvements,
- les achats,
- les dépenses,
- les transferts,
- la production,
- les audits.

Le journal d'audit est également utilisé pour :

- tracer les modifications métier,
- afficher les mouvements par utilisateur,
- contrôler les opérations importantes,
- sécuriser la traçabilité des actions.

Les administrateurs peuvent généralement consulter l'ensemble du journal ; les autres utilisateurs ne voient que leurs propres événements.

## 12. Import initial de stock et inventaires

Le système prévoit un import de stock initial réservé aux administrateurs.

### Étapes
- préparation d'un fichier de données,
- vérification de l'état du fichier (review.ready_to_apply),
- aperçu des lignes avant application,
- refus des lignes invalides,
- création des mouvements et journal d'audit,
- suivi des lots / interruptions / reprise.

Les inventaires physiques sont également pris en charge pour comparer le stock réel et le stock théorique.

## 13. Fonctionnement offline et PWA

L'application est conçue pour fonctionner en mode PWA et offrir un comportement robuste hors ligne :

- le shell statique est mis en cache,
- les données Firestore peuvent rester en cache localement,
- des brouillons peuvent être sauvegardés localement,
- la synchronisation se fait au retour de la connexion,
- les opérations transactionnelles (ventes finalisées, stock, transferts, production, etc.) sont bloquées hors ligne pour éviter des données incohérentes.

Un indicateur d'état permet de savoir si certaines écritures ne sont pas encore confirmées.

## 14. Flux de données principal

Dans l'ensemble, le système suit ce cycle :

1. authentification et chargement du profil utilisateur,
2. filtrage selon les droits et les magasins,
3. consultation ou modification du catalogue / stock,
4. validation des opérations métier,
5. mise à jour des mouvements et du journal d'audit,
6. génération des rapports et points de contrôle.

## 15. En résumé

L'application est un outil de gestion de vente et de stock orienté commerce/retail, pensé pour un environnement multi-magasin avec plusieurs profils d'utilisateurs et une forte exigence de traçabilité. Elle combine :

- un front React,
- un moteur de règles métier,
- des transactions Firestore,
- une gestion fine des permissions,
- une logique d'audit et de reporting,
- un fonctionnement PWA avec synchronisation différée.

C'est donc une application de gestion opérationnelle, contrôlée et sécurisée, destinée à piloter les activités de vente, stock, production, transfert et trésorerie dans un environnement multi-site.
