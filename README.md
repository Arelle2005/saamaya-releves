# Saamaya Relevés — espace relevés d'un marchand

Application réalisée pour le test technique « Développeur·se full-stack » de Saamaya. Un **administrateur** importe le fichier CSV des paiements de la veille ; chaque **marchand** se connecte et voit **uniquement ses propres paiements**, ses totaux sur une période et peut exporter son relevé en CSV.

- **Serveur** : Python, FastAPI, SQLAlchemy, Alembic

- **Base de données** : PostgreSQL (seule base utilisée)

- **Écran** : React, Vite, Tailwind CSS v4, React Router

- **Tests** : Pytest (backend), Vitest (frontend)

---

## 1. Installation pas à pas (Windows, PowerShell)

### Prérequis

| Outil | Version | Vérification |

|---|---|---|

| Python | 3.10 ou plus | `python --version` |

| Node.js | 20 ou plus | `node --version` |

| PostgreSQL | 14 ou plus | `psql --version` |

### 1. Créer les deux bases PostgreSQL

Une base pour l'application, une autre pour les tests automatiques (elle est vidée à chaque test : ne jamais la confondre avec la première).

```powershell

psql -U postgres -c "CREATE DATABASE saamaya;"

psql -U postgres -c "CREATE DATABASE saamaya_test;"

```

Si `psql` n'est pas reconnu, utiliser pgAdmin, ou le chemin complet, par exemple `"C:\Program Files\PostgreSQL\16\bin\psql.exe"`.

### 2. Backend

```powershell

cd backend

python -m venv .venv

.\.venv\Scripts\Activate.ps1

pip install -r requirements.txt

Copy-Item .env.example .env

```

Si PowerShell refuse d'activer l'environnement (« l'exécution de scripts est désactivée »), lancer une fois :

`Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`, puis réactiver.

Ouvrir `backend\.env` et renseigner les variables (voir le tableau plus bas). Pour générer la clé de signature du jeton :

```powershell

python -c "import secrets; print(secrets.token_hex(32))"

```

Créer les tables, puis les comptes :

```powershell

python -m alembic upgrade head

python -m alembic current

python -m app.init_db

```

`alembic upgrade head` n'affiche rien quand tout se passe bien. `alembic current` doit afficher `0003 (head)`. `init_db` crée les marchands `000101 Boutique Alpha` et `000102 Pharmacie Gamma` ainsi que le compte `admin`, avec les mots de passe du `.env`.

Lancer le serveur :

```powershell

python -m uvicorn app.main:app --reload --port 8000

```

Vérifier : <http://127.0.0.1:8000/sante> affiche `{"statut":"ok"}`. La documentation interactive de l'API est sur <http://127.0.0.1:8000/docs>.

### 3. Frontend (dans un second terminal)

```powershell

cd frontend

npm install

npm run dev

```

L'application est sur <http://localhost:5173>. Le serveur de développement Vite relaie `/api` vers le backend (`127.0.0.1:8000`) : l'écran et l'API sont ainsi sur la même origine et le cookie du jeton fonctionne sans configuration supplémentaire.

*(Raccourci Windows : `.\start-dev.ps1` ouvre les deux serveurs dans deux fenêtres.)*

### Variables d'environnement (`backend\.env`)

Aucune valeur réelle n'est dans le dépôt : `.env` est ignoré par Git, `.env.example` ne contient que des modèles.

| Variable | Rôle |

|---|---|

| `DATABASE_URL` | Connexion à la base de l'application, ex. `postgresql+psycopg://utilisateur:motdepasse@localhost:5432/saamaya` |

| `TEST_DATABASE_URL` | Connexion à la base **des tests** (`saamaya_test`) |

| `JWT_SECRET` | Clé de signature du jeton. **32 caractères minimum** : le serveur refuse de démarrer sinon |

| `COOKIE_SECURE` | `false` en développement (HTTP), `true` en production (HTTPS) |

| `ADMIN_PASSWORD` | Mot de passe initial du compte `admin` |

| `MARCHAND_000101_PASSWORD` | Mot de passe initial du compte `000101` |

| `MARCHAND_000102_PASSWORD` | Mot de passe initial du compte `000102` |

### Comptes de test

| Identifiant | Rôle | Mot de passe |

|---|---|---|

| `admin` | ADMIN | valeur de `ADMIN_PASSWORD` dans votre `.env` |

| `000101` | MARCHAND (Boutique Alpha) | valeur de `MARCHAND_000101_PASSWORD` |

| `000102` | MARCHAND (Pharmacie Gamma) | valeur de `MARCHAND_000102_PASSWORD` |

Les mots de passe ne sont écrits nulle part dans le code. `init_db` ne modifie pas un compte déjà créé : si le `.env` change après la première initialisation, ou si un compte est bloqué, lancer `python -m app.reset_mots_de_passe` (dans `backend`, environnement activé).

### Scénario de démonstration

1. Se connecter en `admin`, ouvrir « Import des paiements », choisir `backend/exemples/paiements_sujet.csv` (le fichier exact du sujet). Résultat attendu : **14 lues, 9 importées, 1 déjà présente, 4 rejetées** (détail section 3).

2. Réimporter le même fichier : **0 importée, 10 déjà présentes, 4 rejetées**.

3. Se déconnecter, se connecter en `000101`, ouvrir « Mes paiements », choisir la période du `2026-11-01` au `2026-11-30` : 4 paiements, totaux net **6 233 750 FCFA**, numéros affichés `6XX XX X0 01`.

4. Cliquer « Exporter mon relevé » : fichier CSV avec ligne de totaux.

5. Se connecter en `000102` : net **1 601 112 FCFA**, aucun paiement de `000101` visible.

---

## 2. Tests

```powershell

cd backend

pytest -q          # 142 tests, environ 2 minutes

cd ..\frontend

npm test           # 48 tests

```

Les tests backend couvrent notamment : les six cas de contrôle des frais et les bornes des tranches, l'import du fichier exact du sujet, l'import en double, les lignes mal formées, l'isolation des marchands (jeton, paramètre `code_marchand`, rôle ADMIN), la limitation des connexions (dont une rafale de requêtes simultanées), les erreurs en français et la documentation OpenAPI. Les tests frontend couvrent l'affichage des paiements (téléphone, montants, « — »), les messages de connexion, la session (expiration, 401, déconnexion) et la protection des routes.

---

## 3. Compte rendu de l'import du fichier du sujet

Fichier : `backend/exemples/paiements_sujet.csv` (14 lignes de données).

| Résultat | Nombre |

|---|---|

| Lignes lues | 14 |

| Importées | 9 |

| Déjà présentes | 1 (`GIM-0002`, ligne 9 : doublon identique de la ligne 3) |

| Rejetées | 4 |

**Lignes rejetées** (le numéro de ligne compte l'en-tête comme ligne 1) :

| Ligne | Référence | Donnée | Motif affiché |

|---|---|---|---|

| 10 | `GIM-0008` | montant `300` | montant hors tranche (500 à 100 000 000 FCFA) |

| 11 | `GIM-0009` | marchand `000999` | marchand inconnu |

| 12 | `GIM-0010` | montant `-5000` | montant invalide : uniquement des chiffres attendus |

| 14 | `GIM-0012` | montant `1 000` | montant invalide : uniquement des chiffres attendus |

**Paiements importés** : `GIM-0001` à `GIM-0007`, `GIM-0011` et `GIM-0013`. `GIM-0006` (EN_ATTENTE) et `GIM-0007` (REFUSE) sont enregistrés sans frais, commission ni net.

**Totaux calculés du 1er au 30 novembre 2026** (paiements CONFIRME uniquement) :

| Marchand | Confirmés | Brut | Frais réseau | Commission | Net |

|---|---|---|---|---|---|

| `000101` | 3 | 6 260 000 | 26 100 | 150 | 6 233 750 |

| `000102` | 4 | 1 610 067 | 8 755 | 200 | 1 601 112 |

**Cas de contrôle des frais** (testés automatiquement) :

| Montant | Frais réseau | Commission | Net |

|---|---|---|---|

| 500 | 5 | 50 | 445 |

| 10 000 | 100 | 50 | 9 850 |

| 250 000 | 1 000 | 50 | 248 950 |

| 300 000 | 3 000 | 50 | 296 950 |

| 1 234 567 | 5 000 | 50 | 1 229 517 |

| 6 000 000 | 25 000 | 50 | 5 974 950 |

---

## 4. API

Documentation complète et interactive : <http://127.0.0.1:8000/docs> (OpenAPI). Toutes les erreurs ont le même format `{"detail": "message en français"}`.

| Méthode et chemin | Rôle | Effet | Erreurs |

|---|---|---|---|

| `POST /auth/connexion` | tous | Renvoie un jeton JWT valable 15 minutes (aussi posé dans un cookie `HttpOnly`) | 400, 401, 403 |

| `POST /auth/deconnexion` | tous | Efface le cookie | |

| `GET /auth/moi` | connecté | Profil de l'utilisateur | 401 |

| `POST /imports` | ADMIN | Importe le fichier CSV | 400, 401, 403 |

| `GET /imports` | ADMIN | Historique des imports avec leurs rejets | 401, 403 |

| `GET /imports/{id}` | ADMIN | Détail d'un import | 401, 403, 404 |

| `GET /paiements?du=&au=&statut=&page=` | MARCHAND | Ses paiements, 20 par page, numéros masqués | 400, 401, 403 |

| `GET /releve?du=&au=` | MARCHAND | Ses totaux : nombre de confirmés, brut, frais, commission, net | 400, 401, 403 |

| `GET /releve/export?du=&au=` | MARCHAND | Son relevé en CSV avec ligne de totaux | 400, 401, 403 |

| `GET /sante` | public | `{"statut": "ok"}` | |

Signification des codes : **400** requête invalide (paramètre absent ou mal formé, période trop longue, fichier refusé), **401** non authentifié ou jeton expiré, **403** accès refusé (mauvais rôle, autre marchand, compte bloqué), **404** ressource introuvable.

Exemple (PowerShell) :

```powershell

$r = Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/auth/connexion `

  -ContentType "application/json" `

  -Body '{"identifiant":"000101","mot_de_passe":"VOTRE_MOT_DE_PASSE"}'

$h = @{ Authorization = "Bearer $($r.jeton)" }

Invoke-RestMethod -Uri "http://127.0.0.1:8000/releve?du=2026-11-01&au=2026-11-30" -Headers $h

```

Import d'un fichier (avec le jeton d'un administrateur) :

```powershell

curl.exe -X POST http://127.0.0.1:8000/imports `

  -H "Authorization: Bearer $($r.jeton)" `

  -F "fichier=backend/exemples/paiements_sujet.csv;type=text/csv"

```

---

## 5. Sécurité

- **Mots de passe** hachés avec bcrypt, jamais stockés ni journalisés en clair. Un mot de passe de plus de 72 octets (limite de bcrypt) est simplement refusé.

- **Aucun secret dans le dépôt** : clé du jeton, mots de passe et accès à la base passent par `.env` (ignoré par Git). Le serveur refuse de démarrer avec une clé de moins de 32 caractères.

- **Isolation des marchands** : le code marchand n'est jamais lu dans la requête. Il vient de l'utilisateur authentifié (rechargé depuis la base à chaque requête grâce à l'identifiant du jeton). Le filtre par marchand est écrit une seule fois (`_filtres` dans `releves.py`) et partagé par la liste, les totaux et l'export. Un paramètre `code_marchand` différent donne 403, et un ADMIN n'a pas accès aux routes marchand.

- **Jeton JWT** de 15 minutes (HS256, algorithme imposé au décodage), posé dans un cookie `HttpOnly`, `SameSite=Lax`, `Secure` selon `COOKIE_SECURE`. L'écran ne garde pas le jeton en mémoire.

- **Limitation des connexions** : 5 échecs consécutifs sur un identifiant, existant ou non, bloquent les connexions pendant 15 minutes (403 avec `Retry-After`). La tentative est comptée **avant** la vérification, en une seule instruction SQL atomique : même 12 requêtes simultanées ne vérifient que 5 mots de passe. Un identifiant inconnu coûte le même temps de calcul qu'un compte réel et reçoit les mêmes réponses, pour ne pas révéler quels comptes existent.

- **Requêtes SQL** construites avec SQLAlchemy (paramétrées), aucune concaténation de chaînes.

- **Fichier importé** : extension `.csv` et type vérifiés, 2 Mo maximum, texte UTF-8 (un fichier binaire est refusé), CSV illisible refusé en 400.

- **Données personnelles** : numéros de téléphone masqués côté serveur (`699000001` devient `6XX XX X0 01`) dans la liste et dans l'export.

---

## 6. Hypothèses

Le sujet autorisait une seule question dans les 12 premières heures ; les points suivants sont mes hypothèses.

1. **Période de 90 jours** : « du » et « au » sont inclus. Du 1er janvier au 31 mars (90 jours) est accepté ; du 1er janvier au 1er avril (91 jours) donne 400.

2. **Format de date du CSV** : `AAAA-MM-JJTHH:MM:SS`, sans fuseau, interprété en heure du Cameroun (`Africa/Douala`). Une date sans heure, ou dans un autre format, est rejetée.

3. **Référence** : 1 à 50 caractères, sans espace ni caractère de contrôle (la colonne en base fait 50 caractères).

4. **Ligne mal formée** : nombre de valeurs différent de 6 : ligne rejetée. Séparateur `,` ou `;` accepté.

5. **Montant** : uniquement des chiffres (ni signe, ni espace). Contrôle dans l'ordre : montant (chiffres puis tranche), marchand, statut, téléphone, date ; le motif affiché est le premier échec rencontré.

6. **Paiements EN_ATTENTE et REFUSE** : frais, commission et net valent `NULL` en base (`null` dans l'API, « — » à l'écran, cellule vide dans l'export CSV).

7. **Bornes du montant** : lues depuis les tranches de frais (`frais.py`) : ajouter une tranche élargit automatiquement ce que l'import accepte.

8. **Blocage de connexion** : 403 (et non 429, car le sujet liste 400, 401, 403, 404). Le compteur d'un identifiant inactif depuis plus de 24 heures est oublié. Conséquence connue de tout blocage par identifiant : une personne malveillante peut bloquer un compte en le visant.

9. **Jeton dans la réponse de connexion** : exigé par le sujet. L'application web l'ignore et ne s'appuie que sur le cookie `HttpOnly`.

10. **Fuseau** : les dates sont stockées avec fuseau (`timestamptz`), affichées et exportées en heure du Cameroun.

11. **Un paiement déjà enregistré n'est jamais modifié** par un import (réponse n° 3 du sujet).

---

## 7. Organisation du code

```

backend/

  app/

    main.py            application FastAPI, documentation OpenAPI

    config.py          variables d'environnement (clé JWT, cookie)

    frais.py           frais réseau, commission, net (entiers uniquement)

    imports.py         import CSV : validation ligne par ligne, idempotence

    releves.py         paiements, totaux, export CSV du marchand

    auth.py            connexion, déconnexion, profil

    tentatives.py      limitation des connexions (comptage atomique)

    securite.py        bcrypt et JWT

    deps.py            utilisateur courant, rôles, isolation des marchands

    erreurs.py         erreurs en français (400, 404, 405)

    masquage.py        masquage des numéros de téléphone

    models.py          tables SQLAlchemy

    init_db.py         marchands et comptes initiaux

    reset_mots_de_passe.py   réinitialisation des mots de passe de test

  alembic/versions/    migrations (0001 schéma, 0002 et 0003 limitation des connexions)

  tests/               Pytest

  exemples/            fichier CSV exact du sujet

frontend/

  src/

    App.jsx, api.js, auth.jsx   routes protégées, appels API, session

    pages/                      Login, Mes paiements, Import, Accueil

    *.test.jsx                  Vitest

```

Écrans : **Connexion** (messages distincts : identifiants faux, compte bloqué, serveur indisponible ; déconnexion automatique à l'expiration du jeton), **Import** (compte rendu avec le motif de chaque rejet, historique), **Mes paiements** (période et statut, totaux, export ; tableau sur grand écran, cartes empilées sous 768 px pour les téléphones). L'écran d'accueil (tableau de bord) va au-delà de ce que demandait le sujet.

---

## 8. Assistants IA utilisés

Le sujet autorise les assistants de code et demande d'indiquer lesquels et pour quelles parties.

**Version initiale du dépôt** (jusqu'aux commits livrés avant l'échéance)

- Outil : Qwen (modèle Qwen3.7-Plus)
- Parties concernées :
  - Configuration et structure initiale : génération de propositions pour la structure de certains composants React, la configuration de Tailwind CSS et les formulaires de base. J'ai ensuite adapté ces propositions aux besoins de Saamaya et intégré la logique métier.
  - Tests unitaires : aide à l'identification de cas limites à tester, notamment les fichiers vides et les formats de dates inhabituels. J'ai écrit et vérifié les assertions, puis contrôlé que les tests correspondaient aux règles fonctionnelles de Saamaya.
  - Refactoring et lisibilité : suggestions d'amélioration après la mise en place de la logique d'import CSV et de calcul des frais (noms de variables, découpage en fonctions plus petites). J'ai relu et validé les changements avant de les conserver, afin de préserver le comportement attendu.
  - Documentation : aide à l'organisation, à la mise en forme et à la correction du README.md et de certains commentaires, à partir de mes notes et des choix techniques du projet.
  - Débogage et syntaxe : consultation d'exemples ponctuels, notamment pour des agrégations SQLAlchemy et la configuration de Vite. J'ai adapté les exemples au projet et vérifié leur fonctionnement.
  L'IA a donc servi d'assistant pour accélérer certaines tâches et proposer des pistes. Les choix techniques, l'intégration, les adaptations et les vérifications du résultat ont été effectués par moi-même.
**Passe de relecture et de correction du 26 novembre 2026**

- Outil : **Claude (Anthropic)**

- Parties concernées :

  - import CSV : rejet sans erreur des lignes mal formées (référence trop longue, colonnes en trop, date sans heure), lecture groupée des paiements existants, verrou contre les imports simultanés, exécution sans bloquer le serveur, route de détail d'un import ;

  - erreurs en 400/404 avec message français, documentation OpenAPI de toutes les routes, période de 90 jours ;

  - limitation des connexions (table `tentatives_connexion`, comptage atomique, comptes inconnus), clé JWT, cookie `Secure` ;

  - frontend : affichage du téléphone, cartes pour téléphone, messages de connexion, expiration de la session ;

  - tests Pytest et Vitest correspondant à ces corrections, et ce README.

Chaque correction est couverte par des tests automatiques. Je peux expliquer le fonctionnement de chaque fichier du dépôt et modifier le code en direct.

---

