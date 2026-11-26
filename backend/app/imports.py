"""Import CSV des paiements : validation ligne par ligne, un rejet n'arrête jamais le fichier."""

import csv
import io
import re
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.deps import admin_requis, get_session
from app.frais import TRANCHES, calculer_frais_commission_net
from app.models import Import, ImportLigne, Marchand, Paiement, Utilisateur

router = APIRouter(prefix="/imports", tags=["imports"])

TAILLE_MAX_OCTETS = 2 * 1024 * 1024
# Windows/Excel envoie souvent application/vnd.ms-excel pour un .csv
MIMES_ACCEPTES = {"text/csv", "application/vnd.ms-excel"}
COLONNES_REQUISES = [
    "reference",
    "date_heure",
    "code_marchand",
    "telephone_payeur",
    "montant",
    "statut",
]
STATUTS_VALIDES = {"CONFIRME", "EN_ATTENTE", "REFUSE"}
DOUALA = ZoneInfo("Africa/Douala")

# Les bornes du montant viennent des tranches de frais : une seule source de vérité.
# Si une tranche est ajoutée dans frais.py, l'import l'accepte sans autre modification.
MONTANT_MIN = TRANCHES[0][0]
MONTANT_MAX = TRANCHES[-1][1]
NB_CHIFFRES_MAX = len(str(MONTANT_MAX))

# Longueur de la colonne paiements.reference (String(50))
LONGUEUR_MAX_REFERENCE = 50
# Une référence : 1 à 50 caractères, sans espace ni caractère de contrôle
REFERENCE_VALIDE = re.compile(r"[^\s\x00-\x1f\x7f]{1,%d}" % LONGUEUR_MAX_REFERENCE)
# Format imposé par le sujet : 2026-11-02T09:14:00 (heure du Cameroun)
FORMAT_DATE = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}")
CARACTERES_CONTROLE = re.compile(r"[\x00-\x1f\x7f]")

# Verrou PostgreSQL : un seul import à la fois (voir importer_csv)
VERROU_IMPORT = 7_000_001
TAILLE_LOT_SQL = 1000


def _avec_espaces(nombre: int) -> str:
    return f"{nombre:,}".replace(",", " ")


MOTIF_MONTANT_NON_NUMERIQUE = "montant invalide : uniquement des chiffres attendus"
MOTIF_MONTANT_HORS_TRANCHE = (
    f"montant hors tranche ({_avec_espaces(MONTANT_MIN)} à {_avec_espaces(MONTANT_MAX)} FCFA)"
)
MOTIF_MARCHAND_INCONNU = "marchand inconnu"
MOTIF_STATUT_INVALIDE = "statut invalide (CONFIRME, EN_ATTENTE ou REFUSE attendu)"
MOTIF_TELEPHONE_INVALIDE = "téléphone invalide (9 chiffres commençant par 6)"
MOTIF_REFERENCE_DIFFERENTE = "référence déjà présente avec des données différentes"
MOTIF_REFERENCE_MANQUANTE = "référence manquante"
MOTIF_REFERENCE_INVALIDE = (
    f"référence invalide ({LONGUEUR_MAX_REFERENCE} caractères maximum, "
    "sans espace ni caractère de contrôle)"
)
MOTIF_DATE_INVALIDE = "date invalide (format AAAA-MM-JJTHH:MM:SS attendu)"
MOTIF_COLONNES_INCORRECTES = (
    f"nombre de colonnes incorrect ({len(COLONNES_REQUISES)} valeurs attendues)"
)

CHAMPS_COMPARES = ("date_heure", "code_marchand", "telephone_payeur", "montant", "statut")


class RejetDetail(BaseModel):
    numero_ligne: int
    reference: str | None
    motif_rejet: str


class ImportReponse(BaseModel):
    id: int
    date: datetime
    auteur: str
    lignes_lues: int
    lignes_importees: int
    lignes_deja_presentes: int
    lignes_rejetees: int
    rejets: list[RejetDetail]


def _valider_ligne(champs: dict, marchands_connus: set) -> tuple[dict | None, str | None]:
    """Retourne (donnees, None) si valide, sinon (None, motif). Ordre imposé par le sujet."""
    if not champs["reference"]:
        return None, MOTIF_REFERENCE_MANQUANTE
    # Sans ce contrôle, une référence de plus de 50 caractères ferait échouer
    # l'INSERT dans PostgreSQL et annulerait tout le fichier (erreur 500).
    if not REFERENCE_VALIDE.fullmatch(champs["reference"]):
        return None, MOTIF_REFERENCE_INVALIDE

    # isdigit() accepterait des caractères unicode (« ² ») : on exige 0-9 en regex
    if not re.fullmatch(r"[0-9]+", champs["montant"]):
        return None, MOTIF_MONTANT_NON_NUMERIQUE
    # Garde-fou avant int() : une chaîne de milliers de chiffres lève une ValueError
    if len(champs["montant"]) > NB_CHIFFRES_MAX:
        return None, MOTIF_MONTANT_HORS_TRANCHE
    montant = int(champs["montant"])
    if not MONTANT_MIN <= montant <= MONTANT_MAX:
        return None, MOTIF_MONTANT_HORS_TRANCHE

    if champs["code_marchand"] not in marchands_connus:
        return None, MOTIF_MARCHAND_INCONNU

    if champs["statut"] not in STATUTS_VALIDES:
        return None, MOTIF_STATUT_INVALIDE

    if not re.fullmatch(r"6[0-9]{8}", champs["telephone_payeur"]):
        return None, MOTIF_TELEPHONE_INVALIDE

    # Format strict : une date sans heure ("2026-11-02") est refusée
    if not FORMAT_DATE.fullmatch(champs["date_heure"]):
        return None, MOTIF_DATE_INVALIDE
    try:
        date_heure = datetime.fromisoformat(champs["date_heure"])
    except ValueError:  # format correct mais date impossible : 2026-13-45T00:00:00
        return None, MOTIF_DATE_INVALIDE
    date_heure = date_heure.replace(tzinfo=DOUALA)

    return {
        "reference": champs["reference"],
        "date_heure": date_heure,
        "code_marchand": champs["code_marchand"],
        "telephone_payeur": champs["telephone_payeur"],
        "montant": montant,
        "statut": champs["statut"],
    }, None


def _reference_stockable(reference: str) -> str | None:
    """Référence d'une ligne rejetée, rendue compatible avec la colonne String(50)."""
    propre = CARACTERES_CONTROLE.sub("", reference)[:LONGUEUR_MAX_REFERENCE]
    return propre or None


def _rejeter(session: Session, importation: Import, numero: int, reference: str, motif: str) -> None:
    importation.lignes_rejetees += 1
    session.add(
        ImportLigne(
            import_id=importation.id,
            numero_ligne=numero,
            reference=_reference_stockable(reference),
            motif_rejet=motif,
        )
    )


def _paiements_existants(session: Session, references: set[str]) -> dict[str, tuple]:
    """Signature des paiements déjà en base, pour les références du fichier.

    Une requête par lot de 1000 références, au lieu d'une requête par ligne.
    """
    existants: dict[str, tuple] = {}
    triees = sorted(references)
    for debut in range(0, len(triees), TAILLE_LOT_SQL):
        lot = triees[debut : debut + TAILLE_LOT_SQL]
        for paiement in session.scalars(select(Paiement).where(Paiement.reference.in_(lot))):
            existants[paiement.reference] = tuple(getattr(paiement, c) for c in CHAMPS_COMPARES)
    return existants


def _construire_reponse(session: Session, importation: Import, auteur: str) -> ImportReponse:
    rejets = session.scalars(
        select(ImportLigne)
        .where(ImportLigne.import_id == importation.id)
        .order_by(ImportLigne.numero_ligne)
    ).all()
    return ImportReponse(
        id=importation.id,
        date=importation.date,
        auteur=auteur,
        lignes_lues=importation.lignes_lues,
        lignes_importees=importation.lignes_importees,
        lignes_deja_presentes=importation.lignes_deja_presentes,
        lignes_rejetees=importation.lignes_rejetees,
        rejets=[
            RejetDetail(
                numero_ligne=r.numero_ligne, reference=r.reference, motif_rejet=r.motif_rejet
            )
            for r in rejets
        ],
    )


@router.post("", response_model=ImportReponse)
async def importer_csv(
    fichier: UploadFile,
    session: Session = Depends(get_session),
    admin: Utilisateur = Depends(admin_requis),
):
    # Deux contrôles : le type déclaré par le client ET l'extension du nom de fichier
    nom = (fichier.filename or "").lower()
    if fichier.content_type not in MIMES_ACCEPTES or not nom.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Type de fichier non accepté : CSV uniquement.")
    # Lecture bornée : on ne charge jamais plus de 2 Mo + 1 octet en mémoire
    contenu = await fichier.read(TAILLE_MAX_OCTETS + 1)
    if len(contenu) > TAILLE_MAX_OCTETS:
        raise HTTPException(status_code=400, detail="Fichier trop volumineux : 2 Mo maximum.")
    if not contenu.strip():
        raise HTTPException(status_code=400, detail="Fichier vide.")
    # Un vrai CSV est du texte : un octet nul trahit un fichier binaire renommé
    if b"\x00" in contenu:
        raise HTTPException(
            status_code=400, detail="Contenu non valide : un fichier texte CSV est attendu."
        )
    try:
        texte = contenu.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="Encodage invalide : UTF-8 attendu.")

    premiere_ligne = texte.splitlines()[0]
    separateur = ";" if ";" in premiere_ligne else ","
    lecteur = csv.DictReader(io.StringIO(texte), delimiter=separateur)
    # Le module csv peut lever csv.Error (champ géant, guillemets cassés) : on lit tout
    # ici pour transformer ce cas en 400 clair plutôt qu'en erreur 500.
    try:
        colonnes = lecteur.fieldnames or []
        lignes = list(enumerate(lecteur, start=2))
    except csv.Error:
        raise HTTPException(
            status_code=400,
            detail="Fichier CSV illisible : vérifiez les guillemets et les séparateurs.",
        )
    manquantes = [c for c in COLONNES_REQUISES if c not in colonnes]
    if manquantes:
        raise HTTPException(
            status_code=400, detail=f"Colonnes manquantes : {', '.join(manquantes)}."
        )

    # Verrou : un seul import à la fois. Deux imports simultanés du même fichier
    # s'exécutent l'un après l'autre, le second voit les paiements du premier et les
    # compte « déjà présents » au lieu de provoquer une violation d'unicité (erreur 500).
    # Le verrou est libéré automatiquement au commit ou au rollback.
    session.execute(select(func.pg_advisory_xact_lock(VERROU_IMPORT)))

    marchands_connus = set(session.scalars(select(Marchand.code)))

    # Une seule lecture (par lots) des paiements déjà en base pour ce fichier
    references_du_fichier = {
        (ligne.get("reference") or "").strip() for _, ligne in lignes
    }
    connus = _paiements_existants(
        session, {r for r in references_du_fichier if REFERENCE_VALIDE.fullmatch(r)}
    )

    importation = Import(
        date=datetime.now(timezone.utc),
        auteur=admin.id,
        lignes_lues=0,
        lignes_importees=0,
        lignes_deja_presentes=0,
        lignes_rejetees=0,
    )
    session.add(importation)
    session.flush()  # obtient importation.id sans encore valider la transaction

    # `connus` contient les paiements en base, puis ceux ajoutés par CE fichier
    for numero_ligne, ligne in lignes:
        importation.lignes_lues += 1
        reference_brute = (ligne.get("reference") or "").strip()

        # Colonne en trop (clé None chez DictReader) ou valeur absente : ligne mal formée
        if None in ligne or any(ligne.get(c) is None for c in COLONNES_REQUISES):
            _rejeter(session, importation, numero_ligne, reference_brute, MOTIF_COLONNES_INCORRECTES)
            continue

        champs = {c: ligne[c].strip() for c in COLONNES_REQUISES}
        donnees, motif = _valider_ligne(champs, marchands_connus)
        if motif is not None:
            _rejeter(session, importation, numero_ligne, champs["reference"], motif)
            continue

        signature = tuple(donnees[c] for c in CHAMPS_COMPARES)
        existant = connus.get(donnees["reference"])

        if existant is not None:
            if existant == signature:
                importation.lignes_deja_presentes += 1
            else:
                _rejeter(
                    session, importation, numero_ligne, donnees["reference"],
                    MOTIF_REFERENCE_DIFFERENTE,
                )
            continue

        frais, commission, net = calculer_frais_commission_net(
            donnees["montant"], donnees["statut"]
        )
        session.add(
            Paiement(**donnees, frais_reseau=frais, commission=commission, net=net)
        )
        connus[donnees["reference"]] = signature
        importation.lignes_importees += 1

    # Une seule transaction : paiements valides + rapport commités ensemble,
    # les rejets sont un flux normal, pas des exceptions
    session.commit()
    return _construire_reponse(session, importation, admin.identifiant)


@router.get("", response_model=list[ImportReponse])
def historique_imports(
    session: Session = Depends(get_session),
    admin: Utilisateur = Depends(admin_requis),
):
    importations = session.scalars(
        select(Import).order_by(Import.date.desc(), Import.id.desc())
    ).all()
    reponses = []
    for importation in importations:
        auteur = session.get(Utilisateur, importation.auteur)
        reponses.append(_construire_reponse(session, importation, auteur.identifiant))
    return reponses