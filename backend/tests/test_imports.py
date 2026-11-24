from sqlalchemy import func, select

from app.models import Paiement

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


def importer(client, jeton, contenu, mime="text/csv"):
    if isinstance(contenu, str):
        contenu = contenu.encode("utf-8")
    return client.post(
        "/imports",
        files={"fichier": ("paiements.csv", contenu, mime)},
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