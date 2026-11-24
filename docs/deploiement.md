# Vérification et déploiement de Gileada POS

Le workflow **Verify release** vérifie TypeScript, les tests métier, toutes les suites d’intégration Firestore sur émulateur et le build Vite. Sur une pull request ou un push sur `main`, il produit l’artefact de contrôle `gileada-pos-build-<SHA>`. Le candidat `gileada-pos-release-<SHA>` est créé après la publication réussie des règles en préproduction. Le build public est dans `dist/`. Seuls les fichiers de ce dossier sont servis par Firebase Hosting.

## Vérifier les règles compilées

L’émulateur vérifie le comportement des règles. La limite de taille compilée est contrôlée lors de leur publication par Firebase. Lancer le workflow sur le commit candidat avec **publish_staging_rules** pour vérifier cette étape sur un projet Firebase de préproduction dédié, doté d’une base Firestore par défaut.

Configurer l’environnement GitHub `staging` avec les variables `FIREBASE_STAGING_PROJECT`, `FIREBASE_STAGING_IDENTITY_PROVIDER` et `FIREBASE_STAGING_SERVICE_ACCOUNT`. Le compte de service doit pouvoir publier les règles dans ce projet. Le workflow refuse le projet de production `stockgileada`.

## Publier le commit vérifié

1. Lancer **Verify release** sur le commit candidat avec **publish_staging_rules**, puis télécharger et décompresser `gileada-pos-release-<SHA>` depuis cette exécution.
2. Depuis la racine de l’artefact, publier les règles de la base Firestore par défaut si elles ont changé. Vérifier que la version active correspond au fichier de l’artefact. Si Firebase refuse la publication, suspendre la mise en ligne de l’interface qui en dépend.

   ```sh
   npx --yes firebase-tools@15.32.1 deploy --only firestore:rules --project stockgileada --non-interactive
   ```

3. Publier le build vérifié et vérifier que la page d’entrée et ses fichiers JavaScript répondent sur [Gileada POS](https://gileadapos.web.app).

   ```sh
   npx --yes firebase-tools@15.32.1 deploy --only hosting:gileadapos --project stockgileada --non-interactive
   ```

Firebase Auth gère les comptes. Le serveur Express sert l’application et répond à `/api/health`. L’ancien fichier local de comptes a été retiré de l’arborescence. Les anciens commits et leurs copies peuvent encore le contenir. Vérifier les accès aux anciennes copies et aux anciens hébergements avant de décider d’une rotation des comptes concernés ou d’une réécriture coordonnée de l’historique.
