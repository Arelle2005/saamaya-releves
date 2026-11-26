"""Connexion : JWT de 15 minutes, blocage 15 minutes après 5 échecs."""

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit import BLOQUE, CONNEXION, ECHEC, SUCCES, adresse_ip, enregistrer
from app.config import COOKIE_SECURE
from app.deps import get_session, utilisateur_courant
from app.erreurs import ErreurReponse
from app.models import Utilisateur
from app.securite import DUREE_JETON, HACHE_FACTICE, creer_jeton, verifier_mot_de_passe
from app.tentatives import (
    DUREE_BLOCAGE,
    MAX_TENTATIVES,
    compter_tentative,
    effacer,
    minutes_restantes,
    secondes_restantes,
)

router = APIRouter(prefix="/auth", tags=["authentification"])

DUREE_JETON_SECONDES = int(DUREE_JETON.total_seconds())
MESSAGE_IDENTIFIANTS_INCORRECTS = "Identifiant ou mot de passe incorrect."


class ConnexionDemande(BaseModel):
    # Longueurs bornées : 50 = taille de la colonne en base ; 200 évite les envois géants
    identifiant: str = Field(
        min_length=1, max_length=50, description="Identifiant : « admin » ou code marchand.",
        examples=["000101"],
    )
    mot_de_passe: str = Field(min_length=1, max_length=200, description="Mot de passe du compte.")


class ConnexionReponse(BaseModel):
    jeton: str = Field(description="JWT valable 15 minutes. Posé aussi dans un cookie HttpOnly.")
    identifiant: str
    role: str = Field(description="ADMIN ou MARCHAND.")
    code_marchand: str | None = Field(description="Code du marchand ; null pour un ADMIN.")
    expire_dans_secondes: int = Field(description="Durée de validité du jeton : 900 secondes.")


class ProfilReponse(BaseModel):
    identifiant: str
    role: str
    code_marchand: str | None


def _erreur_blocage(detail: str, secondes: int) -> HTTPException:
    return HTTPException(status_code=403, detail=detail, headers={"Retry-After": str(secondes)})


@router.post(
    "/connexion",
    response_model=ConnexionReponse,
    summary="Se connecter",
    description=(
        "Vérifie l'identifiant et le mot de passe, puis renvoie un jeton JWT valable 15 minutes. "
        "Le jeton est aussi posé dans un cookie HttpOnly. Après 5 échecs consécutifs sur un même "
        "identifiant (existant ou non), les connexions sont bloquées 15 minutes : réponse 403 avec "
        "l'en-tête `Retry-After`. Un succès remet le compteur à zéro."
    ),
    responses={
        400: {"model": ErreurReponse, "description": "Champ absent, vide ou trop long."},
        401: {"model": ErreurReponse, "description": "Identifiant ou mot de passe incorrect."},
        403: {"model": ErreurReponse, "description": "Trop d'échecs : connexions bloquées 15 minutes."},
    },
)
def connexion(
    demande: ConnexionDemande,
    request: Request,
    response: Response,
    session: Session = Depends(get_session),
):
    ip = adresse_ip(request)
    # 1. On compte la tentative AVANT toute vérification (atomique, voir tentatives.py).
    etat = compter_tentative(session, demande.identifiant)

    # 2. Série déjà bloquée : refus immédiat, sans vérifier le mot de passe.
    if not etat.verification_autorisee:
        minutes = minutes_restantes(etat.bloque_jusqua)
        enregistrer(
            session, CONNEXION, demande.identifiant, BLOQUE, ip,
            f"tentative n°{etat.echecs} pendant le blocage (encore {minutes} minute(s))",
        )
        raise _erreur_blocage(
            f"Compte bloqué suite à trop de tentatives. Réessayez dans {minutes} minute(s).",
            secondes_restantes(etat.bloque_jusqua),
        )

    utilisateur = session.scalar(
        select(Utilisateur).where(Utilisateur.identifiant == demande.identifiant)
    )
    # 3. Identifiant inconnu : on vérifie quand même contre un haché factice, pour dépenser le
    #    même temps de calcul qu'un vrai compte (sinon le chronomètre révèle les comptes).
    hache = utilisateur.mot_de_passe_hache if utilisateur is not None else HACHE_FACTICE
    mot_de_passe_valide = verifier_mot_de_passe(demande.mot_de_passe, hache)

    if utilisateur is None or not mot_de_passe_valide:
        # Même réponse pour identifiant inconnu et mot de passe faux.
        # Le journal (réservé à l'administrateur) garde la vraie cause, mais jamais le mot de passe.
        cause = "identifiant inconnu" if utilisateur is None else "mot de passe incorrect"
        if etat.derniere_autorisee:
            minutes = int(DUREE_BLOCAGE.total_seconds() // 60)
            enregistrer(
                session, CONNEXION, demande.identifiant, ECHEC, ip,
                f"{cause} ; blocage de {minutes} minutes déclenché après {MAX_TENTATIVES} échecs",
            )
            raise _erreur_blocage(
                f"Compte bloqué pendant {minutes} minutes après {MAX_TENTATIVES} échecs de connexion.",
                secondes_restantes(etat.bloque_jusqua),
            )
        enregistrer(
            session, CONNEXION, demande.identifiant, ECHEC, ip,
            f"{cause} (échec {etat.echecs} sur {MAX_TENTATIVES})",
        )
        raise HTTPException(status_code=401, detail=MESSAGE_IDENTIFIANTS_INCORRECTS)

    effacer(session, demande.identifiant)
    enregistrer(session, CONNEXION, utilisateur.identifiant, SUCCES, ip)
    jeton = creer_jeton(utilisateur)
    # httpOnly : illisible en JavaScript. secure : variable COOKIE_SECURE (true en HTTPS).
    response.set_cookie(
        "jeton", jeton, max_age=DUREE_JETON_SECONDES, httponly=True, samesite="lax",
        secure=COOKIE_SECURE, path="/",
    )
    return ConnexionReponse(
        jeton=jeton,
        identifiant=utilisateur.identifiant,
        role=utilisateur.role,
        code_marchand=utilisateur.code_marchand,
        expire_dans_secondes=DUREE_JETON_SECONDES,
    )


@router.post(
    "/deconnexion",
    summary="Se déconnecter",
    description="Efface le cookie du jeton. Aucune authentification requise.",
)
def deconnexion(response: Response):
    response.delete_cookie("jeton", path="/")
    return {"statut": "deconnecte"}


@router.get(
    "/moi",
    response_model=ProfilReponse,
    summary="Mon profil",
    description="Identité de l'utilisateur authentifié (jeton Bearer ou cookie).",
    responses={401: {"model": ErreurReponse, "description": "Jeton absent, invalide ou expiré."}},
)
def moi(utilisateur: Utilisateur = Depends(utilisateur_courant)):
    return ProfilReponse(
        identifiant=utilisateur.identifiant,
        role=utilisateur.role,
        code_marchand=utilisateur.code_marchand,
    )