"""Erreurs en français avec le bon code HTTP, et documentation OpenAPI des routes marchand."""

from tests.test_releves import entetes, jeton

PERIODE = {"du": "2026-11-01", "au": "2026-11-30"}


def alpha(client):
    return entetes(jeton(client, "000101", "alpha-test"))


# --- Validation : 400 en français (et non 422 en anglais) --------------------------------


def test_date_invalide_donne_400_en_francais(client, db):
    reponse = client.get("/releve", params={"du": "abc", "au": "2026-11-30"}, headers=alpha(client))
    assert reponse.status_code == 400
    detail = reponse.json()["detail"]
    assert detail == "Le paramètre « du » doit être une date au format AAAA-MM-JJ (exemple : 2026-11-01)."


def test_parametre_manquant_donne_400_en_francais(client, db):
    reponse = client.get("/paiements", params={"du": "2026-11-01"}, headers=alpha(client))
    assert reponse.status_code == 400
    assert reponse.json()["detail"] == "Le paramètre « au » est obligatoire."


def test_plusieurs_erreurs_sont_toutes_signalees(client, db):
    reponse = client.get("/releve", headers=alpha(client))
    assert reponse.status_code == 400
    detail = reponse.json()["detail"]
    assert "« du »" in detail and "« au »" in detail


def test_page_zero_refusee(client, db):
    reponse = client.get("/paiements", params={**PERIODE, "page": 0}, headers=alpha(client))
    assert reponse.status_code == 400
    assert reponse.json()["detail"] == "Le paramètre « page » doit être supérieur ou égal à 1."


def test_page_non_numerique_refusee(client, db):
    reponse = client.get("/paiements", params={**PERIODE, "page": "deux"}, headers=alpha(client))
    assert reponse.status_code == 400
    assert reponse.json()["detail"] == "Le paramètre « page » doit être un nombre entier."


def test_connexion_champ_manquant(client):
    reponse = client.post("/auth/connexion", json={"identifiant": "000101"})
    assert reponse.status_code == 400
    assert reponse.json()["detail"] == "Le champ « mot_de_passe » est obligatoire."


def test_connexion_json_invalide(client):
    reponse = client.post(
        "/auth/connexion", content="{pas du json", headers={"Content-Type": "application/json"}
    )
    assert reponse.status_code == 400
    assert reponse.json()["detail"] == "Le corps de la requête n'est pas un JSON valide."


def test_import_sans_fichier(client):
    from tests.test_imports import jeton_admin

    reponse = client.post("/imports", headers={"Authorization": f"Bearer {jeton_admin(client)}"})
    assert reponse.status_code == 400
    assert reponse.json()["detail"] == "Le champ « fichier » est obligatoire."


# --- 404, 405, 401, 403 : codes justes, messages français --------------------------------


def test_route_inconnue_donne_404_en_francais(client):
    reponse = client.get("/n-existe-pas")
    assert reponse.status_code == 404
    assert reponse.json() == {"detail": "Ressource introuvable."}


def test_methode_non_autorisee_donne_405_en_francais(client):
    reponse = client.delete("/releve")
    assert reponse.status_code == 405
    assert reponse.json() == {"detail": "Méthode non autorisée pour cette adresse."}


def test_les_messages_francais_existants_sont_conserves(client, db):
    sans_jeton = client.get("/releve", params=PERIODE)
    assert sans_jeton.status_code == 401
    assert sans_jeton.json() == {"detail": "Authentification requise."}

    client.cookies.clear()
    refus = client.get(
        "/releve", params={**PERIODE, "code_marchand": "000102"}, headers=alpha(client)
    )
    assert refus.status_code == 403
    assert "autre marchand" in refus.json()["detail"]


def test_aucune_erreur_ne_renvoie_422(client, db):
    for params in ({}, {"du": "x", "au": "y"}, {"du": "2026-11-01"}):
        reponse = client.get("/releve", params=params, headers=alpha(client))
        assert reponse.status_code == 400


# --- Documentation OpenAPI ---------------------------------------------------------------


def test_routes_marchand_documentees(client):
    spec = client.get("/openapi.json").json()
    for chemin in ("/paiements", "/releve", "/releve/export"):
        operation = spec["paths"][chemin]["get"]
        assert operation["summary"], chemin
        assert operation["description"], chemin
        for code in ("400", "401", "403"):
            assert code in operation["responses"], (chemin, code)
            assert operation["responses"][code]["description"], (chemin, code)
    assert "text/csv" in spec["paths"]["/releve/export"]["get"]["responses"]["200"]["content"]


def test_parametres_de_periode_decrits(client):
    spec = client.get("/openapi.json").json()
    parametres = {p["name"]: p for p in spec["paths"]["/releve"]["get"]["parameters"]}
    assert "inclus" in parametres["du"]["description"]
    assert "inclus" in parametres["au"]["description"]
    assert parametres["du"]["required"] is True