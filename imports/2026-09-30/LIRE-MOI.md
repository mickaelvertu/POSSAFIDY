# Reprise des fichiers Excel du 30 septembre 2026

Ces fichiers ont été préparés localement. Aucune donnée n'a été envoyée à Firebase.

## Fichiers utilisables avec les boutons Importer

Avec un compte ADMIN ou SUPER_ADMIN :

1. Magasins : importer `magasins.json` (27 magasins).
2. Unités : importer `unites.json` (6 unités).
3. Achats & fournisseurs : importer `fournisseurs.json` (53 fournisseurs).
4. Catalogue : compléter et vérifier `catalogue-a-verifier.json` avant de l'importer (140 articles, 17 catégories d'origine et une catégorie provisoire « À classer »).

Exporter les données actuelles avant la reprise. Un identifiant déjà existant est écrasé par l'import ; les autres documents restent dans Firestore. L'écran affiche la liste importée jusqu'au prochain chargement. La vérification effectuée ici porte sur les fichiers locaux, pas sur les données actuellement présentes dans Firebase.

## Catalogue à vérifier

- 38 articles n'ont pas d'unité de vente reconnue : leur champ `unit` est vide. Le compléter avec le nom de l'unité appropriée, sans supposer qu'une unité d'achat ou de production est identique.
- 5 articles n'ont pas de catégorie : ils sont rattachés provisoirement à « À classer ».
- 81 articles n'ont pas de prix d'achat. Les champs de prix absents sont représentés par 0 pour respecter le modèle numérique : ce ne sont pas des prix confirmés. Vérifier aussi les prix de vente et revendeur signalés.
- Les codes manquants ou partagés par plusieurs articles sont remplacés par les identifiants d'origine, uniques. Aucun article n'est fusionné sur son nom.
- `points-a-verifier.json` détaille les corrections à examiner article par article.

Les types `achat` deviennent `RESALE` et `raw` devient `RAW_MATERIAL`. Les références de catégories sont conservées ; les références d'unités de vente sont converties en noms d'unités. Les identifiants d'origine sont préservés. Les codes magasins et catégories utilisent leur identifiant d'origine, faute de code distinct dans la source. Les enregistrements sont marqués actifs ; les dates de création et modification correspondent à la conversion, car les dates historiques ne sont pas fournies.

Chaque enregistrement conserve ses colonnes d'origine dans `legacy_source`. Ces informations supplémentaires (notes fournisseur, NIF, STAT, conversions d'unités, etc.) ne deviennent pas automatiquement des fonctions de l'application et ne sont pas toutes affichées dans ses formulaires. Conserver les fichiers Excel et `source-excel.json` comme archives : une modification ultérieure dans l'application peut supprimer des champs supplémentaires.

## Stocks et autres historiques

La feuille `stock` de la sauvegarde est vide, de même que les historiques de ventes, achats, transferts et production. Aucun stock nul n'a été créé et aucun fichier d'import de stock n'a été généré. Il faut un export contenant les articles, magasins et quantités pour reprendre les soldes.

Le classeur magasins contient une liste complète et des feuilles par type qui reprennent les mêmes magasins. La comparaison des identifiants et noms avec la sauvegarde confirme les 27 magasins ; ces feuilles ne sont pas additionnées.

## Traçabilité

`source-excel.json` contient les valeurs extraites des deux classeurs. `convert.mjs` permet de régénérer les fichiers depuis cette extraction avec `node imports/2026-09-30/convert.mjs`. Le script vérifie les identifiants, les codes uniques, les références de catégories, les types, les valeurs numériques et la correspondance des magasins. Sa relance remplace les fichiers générés et leurs dates : ne pas le relancer après des corrections manuelles sans sauvegarder celles-ci.
