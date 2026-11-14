# Style des interfaces Ventes & caisse et Commandes Point de vente

Ce guide décrit le style commun à `src/components/SalesView.tsx` et `src/components/PointOfSaleOrdersView.tsx`. Il sert de référence pour harmoniser les prochains modules de gestion.

## Structure de la page

1. Lien discret de retour à l’accueil.
2. En-tête blanc avec icône, titre, description courte et action principale.
3. Bandeau explicatif vert foncé présentant le circuit métier.
4. Barre de filtres : statuts, magasin et recherche.
5. Tableau de suivi ou espace de saisie avec catalogue et panier.

Utiliser `space-y-6` pour séparer les grandes sections.

## Palette

| Usage | Classes Tailwind |
| --- | --- |
| Panneaux | `bg-white` |
| Surfaces secondaires | `bg-slate-50` |
| Bordures | `border-slate-200` |
| Bordures des champs | `border-slate-300` |
| Texte principal | `text-slate-900` |
| Libellés | `text-slate-600` |
| Texte secondaire | `text-slate-500` |
| Action principale | `bg-emerald-600 text-white` |
| Survol principal | `hover:bg-emerald-700` |
| Icônes et accents | `text-emerald-600` |
| Bandeau métier | `bg-emerald-950 text-emerald-100` |
| Accent du bandeau | `text-emerald-300` |

Cette palette reprend l’interface existante. Le rendu dans les différents thèmes doit être vérifié avant de généraliser le style.

## Typographie

- Titre de page : `font-serif text-lg font-bold`.
- Titre de formulaire : `text-lg font-black`.
- Titre de section : `text-sm font-bold`.
- Texte courant et champs : `text-sm`.
- Descriptions, libellés et actions : `text-xs`.
- Quantités : `tabular-nums` pour stabiliser l’alignement des chiffres.
- Employer les mêmes icônes Lucide que le reste de l’application, généralement en `h-4 w-4` ou `h-5 w-5`.

## Panneaux

```text
En-tête : rounded-2xl border border-slate-200 bg-white p-5
Filtres : rounded-xl border border-slate-200 bg-white p-4
Tableau : overflow-hidden rounded-2xl border border-slate-200 bg-white
Bandeau : rounded-2xl bg-emerald-950 p-4 text-xs leading-6 text-emerald-100
```

Les espacements regroupent les éléments associés : `gap-2` pour les contrôles, `gap-3` à `gap-4` pour les groupes et `space-y-6` entre les sections.

## Boutons

### Action principale

```text
ui-btn h-auto min-h-10 rounded-xl border-emerald-600
bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white
shadow-none hover:bg-emerald-700
disabled:bg-slate-200 disabled:text-slate-500
```

Exemples : Nouvelle commande, Envoyer la commande, Créer la demande de transfert.

### Action secondaire

```text
ui-btn h-auto min-h-10 rounded-xl border-slate-200
bg-white px-4 py-2.5 text-xs font-bold text-slate-700
shadow-none hover:bg-slate-50
```

Exemples : Fermer, Consulter, Enregistrer l’analyse.

### Actions sur les lignes

Utiliser des boutons compacts avec une icône : plus, moins, corbeille. Chaque bouton contenant uniquement une icône doit avoir un `aria-label` précis incluant le nom de l’article.

## Champs

- Libellé visible : `text-xs font-bold text-slate-600`.
- Champ : hauteur de 44 px environ, fond blanc, bordure ardoise et angles arrondis.
- Focus : `focus:ring-2 focus:ring-emerald-500`.
- Recherche : icône à gauche et espace intérieur `pl-10`.
- Notes : zone de texte d’au moins `min-h-24`.
- Champs désactivés pendant un enregistrement ou lors d’une consultation sans modification.

```text
h-11 w-full border px-3 rounded-xl border-slate-300
bg-white text-sm text-slate-900 focus:ring-2 focus:ring-emerald-500
```

## Filtres et tableau

Les filtres de statut sont des boutons compacts. Le filtre actif utilise le vert émeraude ; les autres utilisent `bg-slate-100 text-slate-600`.

Le tableau présente une référence en gras, une date secondaire, le magasin, le responsable, le nombre d’articles, le statut et une action explicite.

- En-tête : `bg-slate-50 text-xs text-slate-600`.
- Survol d’une ligne : `hover:bg-slate-50`.
- Placer le tableau dans un conteneur `overflow-x-auto` sur petit écran.
- Distinguer les états « aucune donnée » et « aucun résultat pour les filtres ».

## Badges de statut

| Statut | Classes |
| --- | --- |
| À analyser | `bg-amber-50 text-amber-800 border-amber-200` |
| Transfert créé | `bg-emerald-50 text-emerald-700 border-emerald-200` |
| Refusée | `bg-rose-50 text-rose-700 border-rose-200` |

Base commune :

```text
inline-flex items-center rounded-full border px-2.5 py-1
text-xs font-semibold whitespace-nowrap
```

Toujours afficher un libellé : la couleur seule ne suffit pas à expliquer un statut.

## Catalogue et panier

Sur grand écran, afficher le catalogue à gauche et le panier à droite. Sur mobile, empiler les sections.

```text
lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,1fr)]
```

### Catalogue

- Fond ardoise clair et barre de recherche blanche.
- Articles en grille : une colonne, puis deux selon la largeur disponible.
- Chaque article affiche une icône, son nom, sa référence, son unité et une action d’ajout.
- Survol : bordure et fond légèrement émeraude.
- La liste peut défiler verticalement indépendamment du reste du formulaire.

### Panier

- Fond blanc et titre indiquant le nombre de lignes.
- Chaque ligne affiche le nom, la référence, l’unité et la quantité.
- Boutons plus et moins autour d’une quantité directement modifiable.
- Action de retrait identifiable par une corbeille.
- Notes et actions finales sous les lignes.
- Action principale sur toute la largeur quand elle termine la saisie.

Pour les commandes, conserver une présentation distincte de la demande initiale et des quantités retenues par l’administrateur.

## Retours et accessibilité

- Chargement et enregistrement : message avec `role="status"`.
- Erreur : encadré rose avec `role="alert"`.
- Succès : encadré émeraude.
- Panier vide : encadré à bordure pointillée avec une instruction courte.
- Boutons de filtre : indiquer la sélection avec `aria-pressed`.
- Tous les champs doivent avoir un libellé accessible.
- Préserver la navigation au clavier et un focus visible.
- Vérifier les libellés longs et les débordements sur mobile.

## Configuration daisyUI du projet

La configuration actuelle de `src/index.css` utilise le préfixe `ui-` et limite les composants aux boutons, tableaux, modales et sélecteurs.

- Employer `ui-btn`, `ui-table` et `ui-select`.
- Les classes non préfixées comme `btn` et `select` ne correspondent pas à cette configuration.
- Les champs texte, zones de texte et badges utilisent ici les utilitaires Tailwind.
- Les variables daisyUI sont actuellement définies dans `.treasury-shell`, également utilisé comme conteneur du module Commandes Point de vente.

## Vérifications avant livraison

- Vérifier le rendu sur mobile et ordinateur.
- Vérifier les états vide, chargement, erreur et enregistrement.
- Vérifier les boutons actifs, désactivés et les autorisations métier.
- Exécuter `npm.cmd run lint` et `npm.cmd run build`.

Le style organise la présentation. Les règles de commande, d’analyse et de transfert restent définies dans les services métier.
