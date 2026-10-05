# Reprise des fichiers Excel du 30 septembre 2026

Ces fichiers ont été préparés localement. Aucune donnée n'a été envoyée à Firebase.

## Fichiers utilisables avec les boutons Importer

Avec un compte ADMIN ou SUPER_ADMIN :

1. Magasins : importer `magasins.json` (27 magasins).
2. Unités : importer `unites.json` (6 unités).
3. Achats & fournisseurs : importer `fournisseurs.json` (53 fournisseurs).
4. Catalogue : compléter et vérifier `catalogue-a-verifier.json` avant de l'importer (138 articles, 17 catégories d'origine et une catégorie provisoire « À classer »).

Exporter les données actuelles avant la reprise. Un identifiant déjà existant est écrasé par l'import ; les autres documents restent dans Firestore. L'écran affiche la liste importée jusqu'au prochain chargement. La vérification effectuée ici porte sur les fichiers locaux, pas sur les données actuellement présentes dans Firebase.

## Catalogue à vérifier

- 36 articles n'ont pas d'unité de vente reconnue : leur champ `unit` est vide. Le compléter avec le nom de l'unité appropriée, sans supposer qu'une unité d'achat ou de production est identique.
- 5 articles n'ont pas de catégorie : ils sont rattachés provisoirement à « À classer ».
- 81 articles n'ont pas de prix d'achat. Les champs de prix absents sont représentés par 0 pour respecter le modèle numérique : ce ne sont pas des prix confirmés. Vérifier aussi les prix de vente et revendeur signalés.
- Les IDs des articles et catégories sont générés à partir de leur type et de leur nom. Les codes articles et catégories combinent les initiales du nom avec un numéro séquentiel global : `AN001` pour ALOE NONI, `AM002` pour ALOE MIEL, `PO001` pour Poudre et `SI002` pour Sirop. Les articles de même nom/type sont dédoublonnés en conservant la fiche la plus récente. Pour les deux doublons sans date plus récente, Sakamalaho conserve le prix d'achat de 14 000 et AMBRE 500ML la catégorie Flacons.
- `points-a-verifier.json` détaille les corrections à examiner article par article.

Les types `achat` deviennent `RESALE` et `raw` devient `RAW_MATERIAL`. Les références de catégories sont remappées vers leurs IDs générés ; les références d'unités de vente sont converties en noms d'unités. Les magasins reçoivent des IDs internes stables (`store-pos-01`, `store-rev-01`, etc.) et des codes métier adaptés (`DEP-01`, `POS-01`, `REV-01`, `PRD-01`). Les enregistrements sont marqués actifs ; les dates de création et modification correspondent à la conversion, car les dates historiques ne sont pas fournies.

Les magasins et les catalogues importables ne contiennent que les champs nécessaires à l'application. Les fournisseurs et unités conservent leurs colonnes d'origine dans `legacy_source`. Ces informations supplémentaires (notes fournisseur, NIF, STAT, conversions d'unités, etc.) ne deviennent pas automatiquement des fonctions de l'application et ne sont pas toutes affichées dans ses formulaires. Conserver les fichiers Excel et `source-excel.json` comme archives : une modification ultérieure dans l'application peut supprimer des champs supplémentaires.

## Stocks et autres historiques

La feuille `stock` de la sauvegarde initiale est vide, de même que les historiques de ventes, achats, transferts et production. Le classeur `POINT DE VENTE SEPTEMBRE  2026.xlsx` fournit maintenant un export de soldes par onglet magasin. Le solde physique en quantité est en colonne `DW` (formule finale `DS + DT - DU`); `DZ` est une valeur en ariary et ne doit pas être importée comme quantité.

`stocks-a-verifier.json` est un brouillon partiel en forme `StoreStock`, produit par `extract-stocks.ps1`. Il contient 963 lignes correspondant uniquement aux 12 onglets dont le nom de magasin et les références article reconnues correspondent exactement au catalogue préparé. Parmi elles, 624 ont un solde positif. Le fichier comporte également un rapport de contrôle : 21 onglets non associés (dont des onglets de foire), 42 noms d'articles non reconnus et 4 soldes négatifs exclus. `ready_to_apply` reste à `false`; ne pas appliquer ce fichier comme inventaire complet avant d'avoir résolu ces écarts.

Aucune donnée n'a été envoyée à Firebase. L'application dispose maintenant d'un import initial contrôlé, réservé aux administrateurs : il prévisualise les lignes, bloque les stocks non approuvés, doublons, références inconnues et stocks déjà présents, puis écrit les stocks, mouvements et traces d'audit par lots reprenables. Il exige `review.ready_to_apply: true` dans le JSON après rapprochement métier. Le fichier `stocks-a-verifier.json` reste à `false` et ne peut donc pas être importé en l'état. La sauvegarde des données existantes et la vérification des totaux par magasin restent obligatoires.

Le classeur magasins contient une liste complète et des feuilles par type qui reprennent les mêmes magasins. La comparaison des identifiants et noms avec la sauvegarde confirme les 27 magasins ; ces feuilles ne sont pas additionnées.

## Traçabilité

`source-excel.json` contient les valeurs extraites des deux classeurs. `convert.mjs` permet de régénérer les fichiers depuis cette extraction avec `node imports/2026-09-30/convert.mjs`. Pour régénérer uniquement les magasins, utilisez `node imports/2026-09-30/convert.mjs --stores-only`; pour régénérer uniquement le catalogue importable dédoublonné, utilisez `--catalogue-only`. Pour dédoublonner le catalogue complet du 1er octobre et remapper son brouillon de stocks, utilisez `--normalize-current-catalogue`. Le script vérifie l'unicité des IDs et codes et les références entre données. La commande complète remplace les fichiers générés et leurs dates : ne pas la relancer après des corrections manuelles sans sauvegarder celles-ci.
