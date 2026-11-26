"""Réinitialise les mots de passe des comptes de test et débloque les connexions.

Usage : python -m app.reset_mots_de_passe

Les mots de passe viennent de backend/.env (ADMIN_PASSWORD, MARCHAND_000101_PASSWORD,
MARCHAND_000102_PASSWORD), jamais du code. Utile quand le .env a changé après la
première initialisation : python -m app.init_db ne modifie pas les comptes existants.
"""

from sqlalchemy import delete, select

from app.config import variable_obligatoire
from app.database import SessionLocal
from app.init_db import hacher
from app.models import TentativeConnexion, Utilisateur


def reinitialiser() -> None:
    comptes = {
        "admin": variable_obligatoire("ADMIN_PASSWORD"),
        "000101": variable_obligatoire("MARCHAND_000101_PASSWORD"),
        "000102": variable_obligatoire("MARCHAND_000102_PASSWORD"),
    }
    with SessionLocal() as session:
        for identifiant, mot_de_passe in comptes.items():
            utilisateur = session.scalar(
                select(Utilisateur).where(Utilisateur.identifiant == identifiant)
            )
            if utilisateur is None:
                print(f"Compte introuvable : {identifiant} (lancez d'abord python -m app.init_db)")
                continue
            utilisateur.mot_de_passe_hache = hacher(mot_de_passe)
            print(f"Mot de passe réinitialisé : {identifiant}")
        # Débloque toutes les connexions (comptes existants ou identifiants essayés au hasard)
        supprimees = session.execute(delete(TentativeConnexion)).rowcount
        session.commit()
        print(f"Blocages levés ({supprimees} identifiant(s) remis à zéro).")


if __name__ == "__main__":
    reinitialiser()