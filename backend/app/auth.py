"""Connexion : JWT de 15 minutes, blocage 15 minutes après 5 échecs."""

import math
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import get_session, utilisateur_courant
from app.models import Utilisateur
from app.securite import creer_jeton, verifier_mot_de_passe

router = APIRouter(prefix="/auth", tags=["authentification"])

MAX_TENTATIVES = 5
DUREE_BLOCAGE = timedelta(minutes=15)


class ConnexionDemande(BaseModel):
    identifiant: str
    mot_de_passe: str


class ConnexionReponse(BaseModel):
    jeton: str
    identifiant: str
    role: str
    code_marchand: str | None
    expire_dans_secondes: int


class ProfilReponse(BaseModel):
    identifiant: str
    role: str
    code_marchand: str | None


@router.post("/connexion", response_model=ConnexionReponse)
def connexion(demande: ConnexionDemande, session: Session = Depends(get_session)):
    utilisateur = session.scalar(
        select(Utilisateur).where(Utilisateur.identifiant == demande.identifiant)
    )
    # Même message pour identifiant inconnu et mot de passe faux :
    # on ne révèle pas quels comptes existent
    if utilisateur is None:
        raise HTTPException(status_code=401, detail="Identifiant ou mot de passe incorrect.")

    maintenant = datetime.now(timezone.utc)
    if utilisateur.bloque_jusqua is not None and utilisateur.bloque_jusqua > maintenant:
        minutes = math.ceil((utilisateur.bloque_jusqua - maintenant).total_seconds() / 60)
        raise HTTPException(
            status_code=403,
            detail=f"Compte bloqué suite à trop de tentatives. Réessayez dans {minutes} minute(s).",
        )

    if not verifier_mot_de_passe(demande.mot_de_passe, utilisateur.mot_de_passe_hache):
        # Un blocage expiré ne doit pas compter pour le prochain blocage
        if utilisateur.bloque_jusqua is not None:
            utilisateur.tentatives_echouees = 0
            utilisateur.bloque_jusqua = None
        utilisateur.tentatives_echouees += 1
        if utilisateur.tentatives_echouees >= MAX_TENTATIVES:
            utilisateur.bloque_jusqua = maintenant + DUREE_BLOCAGE
            session.commit()
            raise HTTPException(
                status_code=403,
                detail="Compte bloqué pendant 15 minutes après 5 échecs de connexion.",
            )
        session.commit()
        raise HTTPException(status_code=401, detail="Identifiant ou mot de passe incorrect.")

    utilisateur.tentatives_echouees = 0
    utilisateur.bloque_jusqua = None
    session.commit()
    return ConnexionReponse(
        jeton=creer_jeton(utilisateur),
        identifiant=utilisateur.identifiant,
        role=utilisateur.role,
        code_marchand=utilisateur.code_marchand,
        expire_dans_secondes=15 * 60,
    )


@router.get("/moi", response_model=ProfilReponse)
def moi(utilisateur: Utilisateur = Depends(utilisateur_courant)):
    return ProfilReponse(
        identifiant=utilisateur.identifiant,
        role=utilisateur.role,
        code_marchand=utilisateur.code_marchand,
    )