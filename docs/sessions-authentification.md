# Expiration des sessions

Les sessions expirent quatre heures après la connexion Firebase, même si l’utilisateur reste actif. Une nouvelle saisie des identifiants ouvre une nouvelle session.

- Le délai repose sur `metadata.lastSignInTime` côté application et sur le champ signé `auth_time` côté règles Firebase.
- Un rechargement, le rafraîchissement automatique du jeton et les interactions ne prolongent pas le délai.
- Le minuteur est revérifié au retour de veille, à la reprise de visibilité et au retour sur la fenêtre.
- Une session expirée est déconnectée avant restauration de l’espace utilisateur. Le formulaire indique le motif de la déconnexion.
- Les règles Firestore et Realtime Database refusent les accès après quatre heures, même si le jeton a été renouvelé.
- Les données déjà en cache ne peuvent pas être effacées à distance par les règles ; l’application ferme l’espace authentifié à expiration.

Tests : `src/services/sessionExpiration.test.ts` ; test des règles dans `scripts/session-expiration-rules.integration.cjs` via `npm run test:rules` (Java requis).
