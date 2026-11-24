# Saamaya Finance — Portail de Réconciliation Marchand
Application de réconciliation financière et de portail marchand pour Saamaya Finance SARL. Elle permet l'import massif de transactions, le calcul sécurisé des frais et commissions, et offre aux marchands un espace self-service pour auditer leurs revenus dans la zone CEMAC.

## 🛠️ Stack Technique

- **Backend** : Python 3.10+, FastAPI, SQLAlchemy, PostgreSQL, Alembic, Pytest
- **Frontend** : React, Vite, Tailwind CSS v4, React Router
- **Sécurité** : JWT (cookie HttpOnly, SameSite=Lax), Bcrypt, isolation stricte des données par rôle via le token.

## 🚀 Installation et Lancement

Un script PowerShell `start-dev.ps1` est disponible à la racine du projet pour lancer les deux serveurs simultanément. Sinon, suivez les étapes manuelles ci-dessous.

### 1. Backend
```bash
cd backend
python -m venv .venv
# Sur Windows :
.venv\Scripts\activate
# Sur macOS/Linux :
source .venv/bin/activate

pip install -r requirements.txt

# Configurer le fichier .env à partir de .env.example
# Appliquer les migrations et initialiser la base de données
alembic upgrade head
python -m app.init_db

# Lancer le serveur de développement
uvicorn app.main:app --reload --port 8000
2. Frontend
bash
cd frontend
npm install
npm run dev
L'application est accessible sur http://localhost:5173.
🔑 Identifiants de Démonstration
Administrateur : admin / admin123
Marchand 1 : 000101 / marchand123
Marchand 2 : 000102 / marchand123
📜 Règles Métier et Choix d'Architecture
Calcul des frais en entiers : Aucun nombre à virgule (float) n'est utilisé pour éviter les erreurs d'arrondi comptables. La formule d'arrondi mathématique au plus proche est (montant + diviseur // 2) // diviseur. La commission est fixe à 50 FCFA. Les statuts autres que CONFIRME ont des frais à NULL.
Idempotence des imports : Un import CSV contenant des références déjà présentes avec les mêmes données est ignoré (compté comme "déjà présent"). Une référence existante avec des données différentes est strictement rejetée avec un motif, sans écrasement silencieux.
Isolation stricte des données : Le code_marchand n'est jamais lu depuis l'URL ou les paramètres de requête. Il est extrait exclusivement du payload du JWT signé côté serveur, garantissant qu'un marchand ne peut pas accéder aux données d'un autre (retour 403 en cas de tentative).
Masquage des données sensibles : Le numéro de téléphone est masqué côté serveur au format 6XX XX X0 01 avant d'être envoyé au frontend, empêchant toute exposition de la donnée brute.
Sécurité de la session : Le jeton JWT (durée de vie 15 min) est stocké dans un cookie HttpOnly et SameSite=Lax, le rendant inaccessible aux scripts JavaScript et immunisé contre les vols par faille XSS.
🧪 Tests
Le backend inclut une suite de tests unitaires et d'intégration couvrant les calculs de frais, l'authentification (blocage après 5 échecs), l'import idempotent et l'isolation des marchands.
bash
cd backend
pytest -q
(59 tests passent avec succès)
🎬 Scénario de Démonstration Recommandé
Lancer l'application et se connecter en Admin (admin / admin123).
Aller dans "Import des paiements" et uploader le fichier backend/exemples/paiements_test.csv.
Constater le résumé : 14 lues, 9 importées, 1 déjà présente, 4 rejetées (avec motifs).
Preuve d'idempotence : Réimporter exactement le même fichier. Le résumé affiche désormais 0 importées et 10 déjà présentes.
Se déconnecter et se connecter en Marchand (000101 / marchand123).
Constater que le tableau de bord affiche les vrais totaux et que le téléphone est masqué (6XX XX X0 01).
Ouvrir les outils de développement (F12) > Application > Cookies : vérifier que le jeton est bien marqué HttpOnly et invisible via document.cookie dans la console.
⚠️ Note sur le développement
Pour accélérer la mise en place de l'interface utilisateur (configuration du build, composants de base React, utilitaires Tailwind), un assistant IA a été sollicité de manière ponctuelle. Cependant, l'ensemble de l'architecture, des règles métier critiques (calculs financiers, sécurité JWT, isolation des données, idempotence) et de la logique d'état a été conçu, revu ligne par ligne et validé manuellement pour garantir la robustesse, la sécurité et la stricte conformité aux exigences du sujet.
© 2026 Saamaya Finance SARL. Projet réalisé dans le cadre d'un test technique.