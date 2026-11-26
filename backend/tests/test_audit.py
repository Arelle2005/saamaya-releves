"""Journal d'audit : connexions (réussies, échouées, bloquées) et imports."""

import pytest
from sqlalchemy import select

from app.models import JournalAudit

ENTETE = "reference,date_heure,code_marchand,telephone_payeur,montant,statut"
CSV = ENTETE + """
GIM-0001,2026-11-02T09:14:00,000101,699000001,10000,CONFIRME
GIM-0002,2026-11-02T10:02:00,000101,677000002,300,CONFIRME
"""


def connexion(client, identifiant="admin", mot_de_passe="admin-test"):
    return client.post(
        "/auth/connexion", json={"identifiant": identifiant, "mot_de_passe": mot_de_passe}
    )


def entetes_admin(client):
    return {"Authorization": f"Bearer {connexion(client).json()['jeton']}"}


def importer(client, entetes, contenu=CSV, nom="paiements.csv"):
    return client.post(
        "/imports", files={"fichier": (nom, contenu.encode(), "text/csv")}, headers=entetes
    )


def evenements(db):
    db.expire_all()
    return list(db.scalars(select(JournalAudit).order_by(JournalAudit.id)))


# ---------------------------------------------------------------------------
# Connexions
# ---------------------------------------------------------------------------


def test_connexion_reussie_enregistree(client, db):
    connexion(client, "000101", "alpha-test")
    (evenement,) = evenements(db)
    assert evenement.type == "CONNEXION"
    assert evenement.resultat == "SUCCES"
    assert evenement.identifiant == "000101"
    assert evenement.ip == "testclient"  # adresse fournie par le client de test
    assert evenement.date is not None


def test_echec_mot_de_passe_enregistre_avec_la_cause(client, db):
    connexion(client, "000101", "faux")
    (evenement,) = evenements(db)
    assert (evenement.type, evenement.resultat) == ("CONNEXION", "ECHEC")
    assert evenement.identifiant == "000101"
    assert evenement.details == "mot de passe incorrect (échec 1 sur 5)"


def test_identifiant_inconnu_enregistre_avec_la_cause(client, db):
    connexion(client, "fantome", "x")
    (evenement,) = evenements(db)
    assert evenement.resultat == "ECHEC"
    assert evenement.identifiant == "fantome"
    assert evenement.details == "identifiant inconnu (échec 1 sur 5)"


def test_aucun_mot_de_passe_n_est_ecrit_dans_le_journal(client, db):
    secret = "Mot-De-Passe-Tres-Secret-42"
    connexion(client, "000101", secret)
    connexion(client, "fantome", secret)
    connexion(client, "admin", "admin-test")
    for evenement in evenements(db):
        texte = " ".join(str(v) for v in (
            evenement.type, evenement.identifiant, evenement.ip, evenement.resultat, evenement.details))
        assert secret not in texte
        assert "admin-test" not in texte
        assert "alpha-test" not in texte


def test_blocage_enregistre_puis_les_tentatives_pendant_le_blocage(client, db):
    for _ in range(5):
        connexion(client, "admin", "faux")
    connexion(client, "admin")  # bon mot de passe, mais compte bloqué
    liste = evenements(db)
    assert [e.resultat for e in liste] == ["ECHEC"] * 5 + ["BLOQUE"]
    assert "blocage de 15 minutes déclenché" in liste[4].details
    assert "pendant le blocage" in liste[5].details
    assert all(e.type == "CONNEXION" and e.identifiant == "admin" for e in liste)


def test_un_identifiant_tres_long_ne_casse_rien(client, db):
    reponse = connexion(client, "x" * 51, "x")
    assert reponse.status_code == 400  # refusé avant d'atteindre le journal
    assert evenements(db) == []


# ---------------------------------------------------------------------------
# Imports
# ---------------------------------------------------------------------------


def test_import_reussi_enregistre_avec_le_bilan(client, db):
    entetes = entetes_admin(client)
    cree = importer(client, entetes).json()
    imports = [e for e in evenements(db) if e.type == "IMPORT"]
    assert len(imports) == 1
    assert (imports[0].resultat, imports[0].identifiant, imports[0].ip) == ("SUCCES", "admin", "testclient")
    assert imports[0].details == (
        f"import n°{cree['id']} : 2 lue(s), 1 importée(s), 0 déjà présente(s), 1 rejetée(s)"
    )


def test_import_refuse_enregistre_avec_le_motif(client, db):
    entetes = entetes_admin(client)
    reponse = importer(client, entetes, nom="notes.txt")
    assert reponse.status_code == 400
    (evenement,) = [e for e in evenements(db) if e.type == "IMPORT"]
    assert (evenement.resultat, evenement.identifiant) == ("ECHEC", "admin")
    assert evenement.details == "Type de fichier non accepté : CSV uniquement."


def test_import_avec_colonnes_manquantes_enregistre(client, db):
    entetes = entetes_admin(client)
    importer(client, entetes, "reference,montant\nGIM-1,10000\n")
    (evenement,) = [e for e in evenements(db) if e.type == "IMPORT"]
    assert evenement.resultat == "ECHEC"
    assert evenement.details.startswith("Colonnes manquantes")


def test_import_par_un_marchand_n_est_pas_enregistre_comme_import(client, db):
    jeton = connexion(client, "000101", "alpha-test").json()["jeton"]
    reponse = importer(client, {"Authorization": f"Bearer {jeton}"})
    assert reponse.status_code == 403
    assert [e for e in evenements(db) if e.type == "IMPORT"] == []


# ---------------------------------------------------------------------------
# Lecture du journal : GET /audit
# ---------------------------------------------------------------------------


def test_lecture_du_journal_par_l_admin(client, db):
    entetes = entetes_admin(client)
    connexion(client, "000101", "faux")
    importer(client, entetes)
    reponse = client.get("/audit", headers=entetes)
    assert reponse.status_code == 200
    corps = reponse.json()
    assert corps["total"] == 3 and corps["page"] == 1 and corps["pages"] == 1
    # Du plus récent au plus ancien : l'import, l'échec de 000101, la connexion de l'admin
    assert [e["type"] for e in corps["evenements"]] == ["IMPORT", "CONNEXION", "CONNEXION"]
    assert [e["resultat"] for e in corps["evenements"]] == ["SUCCES", "ECHEC", "SUCCES"]


def test_lecture_du_journal_reservee_a_l_admin(client):
    assert client.get("/audit").status_code == 401
    jeton = connexion(client, "000101", "alpha-test").json()["jeton"]
    client.cookies.clear()
    assert client.get("/audit", headers={"Authorization": f"Bearer {jeton}"}).status_code == 403


def test_lire_le_journal_ne_l_alimente_pas(client, db):
    entetes = entetes_admin(client)
    avant = client.get("/audit", headers=entetes).json()["total"]
    client.get("/audit", headers=entetes)
    assert client.get("/audit", headers=entetes).json()["total"] == avant


def test_filtres_par_type_et_par_resultat(client, db):
    entetes = entetes_admin(client)
    connexion(client, "000101", "faux")
    connexion(client, "fantome", "x")
    importer(client, entetes)
    echecs = client.get("/audit", params={"resultat": "ECHEC"}, headers=entetes).json()
    assert echecs["total"] == 2
    assert {e["identifiant"] for e in echecs["evenements"]} == {"000101", "fantome"}
    imports = client.get("/audit", params={"type": "IMPORT"}, headers=entetes).json()
    assert imports["total"] == 1
    both = client.get("/audit", params={"type": "CONNEXION", "resultat": "SUCCES"}, headers=entetes).json()
    assert both["total"] == 1


@pytest.mark.parametrize("params,message", [
    ({"type": "AUTRE"}, "Type invalide (CONNEXION ou IMPORT attendu)."),
    ({"resultat": "PEUT-ETRE"}, "Résultat invalide (SUCCES, ECHEC ou BLOQUE attendu)."),
    ({"page": 0}, "Le paramètre « page » doit être supérieur ou égal à 1."),
])
def test_filtre_invalide_donne_400_en_francais(client, params, message):
    reponse = client.get("/audit", params=params, headers=entetes_admin(client))
    assert reponse.status_code == 400
    assert reponse.json()["detail"] == message


def test_pagination_du_journal(client, db):
    entetes = entetes_admin(client)
    for _ in range(60):
        db.add(JournalAudit(date=__import__("datetime").datetime.now(__import__("datetime").timezone.utc),
                            type="CONNEXION", identifiant="x", ip="1.2.3.4", resultat="ECHEC", details="t"))
    db.commit()
    page1 = client.get("/audit", headers=entetes).json()
    page2 = client.get("/audit", params={"page": 2}, headers=entetes).json()
    assert (page1["total"], page1["pages"], page1["par_page"]) == (61, 2, 50)
    assert len(page1["evenements"]) == 50 and len(page2["evenements"]) == 11
    ids = [e["id"] for e in page1["evenements"]] + [e["id"] for e in page2["evenements"]]
    assert len(set(ids)) == 61  # aucun événement en double entre les pages


def test_les_details_trop_longs_sont_tronques(db):
    from app.audit import enregistrer

    enregistrer(db, "IMPORT", "admin", "ECHEC", "1.2.3.4", "d" * 500)
    enregistrer(db, "CONNEXION", "i" * 80, "ECHEC", "i" * 80)
    longs = evenements(db)
    assert len(longs[0].details) == 200
    assert len(longs[1].identifiant) == 50 and len(longs[1].ip) == 45