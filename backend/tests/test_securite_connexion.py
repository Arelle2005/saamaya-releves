"""Sécurité de la connexion : comptes inconnus, rafales, chronométrage, clé JWT, cookie."""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.config import valider_cle_jwt
from app.models import TentativeConnexion
from app.securite import HACHE_FACTICE, verifier_mot_de_passe
from app.tentatives import MAX_TENTATIVES, compter_tentative


def connexion(client, identifiant="admin", mot_de_passe="admin-test"):
    return client.post(
        "/auth/connexion", json={"identifiant": identifiant, "mot_de_passe": mot_de_passe}
    )


@pytest.fixture()
def verifications(monkeypatch):
    """Espionne verifier_mot_de_passe : liste des (mot de passe, haché) réellement vérifiés."""
    import threading

    import app.auth as module_auth

    appels = []
    verrou = threading.Lock()
    reel = module_auth.verifier_mot_de_passe

    def espion(mot_de_passe, hache):
        with verrou:
            appels.append((mot_de_passe, hache))
        return reel(mot_de_passe, hache)

    monkeypatch.setattr(module_auth, "verifier_mot_de_passe", espion)
    return appels


# ---------------------------------------------------------------------------
# Identifiants inconnus : même comportement que les comptes réels
# ---------------------------------------------------------------------------


def test_identifiant_inconnu_se_bloque_comme_un_compte_reel(client):
    for _ in range(4):
        assert connexion(client, "fantome", "x").status_code == 401
    cinquieme = connexion(client, "fantome", "x")
    assert cinquieme.status_code == 403
    assert "bloqué" in cinquieme.json()["detail"]
    sixieme = connexion(client, "fantome", "x")
    assert sixieme.status_code == 403
    assert "Réessayez dans" in sixieme.json()["detail"]


def test_comptes_connus_et_inconnus_donnent_exactement_les_memes_reponses(client):
    def suite(identifiant):
        return [
            (r.status_code, r.json()["detail"])
            for r in (connexion(client, identifiant, "faux") for _ in range(7))
        ]

    assert suite("admin") == suite("fantome")


def test_blocage_d_un_identifiant_n_affecte_pas_les_autres(client):
    for _ in range(5):
        connexion(client, "admin", "faux")
    assert connexion(client, "admin").status_code == 403
    assert connexion(client, "000101", "alpha-test").status_code == 200


def test_reponse_de_blocage_indique_le_delai_d_attente(client):
    for _ in range(5):
        reponse = connexion(client, mot_de_passe="faux")
    assert 1 <= int(reponse.headers["retry-after"]) <= 900
    bloque = connexion(client)
    assert 1 <= int(bloque.headers["retry-after"]) <= 900


# ---------------------------------------------------------------------------
# Blocage strict : pas de vérification de mot de passe une fois bloqué
# ---------------------------------------------------------------------------


def test_aucun_mot_de_passe_verifie_pendant_le_blocage(client, verifications):
    for _ in range(MAX_TENTATIVES):
        connexion(client, mot_de_passe="faux")
    assert len(verifications) == MAX_TENTATIVES
    for _ in range(3):
        assert connexion(client).status_code == 403  # même avec le BON mot de passe
    assert len(verifications) == MAX_TENTATIVES  # aucune vérification de plus


def test_tentatives_pendant_le_blocage_ne_le_prolongent_pas(client, db):
    for _ in range(MAX_TENTATIVES):
        connexion(client, mot_de_passe="faux")
    avant = db.scalar(select(TentativeConnexion.bloque_jusqua).where(TentativeConnexion.identifiant == "admin"))
    for _ in range(3):
        connexion(client, mot_de_passe="faux")
    db.expire_all()
    apres = db.scalar(select(TentativeConnexion.bloque_jusqua).where(TentativeConnexion.identifiant == "admin"))
    assert apres == avant


def test_rafale_de_requetes_simultanees_ne_verifie_que_cinq_mots_de_passe(client, verifications, db):
    jetons_http = TestClient(client.app)

    def essai(_):
        return connexion(jetons_http, "admin", "faux").status_code

    with ThreadPoolExecutor(max_workers=12) as pool:
        statuts = list(pool.map(essai, range(12)))

    # Même avec 12 requêtes en parallèle : exactement 5 vérifications, les autres refusées
    assert len(verifications) == MAX_TENTATIVES
    assert statuts.count(401) == MAX_TENTATIVES - 1
    assert statuts.count(403) == 12 - (MAX_TENTATIVES - 1)
    assert connexion(client).status_code == 403  # et le compte est bien bloqué ensuite


def test_succes_efface_la_serie_d_echecs(client, db):
    for _ in range(3):
        connexion(client, mot_de_passe="faux")
    assert db.scalar(select(func.count()).select_from(TentativeConnexion)) == 1
    assert connexion(client).status_code == 200
    db.expire_all()
    assert db.scalar(select(func.count()).select_from(TentativeConnexion)) == 0


def test_blocage_expire_le_compteur_repart_de_un(client, db):
    for _ in range(MAX_TENTATIVES):
        connexion(client, mot_de_passe="faux")
    ligne = db.scalar(select(TentativeConnexion).where(TentativeConnexion.identifiant == "admin"))
    ligne.bloque_jusqua = datetime.now(timezone.utc) - timedelta(seconds=1)
    db.commit()
    # Un mauvais mot de passe après le blocage : 401 (tentative n°1), pas un nouveau blocage
    assert connexion(client, mot_de_passe="faux").status_code == 401
    db.expire_all()
    assert db.scalar(select(TentativeConnexion.echecs).where(TentativeConnexion.identifiant == "admin")) == 1


def test_compteur_inactif_depuis_plus_de_24h_est_oublie(client, db):
    ancien = datetime.now(timezone.utc) - timedelta(days=2)
    db.add(TentativeConnexion(identifiant="admin", echecs=4, bloque_jusqua=None, derniere_tentative=ancien))
    db.commit()
    # Sans l'oubli, cet échec serait le 5e et bloquerait le compte
    assert connexion(client, mot_de_passe="faux").status_code == 401


def test_les_vieilles_lignes_sont_purgees_mais_pas_les_blocages_en_cours(client, db):
    maintenant = datetime.now(timezone.utc)
    ancien = maintenant - timedelta(days=3)
    db.add_all([
        TentativeConnexion(identifiant="vieux", echecs=2, bloque_jusqua=None, derniere_tentative=ancien),
        TentativeConnexion(
            identifiant="bloque-encore", echecs=6,
            bloque_jusqua=maintenant + timedelta(minutes=5), derniere_tentative=ancien,
        ),
    ])
    db.commit()
    connexion(client, "autre", "x")  # n'importe quel échec déclenche la purge
    db.expire_all()
    restants = set(db.scalars(select(TentativeConnexion.identifiant)))
    assert "vieux" not in restants
    assert "bloque-encore" in restants
    assert "autre" in restants


def test_numero_de_tentative_renvoye_par_compter_tentative(db):
    etats = [compter_tentative(db, "x") for _ in range(7)]
    assert [e.echecs for e in etats] == [1, 2, 3, 4, 5, 6, 7]
    assert [e.verification_autorisee for e in etats] == [True] * 5 + [False] * 2
    assert etats[3].bloque_jusqua is None
    assert etats[4].bloque_jusqua is not None  # bloqué dès la 5e tentative
    assert etats[6].bloque_jusqua == etats[4].bloque_jusqua  # jamais prolongé


# ---------------------------------------------------------------------------
# Chronométrage : un compte inconnu coûte le même calcul qu'un compte réel
# ---------------------------------------------------------------------------


def test_identifiant_inconnu_verifie_quand_meme_un_hache_factice(client, verifications):
    connexion(client, "fantome", "x")
    assert len(verifications) == 1
    assert verifications[0][1] == HACHE_FACTICE


def test_compte_reel_verifie_son_propre_hache(client, verifications):
    connexion(client, "admin", "faux")
    assert len(verifications) == 1
    assert verifications[0][1] != HACHE_FACTICE


# ---------------------------------------------------------------------------
# Mots de passe et identifiants hors normes : jamais d'erreur 500
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("longueur", [73, 150, 200])
def test_mot_de_passe_trop_long_pour_bcrypt_refuse_sans_erreur(client, longueur):
    reponse = connexion(client, "admin", "a" * longueur)
    assert reponse.status_code == 401


def test_mot_de_passe_de_plus_de_72_octets_en_caracteres_accentues(client):
    # 40 « é » = 80 octets en UTF-8, mais seulement 40 caractères
    assert connexion(client, "admin", "é" * 40).status_code == 401


def test_verifier_mot_de_passe_gere_un_hache_corrompu():
    assert verifier_mot_de_passe("x", "pas-un-hache-bcrypt") is False


def test_mot_de_passe_de_plus_de_200_caracteres_donne_400(client):
    reponse = connexion(client, "admin", "a" * 201)
    assert reponse.status_code == 400
    assert reponse.json()["detail"] == "Le champ « mot_de_passe » doit contenir au plus 200 caractères."


def test_identifiant_de_plus_de_50_caracteres_donne_400(client):
    reponse = connexion(client, "i" * 51, "x")
    assert reponse.status_code == 400
    assert reponse.json()["detail"] == "Le champ « identifiant » doit contenir au plus 50 caractères."


@pytest.mark.parametrize("champ", ["identifiant", "mot_de_passe"])
def test_champ_vide_donne_400(client, champ):
    corps = {"identifiant": "admin", "mot_de_passe": "x", champ: ""}
    reponse = client.post("/auth/connexion", json=corps)
    assert reponse.status_code == 400
    assert reponse.json()["detail"] == f"Le champ « {champ} » ne peut pas être vide."


def test_identifiant_avec_caracteres_speciaux_et_injection_sql(client, db):
    for identifiant in ["admin' OR '1'='1", "'; DROP TABLE utilisateurs; --", "é\u00a0 ", "\n"]:
        assert connexion(client, identifiant, "x").status_code == 401
    assert connexion(client).status_code == 200  # la base est intacte


# ---------------------------------------------------------------------------
# Clé JWT et cookie
# ---------------------------------------------------------------------------


def test_cle_jwt_trop_courte_refusee():
    with pytest.raises(RuntimeError, match="trop courte"):
        valider_cle_jwt("a" * 31)


def test_cle_jwt_de_32_caracteres_acceptee():
    assert valider_cle_jwt("a" * 32) == "a" * 32


def test_message_de_cle_trop_courte_explique_comment_en_generer_une():
    with pytest.raises(RuntimeError, match="secrets.token_hex"):
        valider_cle_jwt("court")


def test_cookie_non_secure_par_defaut_en_developpement(client):
    assert "secure" not in connexion(client).headers["set-cookie"].lower().split("; ")


def test_cookie_secure_quand_la_variable_est_activee(client, monkeypatch):
    import app.auth as module_auth

    monkeypatch.setattr(module_auth, "COOKIE_SECURE", True)
    entete = connexion(client).headers["set-cookie"]
    assert "Secure" in entete
    assert "HttpOnly" in entete
    assert "SameSite=lax" in entete
    assert "Max-Age=900" in entete


def test_le_jeton_reste_dans_le_corps_comme_l_exige_le_sujet(client):
    assert connexion(client).json()["jeton"]


# ---------------------------------------------------------------------------
# Documentation OpenAPI des routes d'authentification
# ---------------------------------------------------------------------------


def test_routes_d_authentification_documentees(client):
    spec = client.get("/openapi.json").json()
    for chemin, methode in [("/auth/connexion", "post"), ("/auth/deconnexion", "post"), ("/auth/moi", "get")]:
        operation = spec["paths"][chemin][methode]
        assert operation["summary"], chemin
        assert operation["description"], chemin
    assert {"400", "401", "403"} <= set(spec["paths"]["/auth/connexion"]["post"]["responses"])
    assert "401" in spec["paths"]["/auth/moi"]["get"]["responses"]