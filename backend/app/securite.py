"""Hachage bcrypt et jetons JWT (durée de vie : 15 minutes)."""

from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.config import variable_obligatoire

DUREE_JETON = timedelta(minutes=15)
ALGORITHME = "HS256"


def verifier_mot_de_passe(mot_de_passe: str, hache: str) -> bool:
    return bcrypt.checkpw(mot_de_passe.encode("utf-8"), hache.encode("utf-8"))


def creer_jeton(utilisateur) -> str:
    maintenant = datetime.now(timezone.utc)
    contenu = {
        "sub": str(utilisateur.id),
        "identifiant": utilisateur.identifiant,
        "role": utilisateur.role,
        # Le code marchand voyagera dans le jeton : jamais dans un paramètre HTTP
        "code_marchand": utilisateur.code_marchand,
        "iat": maintenant,
        "exp": maintenant + DUREE_JETON,
    }
    return jwt.encode(contenu, variable_obligatoire("JWT_SECRET"), algorithm=ALGORITHME)


def decoder_jeton(jeton: str) -> dict:
    return jwt.decode(jeton, variable_obligatoire("JWT_SECRET"), algorithms=[ALGORITHME])