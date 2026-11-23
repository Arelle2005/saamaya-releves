"""Initialisation des marchands et des comptes : python -m app.init_db.

Idempotent : relancer la commande ne cree pas de doublons et ne modifie
pas les mots de passe existants.
"""

import bcrypt
from sqlalchemy import select

from app.config import variable_obligatoire
from app.database import SessionLocal
from app.models import Marchand, Utilisateur

MARCHANDS = [
    ("000101", "Boutique Alpha"),
    ("000102", "Pharmacie Gamma"),
]


def hacher(mot_de_passe: str) -> str:
    return bcrypt.hashpw(mot_de_passe.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def initialiser() -> None:
    comptes = [
        ("admin", "ADMIN", None, variable_obligatoire("ADMIN_PASSWORD")),
        ("000101", "MARCHAND", "000101", variable_obligatoire("MARCHAND_000101_PASSWORD")),
        ("000102", "MARCHAND", "000102", variable_obligatoire("MARCHAND_000102_PASSWORD")),
    ]

    with SessionLocal() as session:
        for code, nom in MARCHANDS:
            if session.get(Marchand, code) is None:
                session.add(Marchand(code=code, nom=nom))
                print(f"Marchand créé : {code} — {nom}")
            else:
                print(f"Marchand déjà présent : {code}")

        for identifiant, role, code_marchand, mot_de_passe in comptes:
            existant = session.scalar(
                select(Utilisateur).where(Utilisateur.identifiant == identifiant)
            )
            if existant is None:
                session.add(
                    Utilisateur(
                        identifiant=identifiant,
                        role=role,
                        code_marchand=code_marchand,
                        mot_de_passe_hache=hacher(mot_de_passe),
                    )
                )
                print(f"Compte créé : {identifiant} ({role})")
            else:
                print(f"Compte déjà présent : {identifiant}")

        session.commit()
    print("Initialisation terminée.")


if __name__ == "__main__":
    initialiser()
