# Racine pytest : garantit que le package app est importable depuis backend/
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

# Environnement de test : secret déterministe et base dédiée.
# DATABASE_URL est redirigée AVANT tout import de app (config la lit à l'import).
os.environ["JWT_SECRET"] = "secret-pour-les-tests-saamaya-32"
os.environ["ADMIN_PASSWORD"] = "admin-test"
os.environ["MARCHAND_000101_PASSWORD"] = "alpha-test"
os.environ["MARCHAND_000102_PASSWORD"] = "gamma-test"
# Valeur fixe : un COOKIE_SECURE=true dans backend/.env ne doit pas changer les résultats des tests
os.environ["COOKIE_SECURE"] = "false"
if os.environ.get("TEST_DATABASE_URL"):
    os.environ["DATABASE_URL"] = os.environ["TEST_DATABASE_URL"]

import pytest


@pytest.fixture(scope="session")
def _schema():
    if not os.environ.get("TEST_DATABASE_URL"):
        pytest.fail(
            "TEST_DATABASE_URL manquante : créez une base de test PostgreSQL "
            "et renseignez-la dans backend/.env (voir .env.example)."
        )
    from alembic import command
    from alembic.config import Config

    command.upgrade(Config(str(Path(__file__).parent / "alembic.ini")), "head")


@pytest.fixture()
def db(_schema):
    from sqlalchemy import text

    from app.database import SessionLocal, engine
    from app.init_db import initialiser

    # Repartir d'une base vide à chaque test (noms de tables fixes, pas de données utilisateur)
    with engine.begin() as connexion:
        connexion.execute(
            text(
                "TRUNCATE import_lignes, imports, paiements, tentatives_connexion, journal_audit, "
                "utilisateurs, marchands RESTART IDENTITY CASCADE"
            )
        )
    initialiser()
    with SessionLocal() as session:
        yield session


@pytest.fixture()
def client(db):
    from fastapi.testclient import TestClient

    from app.main import app

    return TestClient(app)