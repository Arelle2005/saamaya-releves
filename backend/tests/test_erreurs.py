from fastapi import FastAPI

from app.auth import router as router_auth
from app.erreurs import installer_gestionnaires
from app.imports import router as router_imports
from app.releves import router as router_releves

DESCRIPTION = """
Saamaya encaisse des paiements pour le compte de marchands. Cette API permet :

* à un **ADMIN** d'importer le fichier CSV des paiements et de consulter l'historique des imports ;
* à un **MARCHAND** de consulter **uniquement ses propres** paiements, ses totaux sur une période
  et d'exporter son relevé en CSV.

**Authentification.** `POST /auth/connexion` renvoie un jeton JWT valable 15 minutes. Il est aussi
posé dans un cookie `HttpOnly` (utilisé par l'application web). Les autres clients l'envoient dans
l'en-tête `Authorization: Bearer <jeton>`.

**Isolation des marchands.** Le code marchand n'est jamais lu dans la requête : il vient toujours
de l'utilisateur authentifié. Viser un autre marchand donne une erreur 403.

**Montants.** Tous les montants sont des entiers en FCFA, sans centimes.

**Erreurs.** Toutes les erreurs ont le même format `{"detail": "message en français"}` avec un code
HTTP juste : 400 (requête invalide), 401 (non authentifié), 403 (accès refusé), 404 (introuvable).
"""

TAGS = [
    {"name": "authentification", "description": "Connexion, déconnexion et profil."},
    {"name": "imports", "description": "Import du fichier CSV des paiements (rôle ADMIN)."},
    {"name": "relevés", "description": "Paiements, totaux et export du marchand connecté (rôle MARCHAND)."},
    {"name": "supervision", "description": "Vérification de l'état du service."},
]

app = FastAPI(
    title="Saamaya — Espace relevés marchand",
    version="1.0.0",
    description=DESCRIPTION,
    openapi_tags=TAGS,
)
installer_gestionnaires(app)
app.include_router(router_auth)
app.include_router(router_imports)
app.include_router(router_releves)


@app.get(
    "/sante",
    tags=["supervision"],
    summary="État du service",
    description="Renvoie `{\"statut\": \"ok\"}` quand le serveur répond. Aucune authentification.",
)
def sante():
    return {"statut": "ok"}