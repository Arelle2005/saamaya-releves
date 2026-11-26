import os
from pathlib import Path

from dotenv import load_dotenv

# Charge backend/.env quel que soit le dossier depuis lequel on lance la commande
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

# Une clé de signature courte se devine par force brute : 32 caractères minimum
TAILLE_MIN_CLE_JWT = 32


def variable_obligatoire(nom: str) -> str:
    valeur = os.environ.get(nom)
    if not valeur:
        raise RuntimeError(
            f"Variable d'environnement manquante : {nom}. "
            "Copiez backend/.env.example vers backend/.env et renseignez-la."
        )
    return valeur


def valider_cle_jwt(cle: str) -> str:
    if len(cle) < TAILLE_MIN_CLE_JWT:
        raise RuntimeError(
            f"JWT_SECRET trop courte ({len(cle)} caractères) : {TAILLE_MIN_CLE_JWT} minimum. "
            'Générez-en une avec : python -c "import secrets; print(secrets.token_hex(32))"'
        )
    return cle


def variable_booleenne(nom: str, defaut: bool = False) -> bool:
    valeur = os.environ.get(nom)
    if valeur is None:
        return defaut
    return valeur.strip().lower() in {"1", "true", "vrai", "oui", "yes"}


DATABASE_URL = variable_obligatoire("DATABASE_URL")
# Vérifiée au démarrage : le serveur refuse de se lancer avec une clé trop courte
JWT_SECRET = valider_cle_jwt(variable_obligatoire("JWT_SECRET"))
# Cookie du jeton : true en production (HTTPS), false en développement local (HTTP)
COOKIE_SECURE = variable_booleenne("COOKIE_SECURE")