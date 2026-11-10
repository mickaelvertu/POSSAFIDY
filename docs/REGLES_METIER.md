# Règles métier de l'application

## 1. Objet

Ce document décrit les règles métier de l'application de gestion commerciale et de stock. Il sert de référence pour les usages fonctionnels, les contrôles de cohérence et les validations de flux.

## 2. Périmètre fonctionnel

L'application gère :

- les utilisateurs et leurs permissions,
- les rôles et accès par magasin,
- le catalogue des articles et fournisseurs,
- les stocks par article et par magasin,
- les ventes, les transferts et les productions,
- les achats fournisseurs et leurs réceptions,
- les dépenses, avances sur salaire et trésorerie,
- les inventaires, import initial de stock et audit,
- les rapports et contrôles de performance.

## 3. Rôles et droits

### 3.1 Rôles supportés

Les rôles principaux sont :

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

### 3.2 Règles de base

- Un utilisateur n'a accès qu'aux données autorisées par son rôle et sa portée de magasins.
- La portée est calculée à partir des droits attribués et des magasins actifs.
- Les changements de droits ou de magasins mettent à jour immédiatement la portée effective de la session active.
- Un compte désactivé garde son historique mais ne conserve plus les permissions actives.
- Un profil Firestore absent ne doit pas être recréé automatiquement comme compte actif.
- Les rôles ADMIN et SUPER_ADMIN ne sont pas traités comme équivalents dans les règles Firestore.

### 3.3 Visibilité des articles

La visibilité des articles est filtrée par type :

- matières premières,
- produits de revente,
- les deux types,
- aucun type.

Les droits de visibilité conditionnent :

- les catalogues consultés,
- les données de stock,
- les ventes,
- les productions,
- les transferts,
- les achats,
- les rapports,
- le journal d'audit.

## 4. Gestion des utilisateurs

- Chaque utilisateur a un profil métier avec nom, prénom, email, téléphone, magasin(s) et statut.
- Un utilisateur peut être en statut `PENDING`, `ACTIVE` ou `DISABLED`.
- La suppression n'est pas une suppression pure : c'est une désactivation.
- L'historique de l'utilisateur est conservé.
- Une réinitialisation du mot de passe par email est disponible depuis la page de connexion.
- Les comptes de test ne doivent pas être affichés sur la page de connexion.

## 5. Catalogue et articles

### 5.1 Articles

Un article comporte :

- un identifiant technique,
- un code métier unique,
- un nom,
- une catégorie,
- un type (`RESALE` ou `RAW_MATERIAL`),
- une unité de mesure,
- des prix d'achat et de vente,
- une quantité minimale d'alerte,
- un statut actif/inactif.

### 5.2 Règles métier

- Un code article doit être unique.
- Un article doit appartenir à une catégorie valide.
- Un article doit avoir une unité de mesure connue.
- Le prix d'achat et prix de vente doivent rester cohérents avec la logique commerciale de l'entreprise.
- Un article inactif n'est plus utilisé dans les opérations courantes.
- Les articles ne visibles pour l'utilisateur ne doivent pas apparaître dans les écrans ou rapports restreints.

### 5.3 Catégories et unités

- Une catégorie a un code unique et un libellé.
- Une unité est un libellé de mesure actif ou non.
- Les catégories et unités peuvent être modifiées administrativement.
- Toute modification de catalogue est tracée dans le journal d'audit.

## 6. Gestion des magasins

- Un magasin possède un identifiant, un code, un nom, un type et un statut actif.
- Les types de magasin incluent : `CENTRAL_WAREHOUSE`, `POS`, `RESELLER`, `MANUFACTURER`.
- La portée d'un utilisateur est calculée selon ses magasins autorisés.
- La réinitialisation globale des magasins est désactivée.

## 7. Stock

### 7.1 Principe général

Les stocks sont gérés par article, par magasin et par période. Les mouvements de stock doivent être cohérents et traçables.

### 7.2 Mouvements autorisés

Le stock peut évoluer à partir des opérations suivantes :

- vente,
- production,
- transfert,
- réception fournisseur,
- inventaire,
- import initial,
- ajustement manuel,
- correction ou écart de stock.

### 7.3 Règles de cohérence

- Une vente validée ne doit pas réduire le stock au-delà du stock disponible.
- Une production ne doit consommer ou produire que dans les quantités prévues par le processus métier.
- Une réception fournisseur ne crédite le stock que pour les quantités acceptées.
- Le stock est mis à jour dans la même transaction que les écritures d'audit associées.
- Les transactions Firestore doivent garantir l'atomicité lors des écritures de stock.

### 7.4 Contrôles

- Le système refuse une opération si la quantité disponible n'est pas suffisante.
- Les écarts de stock doivent être signalés et documentés.
- Les changements de stock sont enregistrés dans le journal d'audit.

## 8. Ventes

### 8.1 Cycle de vente

Une vente suit généralement ce chemin :

1. création d'un brouillon ou d'une vente,
2. ajout d'articles,
3. calcul du total,
4. validation ou refus,
5. mise à jour du stock,
6. enregistrement de l'audit.

### 8.2 Règles de validation

- Une vente ne peut être validée que si le stock le permet.
- Une vente doit respecter les droits du rôle de l'utilisateur.
- Une vente est refusée si elle dépasse les limites de validation ou de quantité autorisées.
- En POS / revendeur, une vente est limitée à un nombre défini d'articles distincts dans le cadre des validations multi-articles.
- Au-delà de cette limite, l'application remplace le refus générique par un message explicite.
- Les ventes finalisées sont bloquées hors connexion.

### 8.3 Journal d'audit

- Toute vente validée doit générer une trace d'audit.
- Les informations des mouvements de stock sont associées à la vente concernée.

## 9. Production

### 9.1 Principe

La production relie la consommation des matières premières à la création d'articles finis ou intermédiaires.

### 9.2 Règles métier

- La production ne peut être exécutée que par un rôle autorisé.
- Les matières premières consommées doivent être disponibles dans le magasin concerné.
- La production doit écrire des mouvements de stock cohérents.
- Les résultats de production sont enregistrés dans le journal d'audit.
- Les écarts entre quantités prévues et quantité réelle doivent être détectés.

## 10. Transferts

### 10.1 Cycle de transfert

Un transfert suit le schéma suivant :

1. création du transfert,
2. approbation,
3. expédition,
4. réception dans le magasin destinataire,
5. contrôle des écarts et validation finale.

### 10.2 Règles métier

- Un transfert doit être approuvé par un utilisateur autorisé.
- Le magasin source doit disposer des quantités transférées.
- Le magasin destinataire reçoit les produits après validation de la réception.
- Les écarts entre la quantité expédiée et la quantité reçue doivent être signalés.
- Les transferts exécutés et les mouvements associés sont enregistrés dans l'audit.
- Les brouillons de transfert peuvent être sauvegardés localement en mode hors ligne, mais leur synchronisation dépend des droits et des règles Firestore.

## 11. Achats fournisseurs

### 11.1 Cycle d'achat

Le cycle d'achat suit généralement :

- brouillon d'achat,
- approbation par un autre administrateur,
- livraison visible dans les transferts / réceptions,
- réception par l'utilisateur autorisé,
- crédit du stock sur les quantités acceptées,
- enregistrement d'audit.

### 11.2 Règles métier

- Un achat en brouillon ne peut pas être directement livré comme validé.
- L'approbation doit être faite par un autre administrateur.
- La réception ne crédite le stock que sur les quantités acceptées.
- La même transaction inclut la réception et l'écriture correspondante dans le journal d'audit.
- Les paiements fournisseurs sont associés à la trésorerie et au suivi financier.

## 12. Dépenses, avances et trésorerie

### 12.1 Dépenses

- Les dépenses sont classées par catégorie.
- Une dépense peut être en statut `DRAFT`, `VALIDATED` ou `CANCELLED`.
- Les dépenses peuvent être associées à un magasin ou à un fond de trésorerie.
- Les dépenses payées sont suivies avec référence de paiement et utilisateur concerné.

### 12.2 Avances sur salaire

- Les avances sur salaire sont enregistrées comme dépenses payées en brouillon.
- Une validation crée atomiquement une avance déductible en paie et une trace d'audit.
- Cette opération est réservée aux administrateurs.

### 12.3 Trésorerie

- La trésorerie suit les fonds de caisse, banque et autres sources.
- Les mouvements financiers sont associés aux utilisateurs et références concernées.
- Le solde est calculé sur la base des mouvements enregistrés.
- Les paiements fournisseurs et autres sorties sont répercutés dans les balances.

## 13. Inventaire et import initial

### 13.1 Import initial de stock

- L'import initial de stock est réservé aux administrateurs.
- Le fichier doit être marqué `review.ready_to_apply: true` avant application.
- Le système affiche un aperçu des lignes avant validation.
- Les lignes invalides sont refusées.
- Les mouvements de stock et l'audit sont générés ligne par ligne.
- Les lots sont limités pour respecter les contraintes techniques Firestore.
- Un import interrompu peut être repris avec le même fichier.

### 13.2 Inventaires physiques

- Un inventaire permet d'aligner le stock réel avec le stock théorique.
- Les écarts sont signalés et doivent être traités ou validés.
- Les contrôles de stock sont liés à la gestion des mouvements et de l'audit.

## 14. Audit et traçabilité

- Toutes les mutations métier importantes doivent laisser une trace dans le journal d'audit.
- Les écritures métier et les événements d'audit sont regroupés lorsqu'une mutation est effectuée directement depuis l'application.
- Chaque utilisateur ne consulte que ses propres événements d'audit, sauf les administrateurs qui peuvent voir l'ensemble.
- Les références métier contiennent la date, l'heure et un suffixe aléatoire pour limiter les doublons entre appareils.

## 15. Rapports et analyses

Les rapports sont générés à partir des données métier et des mouvements enregistrés :

- ventes,
- stock,
- transferts,
- achats,
- productions,
- mouvements financiers,
- dépenses,
- audit,
- inventaires.

Les rapports de mouvements ou d'audit peuvent dépendre de l'historique complet et peuvent donc être chargés par pages. Les autres rapports ne dépendent pas de cet historique complet.

## 16. Hors ligne et PWA

- L'application peut être installée comme PWA.
- Le shell statique est mis en cache pour démarrer sans réseau après une première visite.
- Les données Firestore peuvent être mises en cache localement.
- Les brouillons peuvent être sauvegardés localement.
- Les écritures transactionnelles sont bloquées hors connexion.
- Les opérations non encore validées sont signalées par un indicateur d'état.

## 17. Sécurité et intégrité des données

- Les règles Firestore filtrent les accès selon le rôle et le magasin.
- Les droits affichés hors ligne ne sont pas revalidés avant le retour du réseau.
- Les changements de nom ne rechargent pas les données.
- Les changements de droits ou de magasins détachent les anciens abonnements et réinitialisent leur portée.
- Les erreurs de lecture restent isolées à leur source et affichent une commande pour réessayer.
- Les refus d'accès ne sont pas affichés comme des pannes réseau.

## 18. Règles d'intégrité métier

- Un compte ne peut pas avoir accès à des données hors de sa portée.
- Une opération commerciale ne peut pas créer un stock négatif sans validation métier explicite.
- Les sorties de stock doivent correspondre à des événements validés et traçables.
- Les écritures de trésorerie, d'audit et de stock doivent être cohérentes entre elles.
- Les mouvements ne doivent pas être dupliqués entre appareils.

## 19. Règles de synthèse

En résumé, l'application impose que :

1. chaque action soit conforme au rôle et à la portée de l'utilisateur ;
2. chaque mouvement de stock soit traçable et cohérent ;
3. chaque validation commerciale ou financière soit documentée ;
4. chaque écriture puisse être auditable ;
5. chaque donnée soit filtrée selon les règles de sécurité et de magasin ;
6. les opérations critiques restent atomiques et ne peuvent être validées hors connexion.

## 20. Points de vigilance

Avant mise en production, les éléments suivants doivent être vérifiés :

- validation des imports de catalogue,
- import du stock initial réel,
- test des règles sur l'émulateur Firestore,
- validation des sept rôles et parcours critiques,
- vérification des emails Firebase et domaines autorisés,
- plan de sauvegarde / restauration,
- pilotage dans un magasin avant déploiement général.
