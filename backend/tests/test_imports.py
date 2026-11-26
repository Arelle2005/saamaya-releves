from concurrent.futures import ThreadPoolExecutor

from sqlalchemy import event, func, select

from app.frais import TRANCHES
from app.models import ImportLigne, Paiement

ENTETE = "reference,date_heure,code_marchand,telephone_payeur,montant,statut"

# Fichier de 14 lignes reconstitué selon le résultat attendu du sujet :
# 9 importées, 1 déjà présente (GIM-0002 en double identique), 4 rejetées.
CSV_14_LIGNES = ENTETE + """
GIM-0001,2026-11-22T08:15:00,000101,699000001,10000,CONFIRME
GIM-0002,2026-11-22T09:00:00,000101,699000002,250000,CONFIRME
GIM-0003,2026-11-22T09:30:00,000102,699000003,300000,CONFIRME
GIM-0004,2026-11-22T10:00:00,000101,699000004,500,EN_ATTENTE
GIM-0005,2026-11-22T10:30:00,000102,699000005,1234567,CONFIRME
GIM-0006,2026-11-22T11:00:00,000101,699000006,6000000,CONFIRME
GIM-0007,2026-11-22T11:30:00,000102,699000007,20000,REFUSE
GIM-0008,2026-11-22T12:00:00,000101,699000008,400,CONFIRME
GIM-0009,2026-11-22T12:30:00,000999,699000009,15000,CONFIRME
GIM-0010,2026-11-22T13:00:00,000102,699000010,-5000,CONFIRME
GIM-0011,2026-11-22T13:30:00,000101,699000011,50000,CONFIRME
GIM-0012,2026-11-22T14:00:00,000102,699000012,1 000,CONFIRME
GIM-0013,2026-11-22T14:30:00,000101,699000013,75000,EN_ATTENTE
GIM-0002,2026-11-22T09:00:00,000101,699000002,250000,CONFIRME
"""


# Le fichier EXACT de la section 3 du sujet
CSV_SUJET = ENTETE + """
GIM-0001,2026-11-02T09:14:00,000101,699000001,10000,CONFIRME
GIM-0002,2026-11-02T10:02:00,000101,677000002,250000,CONFIRME
GIM-0003,2026-11-03T11:45:00,000102,655000003,300000,CONFIRME
GIM-0004,2026-11-03T12:30:00,000102,699000004,1234567,CONFIRME
GIM-0005,2026-11-04T08:05:00,000101,677000005,6000000,CONFIRME
GIM-0006,2026-11-04T15:20:00,000101,655000006,4500,EN_ATTENTE
GIM-0007,2026-11-05T16:00:00,000102,699000007,15000,REFUSE
GIM-0002,2026-11-02T10:02:00,000101,677000002,250000,CONFIRME
GIM-0008,2026-11-05T17:10:00,000101,677000008,300,CONFIRME
GIM-0009,2026-11-06T09:00:00,000999,655000009,20000,CONFIRME
GIM-0010,2026-11-06T09:30:00,000102,699000010,-5000,CONFIRME
GIM-0011,2026-11-07T13:00:00,000102,677000011,75000,CONFIRME
GIM-0012,2026-11-08T18:45:00,000101,655000012,1 000,CONFIRME
GIM-0013,2026-11-09T07:55:00,000102,699000013,500,CONFIRME
"""


def jeton_admin(client):
    reponse = client.post(
        "/auth/connexion", json={"identifiant": "admin", "mot_de_passe": "admin-test"}
    )
    return reponse.json()["jeton"]


def jeton_marchand(client):
    reponse = client.post(
        "/auth/connexion", json={"identifiant": "000101", "mot_de_passe": "alpha-test"}
    )
    return reponse.json()["jeton"]


def importer(client, jeton, contenu, mime="text/csv", nom="paiements.csv"):
    if isinstance(contenu, str):
        contenu = contenu.encode("utf-8")
    return client.post(
        "/imports",
        files={"fichier": (nom, contenu, mime)},
        headers={"Authorization": f"Bearer {jeton}"},
    )


def test_import_14_lignes(client, db):
    reponse = importer(client, jeton_admin(client), CSV_14_LIGNES)
    assert reponse.status_code == 200
    corps = reponse.json()
    assert corps["lignes_lues"] == 14
    assert corps["lignes_importees"] == 9
    assert corps["lignes_deja_presentes"] == 1
    assert corps["lignes_rejetees"] == 4
    assert corps["auteur"] == "admin"

    motifs = {r["reference"]: r["motif_rejet"] for r in corps["rejets"]}
    assert motifs == {
        "GIM-0008": "montant hors tranche (500 à 100 000 000 FCFA)",
        "GIM-0009": "marchand inconnu",
        "GIM-0010": "montant invalide : uniquement des chiffres attendus",
        "GIM-0012": "montant invalide : uniquement des chiffres attendus",
    }
    assert db.scalar(select(func.count()).select_from(Paiement)) == 9

    # Les frais des cas de contrôle sont bien calculés à l'import
    gim5 = db.scalar(select(Paiement).where(Paiement.reference == "GIM-0005"))
    assert (gim5.frais_reseau, gim5.commission, gim5.net) == (5_000, 50, 1_229_517)
    # Un EN_ATTENTE reste NULL
    gim4 = db.scalar(select(Paiement).where(Paiement.reference == "GIM-0004"))
    assert (gim4.frais_reseau, gim4.commission, gim4.net) == (None, None, None)


def test_idempotence_double_import(client, db):
    jeton = jeton_admin(client)
    premier = importer(client, jeton, CSV_14_LIGNES).json()
    second = importer(client, jeton, CSV_14_LIGNES).json()
    assert second["lignes_lues"] == 14
    assert second["lignes_importees"] == 0
    assert second["lignes_deja_presentes"] == 10
    assert second["lignes_rejetees"] == 4
    assert db.scalar(select(func.count()).select_from(Paiement)) == premier["lignes_importees"]


def test_reference_existante_donnees_differentes(client):
    jeton = jeton_admin(client)
    importer(client, jeton, CSV_14_LIGNES)
    modifiee = ENTETE + "\nGIM-0001,2026-11-22T08:15:00,000101,699000001,20000,CONFIRME\n"
    corps = importer(client, jeton, modifiee).json()
    assert corps["lignes_importees"] == 0
    assert corps["lignes_rejetees"] == 1
    assert corps["rejets"][0]["motif_rejet"] == "référence déjà présente avec des données différentes"


def test_telephone_mal_forme(client):
    jeton = jeton_admin(client)
    lignes = ENTETE + """
GIM-0100,2026-11-22T08:00:00,000101,799000001,10000,CONFIRME
GIM-0101,2026-11-22T08:00:00,000101,69900001,10000,CONFIRME
"""
    corps = importer(client, jeton, lignes).json()
    assert corps["lignes_rejetees"] == 2
    assert all(
        r["motif_rejet"] == "téléphone invalide (9 chiffres commençant par 6)"
        for r in corps["rejets"]
    )


def test_statut_invalide(client):
    jeton = jeton_admin(client)
    ligne = ENTETE + "\nGIM-0102,2026-11-22T08:00:00,000101,699000001,10000,VALIDE\n"
    corps = importer(client, jeton, ligne).json()
    assert corps["lignes_rejetees"] == 1
    assert corps["rejets"][0]["motif_rejet"] == "statut invalide (CONFIRME, EN_ATTENTE ou REFUSE attendu)"


def test_import_reserve_admin(client):
    assert importer(client, jeton_marchand(client), CSV_14_LIGNES).status_code == 403
    client.cookies.clear()
    assert client.post("/imports").status_code == 401
    assert client.get("/imports").status_code == 401
    assert client.get(
        "/imports", headers={"Authorization": f"Bearer {jeton_marchand(client)}"}
    ).status_code == 403


def test_fichier_trop_volumineux(client):
    gros = b"a" * (2 * 1024 * 1024 + 1)
    reponse = importer(client, jeton_admin(client), gros)
    assert reponse.status_code == 400
    assert "2 Mo" in reponse.json()["detail"]


def test_mime_non_accepte(client):
    reponse = importer(client, jeton_admin(client), CSV_14_LIGNES, mime="application/pdf")
    assert reponse.status_code == 400
    assert "CSV" in reponse.json()["detail"]


def test_colonnes_manquantes(client):
    reponse = importer(client, jeton_admin(client), "reference,montant\nGIM-0200,10000\n")
    assert reponse.status_code == 400
    assert "Colonnes manquantes" in reponse.json()["detail"]


def test_historique_imports(client):
    jeton = jeton_admin(client)
    importer(client, jeton, CSV_14_LIGNES)
    importer(client, jeton, CSV_14_LIGNES)
    reponse = client.get("/imports", headers={"Authorization": f"Bearer {jeton}"})
    assert reponse.status_code == 200
    historique = reponse.json()
    assert len(historique) == 2
    # Le plus récent d'abord : c'est le second import (0 importée)
    assert historique[0]["lignes_importees"] == 0
    assert historique[1]["lignes_importees"] == 9
    assert len(historique[1]["rejets"]) == 4


# ---------------------------------------------------------------------------
# Fichier exact du sujet
# ---------------------------------------------------------------------------


def test_fichier_exact_du_sujet(client, db):
    corps = importer(client, jeton_admin(client), CSV_SUJET).json()
    assert (corps["lignes_lues"], corps["lignes_importees"]) == (14, 9)
    assert (corps["lignes_deja_presentes"], corps["lignes_rejetees"]) == (1, 4)
    rejets = {(r["numero_ligne"], r["reference"]): r["motif_rejet"] for r in corps["rejets"]}
    assert rejets == {
        (10, "GIM-0008"): "montant hors tranche (500 à 100 000 000 FCFA)",
        (11, "GIM-0009"): "marchand inconnu",
        (12, "GIM-0010"): "montant invalide : uniquement des chiffres attendus",
        (14, "GIM-0012"): "montant invalide : uniquement des chiffres attendus",
    }
    assert db.scalar(select(func.count()).select_from(Paiement)) == 9


# ---------------------------------------------------------------------------
# Lignes mal formées : un rejet, jamais une erreur 500
# ---------------------------------------------------------------------------


def test_reference_trop_longue_rejetee_sans_bloquer_le_fichier(client, db):
    longue = "R" * 60
    contenu = (
        ENTETE
        + f"\n{longue},2026-11-22T08:00:00,000101,699000001,10000,CONFIRME"
        + "\nGIM-0300,2026-11-22T08:00:00,000101,699000001,10000,CONFIRME\n"
    )
    reponse = importer(client, jeton_admin(client), contenu)
    assert reponse.status_code == 200
    corps = reponse.json()
    assert corps["lignes_importees"] == 1
    assert corps["lignes_rejetees"] == 1
    assert "référence invalide" in corps["rejets"][0]["motif_rejet"]
    # La référence rejetée est tronquée à 50 caractères pour tenir dans la colonne
    assert len(corps["rejets"][0]["reference"]) == 50
    assert db.scalar(select(func.count()).select_from(Paiement)) == 1


def test_reference_avec_espace_ou_caractere_de_controle(client):
    contenu = (
        ENTETE
        + "\nGIM 0301,2026-11-22T08:00:00,000101,699000001,10000,CONFIRME"
        + "\nGIM\x070302,2026-11-22T08:00:00,000101,699000001,10000,CONFIRME\n"
    )
    corps = importer(client, jeton_admin(client), contenu).json()
    assert corps["lignes_rejetees"] == 2
    assert all("référence invalide" in r["motif_rejet"] for r in corps["rejets"])


def test_ligne_avec_colonne_en_trop(client, db):
    contenu = ENTETE + "\nGIM-0310,2026-11-22T08:00:00,000101,699000001,10000,CONFIRME,extra\n"
    corps = importer(client, jeton_admin(client), contenu).json()
    assert corps["lignes_importees"] == 0
    assert corps["rejets"][0]["motif_rejet"] == "nombre de colonnes incorrect (6 valeurs attendues)"
    assert db.scalar(select(func.count()).select_from(Paiement)) == 0


def test_ligne_avec_colonne_manquante(client):
    contenu = ENTETE + "\nGIM-0311,2026-11-22T08:00:00,000101,699000001,10000\n"
    corps = importer(client, jeton_admin(client), contenu).json()
    assert corps["lignes_rejetees"] == 1
    assert corps["rejets"][0]["motif_rejet"] == "nombre de colonnes incorrect (6 valeurs attendues)"


def test_date_sans_heure_ou_impossible_rejetee(client):
    contenu = (
        ENTETE
        + "\nGIM-0320,2026-11-22,000101,699000001,10000,CONFIRME"
        + "\nGIM-0321,2026-13-45T09:14:00,000101,699000001,10000,CONFIRME"
        + "\nGIM-0322,22/11/2026 09:14,000101,699000001,10000,CONFIRME\n"
    )
    corps = importer(client, jeton_admin(client), contenu).json()
    assert corps["lignes_importees"] == 0
    assert corps["lignes_rejetees"] == 3
    assert all(r["motif_rejet"].startswith("date invalide") for r in corps["rejets"])


def test_montant_gigantesque_rejete_sans_erreur(client):
    contenu = ENTETE + "\nGIM-0330,2026-11-22T08:00:00,000101,699000001," + "9" * 5000 + ",CONFIRME\n"
    reponse = importer(client, jeton_admin(client), contenu)
    assert reponse.status_code == 200
    assert reponse.json()["rejets"][0]["motif_rejet"].startswith("montant hors tranche")


def test_doublon_dans_le_meme_fichier_avec_donnees_differentes(client, db):
    contenu = (
        ENTETE
        + "\nGIM-0340,2026-11-22T08:00:00,000101,699000001,10000,CONFIRME"
        + "\nGIM-0340,2026-11-22T08:00:00,000101,699000001,20000,CONFIRME\n"
    )
    corps = importer(client, jeton_admin(client), contenu).json()
    assert corps["lignes_importees"] == 1
    assert corps["lignes_rejetees"] == 1
    assert corps["rejets"][0]["motif_rejet"] == "référence déjà présente avec des données différentes"
    assert db.scalar(select(Paiement.montant).where(Paiement.reference == "GIM-0340")) == 10_000


def test_separateur_point_virgule(client):
    contenu = (
        ENTETE.replace(",", ";")
        + "\nGIM-0350;2026-11-22T08:00:00;000101;699000001;10000;CONFIRME\n"
    )
    assert importer(client, jeton_admin(client), contenu).json()["lignes_importees"] == 1


# ---------------------------------------------------------------------------
# Bornes du montant : elles viennent des tranches
# ---------------------------------------------------------------------------


def test_bornes_du_montant_viennent_des_tranches(client, db):
    minimum, maximum = TRANCHES[0][0], TRANCHES[-1][1]
    contenu = (
        ENTETE
        + f"\nGIM-0360,2026-11-22T08:00:00,000101,699000001,{minimum - 1},CONFIRME"
        + f"\nGIM-0361,2026-11-22T08:00:00,000101,699000001,{minimum},CONFIRME"
        + f"\nGIM-0362,2026-11-22T08:00:00,000101,699000001,{maximum},CONFIRME"
        + f"\nGIM-0363,2026-11-22T08:00:00,000101,699000001,{maximum + 1},CONFIRME\n"
    )
    corps = importer(client, jeton_admin(client), contenu).json()
    assert corps["lignes_importees"] == 2
    assert {r["reference"] for r in corps["rejets"]} == {"GIM-0360", "GIM-0363"}


# ---------------------------------------------------------------------------
# Contrôle du fichier : type, extension, contenu, lisibilité
# ---------------------------------------------------------------------------


def test_extension_non_csv_refusee_meme_avec_mime_csv(client):
    reponse = importer(client, jeton_admin(client), CSV_14_LIGNES, mime="text/csv", nom="notes.txt")
    assert reponse.status_code == 400
    assert "CSV" in reponse.json()["detail"]


def test_contenu_binaire_refuse(client):
    binaire = b"reference,montant\x00\x01\x02\n"
    reponse = importer(client, jeton_admin(client), binaire)
    assert reponse.status_code == 400
    assert "Contenu non valide" in reponse.json()["detail"]


def test_csv_illisible_donne_400(client):
    # Un champ de 200 000 caractères dépasse la limite du module csv (131 072)
    contenu = ENTETE + "\n" + "A" * 200_000 + ",2026-11-22T08:00:00,000101,699000001,10000,CONFIRME\n"
    reponse = importer(client, jeton_admin(client), contenu)
    assert reponse.status_code == 400
    assert "illisible" in reponse.json()["detail"]


# ---------------------------------------------------------------------------
# Robustesse : requêtes SQL et imports simultanés
# ---------------------------------------------------------------------------


def test_une_seule_lecture_des_paiements_pour_tout_le_fichier(client, db):
    from app.database import engine

    lignes = "".join(
        f"\nGIM-{i:05d},2026-11-22T08:00:00,000101,699000001,10000,CONFIRME" for i in range(300)
    )
    requetes = []

    def compter(conn, cursor, statement, parameters, context, executemany):
        if statement.lstrip().upper().startswith("SELECT") and "FROM paiements" in statement:
            requetes.append(statement)

    jeton = jeton_admin(client)
    event.listen(engine, "before_cursor_execute", compter)
    try:
        corps = importer(client, jeton, ENTETE + lignes + "\n").json()
    finally:
        event.remove(engine, "before_cursor_execute", compter)

    assert corps["lignes_importees"] == 300
    # 300 lignes, mais une seule requête de lecture sur paiements (et non 300)
    assert len(requetes) == 1


def test_deux_imports_simultanes_ne_plantent_pas(client, db):
    from fastapi.testclient import TestClient

    from app.main import app

    jeton = jeton_admin(client)

    def lancer():
        return importer(TestClient(app), jeton, CSV_SUJET)

    with ThreadPoolExecutor(max_workers=2) as pool:
        reponses = [f.result() for f in [pool.submit(lancer), pool.submit(lancer)]]

    assert [r.status_code for r in reponses] == [200, 200]
    totaux = sorted(r.json()["lignes_importees"] for r in reponses)
    # L'un importe les 9 paiements, l'autre les trouve tous déjà présents
    assert totaux == [0, 9]
    assert db.scalar(select(func.count()).select_from(Paiement)) == 9


def test_reference_rejetee_a_longueur_limite_enregistree_en_historique(client, db):
    contenu = ENTETE + "\n" + "Z" * 80 + ",2026-11-22T08:00:00,000101,699000001,10000,CONFIRME\n"
    importer(client, jeton_admin(client), contenu)
    ligne = db.scalar(select(ImportLigne))
    assert len(ligne.reference) == 50