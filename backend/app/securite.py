"""Hachage bcrypt et jetons JWT (durée de vie : 15 minutes)."""

from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.config import JWT_SECRET

DUREE_JETON = timedelta(minutes=15)
ALGORITHME = "HS256"
# bcrypt ne lit que les 72 premiers octets d'un mot de passe (et la version 5 refuse plus long)
LONGUEUR_MAX_OCTETS_BCRYPT = 72

# Haché sans correspondance possible : sert à dépenser le même temps de calcul quand
# l'identifiant n'existe pas, pour qu'on ne puisse pas deviner les comptes au chronomètre.
HACHE_FACTICE = bcrypt.hashpw(b"mot-de-passe-factice", bcrypt.gensalt()).decode("utf-8")


def verifier_mot_de_passe(mot_de_passe: str, hache: str) -> bool:
    octets = mot_de_passe.encode("utf-8")
    if len(octets) > LONGUEUR_MAX_OCTETS_BCRYPT:
        # Aucun mot de passe enregistré n'est aussi long : refus, sans erreur 500
        return False
    try:
        return bcrypt.checkpw(octets, hache.encode("utf-8"))
    except ValueError:  # haché mal formé en base
        return False


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
    return jwt.encode(contenu, JWT_SECRET, algorithm=ALGORITHME)


def decoder_jeton(jeton: str) -> dict:
    return jwt.decode(jeton, JWT_SECRET, algorithms=[ALGORITHME])