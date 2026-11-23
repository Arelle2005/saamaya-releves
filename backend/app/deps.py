"""Dépendances FastAPI : session base de données et utilisateur authentifié."""

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Utilisateur
from app.securite import decoder_jeton

# auto_error=False : on renvoie nous-mêmes 401 (et non 403) si le jeton manque
schema_securite = HTTPBearer(auto_error=False)


def get_session():
    with SessionLocal() as session:
        yield session


def utilisateur_courant(
    jeton: HTTPAuthorizationCredentials | None = Depends(schema_securite),
    session: Session = Depends(get_session),
) -> Utilisateur:
    if jeton is None:
        raise HTTPException(status_code=401, detail="Authentification requise.")
    try:
        contenu = decoder_jeton(jeton.credentials)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expirée, veuillez vous reconnecter.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Jeton invalide.")
    utilisateur = session.get(Utilisateur, int(contenu["sub"]))
    if utilisateur is None:
        raise HTTPException(status_code=401, detail="Jeton invalide.")
    return utilisateur


def admin_requis(utilisateur: Utilisateur = Depends(utilisateur_courant)) -> Utilisateur:
    if utilisateur.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Accès réservé à l'administrateur.")
    return utilisateur


def marchand_requis(utilisateur: Utilisateur = Depends(utilisateur_courant)) -> Utilisateur:
    if utilisateur.role != "MARCHAND":
        raise HTTPException(status_code=403, detail="Accès réservé aux marchands.")
    return utilisateur