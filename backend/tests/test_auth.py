from datetime import datetime, timedelta, timezone

import jwt
from sqlalchemy import select

from app.models import TentativeConnexion
from app.securite import decoder_jeton

SECRET_TEST = "secret-pour-les-tests-saamaya-32"


def connexion(client, identifiant="admin", mot_de_passe="admin-test"):
    return client.post(
        "/auth/connexion", json={"identifiant": identifiant, "mot_de_passe": mot_de_passe}
    )


def test_connexion_admin_ok(client):
    reponse = connexion(client)
    assert reponse.status_code == 200
    corps = reponse.json()
    assert corps["role"] == "ADMIN"
    assert corps["code_marchand"] is None
    assert corps["expire_dans_secondes"] == 900
    contenu = decoder_jeton(corps["jeton"])
    assert contenu["role"] == "ADMIN"
    assert contenu["exp"] - contenu["iat"] == 900


def test_connexion_marchand_ok(client):
    reponse = connexion(client, "000101", "alpha-test")
    assert reponse.status_code == 200
    assert reponse.json()["code_marchand"] == "000101"


def test_mauvais_mot_de_passe(client):
    reponse = connexion(client, mot_de_passe="faux")
    assert reponse.status_code == 401
    assert reponse.json()["detail"] == "Identifiant ou mot de passe incorrect."


def test_identifiant_inconnu_meme_message(client):
    reponse = connexion(client, "inexistant", "peu-importe")
    assert reponse.status_code == 401
    assert reponse.json()["detail"] == "Identifiant ou mot de passe incorrect."


def test_blocage_apres_cinq_echecs(client):
    for _ in range(4):
        assert connexion(client, mot_de_passe="faux").status_code == 401
    cinquieme = connexion(client, mot_de_passe="faux")
    assert cinquieme.status_code == 403
    assert "bloqué" in cinquieme.json()["detail"]
    # Même avec le bon mot de passe, le compte reste bloqué
    bloque = connexion(client)
    assert bloque.status_code == 403
    assert "Réessayez dans" in bloque.json()["detail"]


def test_succes_remet_le_compteur_a_zero(client):
    for _ in range(4):
        connexion(client, mot_de_passe="faux")
    assert connexion(client).status_code == 200
    # Le compteur est reparti de zéro : 4 nouveaux échecs ne bloquent pas
    for _ in range(4):
        assert connexion(client, mot_de_passe="faux").status_code == 401


def test_blocage_expire_puis_connexion_ok(client, db):
    for _ in range(5):
        connexion(client, mot_de_passe="faux")
    ligne = db.scalar(select(TentativeConnexion).where(TentativeConnexion.identifiant == "admin"))
    ligne.bloque_jusqua = datetime.now(timezone.utc) - timedelta(seconds=1)
    db.commit()
    assert connexion(client).status_code == 200


def jeton_de_test(expiration):
    return jwt.encode(
        {"sub": "1", "role": "ADMIN", "exp": expiration}, SECRET_TEST, algorithm="HS256"
    )


def test_jeton_expire_refuse(client):
    passe = datetime.now(timezone.utc) - timedelta(minutes=1)
    jeton = jeton_de_test(passe)
    reponse = client.get("/auth/moi", headers={"Authorization": f"Bearer {jeton}"})
    assert reponse.status_code == 401
    assert "expirée" in reponse.json()["detail"]


def test_jeton_invalide_refuse(client):
    reponse = client.get("/auth/moi", headers={"Authorization": "Bearer nimportequoi"})
    assert reponse.status_code == 401


def test_sans_jeton_refuse(client):
    reponse = client.get("/auth/moi")
    assert reponse.status_code == 401


def test_moi_avec_jeton_valide(client):
    jeton = connexion(client).json()["jeton"]
    reponse = client.get("/auth/moi", headers={"Authorization": f"Bearer {jeton}"})
    assert reponse.status_code == 200
    assert reponse.json() == {"identifiant": "admin", "role": "ADMIN", "code_marchand": None}


def test_cookie_httponly_pose_a_la_connexion(client):
    reponse = connexion(client)
    assert "jeton" in reponse.cookies
    assert "HttpOnly" in reponse.headers["set-cookie"]
    # Le cookie seul suffit : TestClient le renvoie automatiquement, sans en-tête Bearer
    assert client.get("/auth/moi").status_code == 200


def test_deconnexion_efface_le_cookie(client):
    connexion(client)
    reponse = client.post("/auth/deconnexion")
    assert reponse.status_code == 200
    assert client.get("/auth/moi").status_code == 401