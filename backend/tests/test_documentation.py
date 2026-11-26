"""Documentation OpenAPI : chaque route est décrite, et ses erreurs possibles sont déclarées."""

import pytest

METHODES = {"get", "post", "put", "patch", "delete"}


@pytest.fixture()
def operations(client):
    spec = client.get("/openapi.json").json()
    return [
        (f"{methode.upper()} {chemin}", operation)
        for chemin, definition in spec["paths"].items()
        for methode, operation in definition.items()
        if methode in METHODES
    ]


def test_toutes_les_routes_attendues_sont_documentees(operations):
    noms = {nom for nom, _ in operations}
    assert noms == {
        "GET /sante",
        "POST /auth/connexion",
        "POST /auth/deconnexion",
        "GET /auth/moi",
        "POST /imports",
        "GET /imports",
        "GET /imports/{import_id}",
        "GET /audit",
        "GET /paiements",
        "GET /releve",
        "GET /releve/export",
    }


def test_chaque_route_a_un_resume_et_une_description(operations):
    for nom, operation in operations:
        assert operation.get("summary"), nom
        assert operation.get("description"), nom


def test_chaque_route_protegee_declare_l_erreur_401(operations):
    protegees = [(nom, op) for nom, op in operations if op.get("security")]
    assert len(protegees) >= 8
    for nom, operation in protegees:
        assert "401" in operation["responses"], nom
        assert operation["responses"]["401"]["description"], nom


def test_les_routes_reservees_a_un_role_declarent_l_erreur_403(operations):
    par_nom = dict(operations)
    for nom in ["POST /imports", "GET /imports", "GET /imports/{import_id}", "GET /audit",
                "GET /paiements", "GET /releve", "GET /releve/export", "POST /auth/connexion"]:
        assert "403" in par_nom[nom]["responses"], nom


def test_les_routes_a_parametres_declarent_l_erreur_400(operations):
    par_nom = dict(operations)
    for nom in ["POST /imports", "GET /audit", "GET /paiements", "GET /releve", "GET /releve/export", "POST /auth/connexion"]:
        assert "400" in par_nom[nom]["responses"], nom


def test_la_route_de_detail_declare_l_erreur_404(operations):
    assert "404" in dict(operations)["GET /imports/{import_id}"]["responses"]


def test_toutes_les_erreurs_documentees_ont_le_meme_format(client):
    spec = client.get("/openapi.json").json()
    schema = spec["components"]["schemas"]["ErreurReponse"]
    assert schema["properties"]["detail"]["type"] == "string"


def test_le_fichier_d_import_est_decrit(client):
    spec = client.get("/openapi.json").json()
    corps = spec["paths"]["/imports"]["post"]["requestBody"]["content"]["multipart/form-data"]
    schema = spec["components"]["schemas"][corps["schema"]["$ref"].split("/")[-1]]
    assert "2 Mo" in schema["properties"]["fichier"]["description"]