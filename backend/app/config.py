import os
from pathlib import Path

from dotenv import load_dotenv

# Charge backend/.env quel que soit le dossier depuis lequel on lance la commande
load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def variable_obligatoire(nom: str) -> str:
    valeur = os.environ.get(nom)
    if not valeur:
        raise RuntimeError(
            f"Variable d'environnement manquante : {nom}. "
            "Copiez backend/.env.example vers backend/.env et renseignez-la."
        )
    return valeur


DATABASE_URL = variable_obligatoire("DATABASE_URL")
