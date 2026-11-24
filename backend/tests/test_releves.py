import csv
import io
from datetime import datetime
from zoneinfo import ZoneInfo

from app.frais import calculer_frais_commission_net
from app.masquage import masquer_telephone
from app.models import Paiement

DOUALA = ZoneInfo("Africa/Douala")
PERIODE = {"du": "2026-11-01", "au": "2026-11-30"}


def jeton(client, identifiant, mot_de_passe):
    reponse = client.post(
        "/auth/connexion", json={"identifiant": identifiant, "mot_de_passe": mot_de_passe}
    )
    return reponse.json()["jeton"]


def entetes(jeton_):
    return {"Authorization": f"Bearer {jeton_}"}


def ajouter(db, reference, code, telephone, montant, statut, jour=22, heure=10):
    frais, commission, net = calculer_frais_commission_net(montant, statut)
    db.add(
        Paiement(
            reference=reference,
            date_heure=datetime(2026, 11, jour, heure, 0, tzinfo=DOUALA),
            code_marchand=code,
            telephone_payeur=telephone,
            montant=montant,
            frais_reseau=frais,
            commission=commission,
            net=net,
            statut=statut,
        )
    )
    db.commit()


def seed(db):
    ajouter(db, "GIM-A1", "000101", "699000001", 10_000, "CONFIRME")
    ajouter(db, "GIM-A2", "000101", "699000002", 250_000, "CONFIRME")
    ajouter(db, "GIM-A3", "000101", "699000003", 500, "EN_ATTENTE")
    ajouter(db, "GIM-B1", "000102", "699000004", 300_000, "CONFIRME")


def test_masquage_utilitaire():
    assert masquer_telephone("699000001") == "6XX XX X0 01"
    assert masquer_telephone("677123456") == "6XX XX X4 56"


def test_isolation_marchands(client, db):
    seed(db)
    alpha = jeton(client, "000101", "alpha-test")
    gamma = jeton(client, "000102", "gamma-test")

    corps = client.get("/paiements", params=PERIODE, headers=entetes(alpha)).json()
    assert corps["total"] == 3
    assert all(p["reference"].startswith("GIM-A") for p in corps["paiements"])

    corps_gamma = client.get("/paiements", params=PERIODE, headers=entetes(gamma)).json()
    assert corps_gamma["total"] == 1
    assert corps_gamma["paiements"][0]["reference"] == "GIM-B1"


def test_code_marchand_en_parametre_refuse(client, db):
    seed(db)
    alpha = jeton(client, "000101", "alpha-test")
    params = {**PERIODE, "code_marchand": "000102"}
    for chemin in ("/paiements", "/releve", "/releve/export"):
        reponse = client.get(chemin, params=params, headers=entetes(alpha))
        assert reponse.status_code == 403
        assert "autre marchand" in reponse.json()["detail"]


def test_telephone_jamais_en_clair(client, db):
    seed(db)
    alpha = jeton(client, "000101", "alpha-test")
    reponse = client.get("/paiements", params=PERIODE, headers=entetes(alpha))
    assert "699000001" not in reponse.text
    assert "6XX XX X0 01" in reponse.text
    export = client.get("/releve/export", params=PERIODE, headers=entetes(alpha))
    assert "699000001" not in export.text
    assert "6XX XX X0 01" in export.text


def test_totaux_confirmes_uniquement(client, db):
    seed(db)
    alpha = jeton(client, "000101", "alpha-test")
    corps = client.get("/releve", params=PERIODE, headers=entetes(alpha)).json()
    assert corps == {
        "du": "2026-11-01", "au": "2026-11-30",
        "nb_confirmes": 2, "brut": 260_000, "frais": 1_100,
        "commission": 100, "net": 258_800,
    }
    # Le EN_ATTENTE a bien ses valeurs à null dans la liste
    paiements = client.get("/paiements", params=PERIODE, headers=entetes(alpha)).json()["paiements"]
    attente = next(p for p in paiements if p["statut"] == "EN_ATTENTE")
    assert attente["frais_reseau"] is None
    assert attente["commission"] is None
    assert attente["net"] is None


def test_periode_trop_longue(client, db):
    seed(db)
    alpha = jeton(client, "000101", "alpha-test")
    reponse = client.get(
        "/paiements", params={"du": "2026-01-01", "au": "2026-06-01"}, headers=entetes(alpha)
    )
    assert reponse.status_code == 400
    assert "90 jours" in reponse.json()["detail"]


def test_du_apres_au(client, db):
    seed(db)
    alpha = jeton(client, "000101", "alpha-test")
    reponse = client.get(
        "/releve", params={"du": "2026-11-30", "au": "2026-11-01"}, headers=entetes(alpha)
    )
    assert reponse.status_code == 400
    assert "antérieure" in reponse.json()["detail"]


def test_periode_90_jours_acceptee(client, db):
    seed(db)
    alpha = jeton(client, "000101", "alpha-test")
    reponse = client.get(
        "/paiements", params={"du": "2026-01-01", "au": "2026-04-01"}, headers=entetes(alpha)
    )
    assert reponse.status_code == 200


def test_bornes_journee_incluses(client, db):
    seed(db)
    ajouter(db, "GIM-MIN", "000101", "699000005", 1_000, "CONFIRME", heure=0)
    db.add(
        Paiement(
            reference="GIM-MAX",
            date_heure=datetime(2026, 11, 22, 23, 59, 59, tzinfo=DOUALA),
            code_marchand="000101", telephone_payeur="699000006",
            montant=1_000, frais_reseau=10, commission=50, net=940, statut="CONFIRME",
        )
    )
    db.commit()
    alpha = jeton(client, "000101", "alpha-test")
    corps = client.get(
        "/paiements", params={"du": "2026-11-22", "au": "2026-11-22"}, headers=entetes(alpha)
    ).json()
    references = {p["reference"] for p in corps["paiements"]}
    assert {"GIM-MIN", "GIM-MAX"} <= references


def test_pagination(client, db):
    seed(db)
    for i in range(25):
        ajouter(db, "GIM-PAG%d" % i, "000101", "699000007", 1_000, "CONFIRME", heure=11)
    alpha = jeton(client, "000101", "alpha-test")
    page1 = client.get("/paiements", params={**PERIODE, "page": 1}, headers=entetes(alpha)).json()
    assert page1["total"] == 28
    assert page1["pages"] == 2
    assert len(page1["paiements"]) == 20
    page2 = client.get("/paiements", params={**PERIODE, "page": 2}, headers=entetes(alpha)).json()
    assert len(page2["paiements"]) == 8
    page3 = client.get("/paiements", params={**PERIODE, "page": 3}, headers=entetes(alpha)).json()
    assert page3["paiements"] == []


def test_filtre_statut(client, db):
    seed(db)
    alpha = jeton(client, "000101", "alpha-test")
    corps = client.get(
        "/paiements", params={**PERIODE, "statut": "EN_ATTENTE"}, headers=entetes(alpha)
    ).json()
    assert corps["total"] == 1
    invalide = client.get(
        "/paiements", params={**PERIODE, "statut": "INVALIDE"}, headers=entetes(alpha)
    )
    assert invalide.status_code == 400


def test_export_csv(client, db):
    seed(db)
    alpha = jeton(client, "000101", "alpha-test")
    reponse = client.get("/releve/export", params=PERIODE, headers=entetes(alpha))
    assert reponse.status_code == 200
    assert "attachment" in reponse.headers["content-disposition"]
    assert "releve_000101" in reponse.headers["content-disposition"]

    lignes = list(csv.reader(io.StringIO(reponse.text.lstrip("\ufeff"))))
    assert lignes[0] == [
        "date_heure", "reference", "telephone_payeur", "montant",
        "frais_reseau", "commission", "net", "statut",
    ]
    assert len(lignes) == 1 + 3 + 1  # en-tête + 3 paiements + totaux
    assert "GIM-B1" not in reponse.text
    totaux = lignes[-1]
    assert totaux[0] == "TOTAUX (2 confirmés)"
    assert totaux[3:7] == ["260000", "1100", "100", "258800"]
    attente = next(l for l in lignes if l[1] == "GIM-A3")
    assert attente[4:7] == ["", "", ""]


def test_admin_refuse_sur_routes_marchand(client, db):
    seed(db)
    admin = jeton(client, "admin", "admin-test")
    for chemin in ("/paiements", "/releve", "/releve/export"):
        assert client.get(chemin, params=PERIODE, headers=entetes(admin)).status_code == 403
    client.cookies.clear()
    assert client.get("/paiements", params=PERIODE).status_code == 401