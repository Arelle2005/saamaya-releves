"""Import CSV des paiements : validation ligne par ligne, un rejet n'arrête jamais le fichier."""

import csv
import io
import re
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import admin_requis, get_session
from app.frais import calculer_frais_commission_net
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

MOTIF_MONTANT_NON_NUMERIQUE = "montant invalide : uniquement des chiffres attendus"
MOTIF_MONTANT_HORS_TRANCHE = "montant hors tranche (500 à 100 000 000 FCFA)"
MOTIF_MARCHAND_INCONNU = "marchand inconnu"
MOTIF_STATUT_INVALIDE = "statut invalide (CONFIRME, EN_ATTENTE ou REFUSE attendu)"
MOTIF_TELEPHONE_INVALIDE = "téléphone invalide (9 chiffres commençant par 6)"
MOTIF_REFERENCE_DIFFERENTE = "référence déjà présente avec des données différentes"
MOTIF_REFERENCE_MANQUANTE = "référence manquante"
MOTIF_DATE_INVALIDE = "date invalide (format ISO 8601 attendu)"

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

    # isdigit() accepterait des caractères unicode (« ² ») : on exige 0-9 en regex
    if not re.fullmatch(r"[0-9]+", champs["montant"]):
        return None, MOTIF_MONTANT_NON_NUMERIQUE
    montant = int(champs["montant"])
    if not 500 <= montant <= 100_000_000:
        return None, MOTIF_MONTANT_HORS_TRANCHE

    if champs["code_marchand"] not in marchands_connus:
        return None, MOTIF_MARCHAND_INCONNU

    if champs["statut"] not in STATUTS_VALIDES:
        return None, MOTIF_STATUT_INVALIDE

    if not re.fullmatch(r"6[0-9]{8}", champs["telephone_payeur"]):
        return None, MOTIF_TELEPHONE_INVALIDE

    try:
        date_heure = datetime.fromisoformat(champs["date_heure"])
    except ValueError:
        return None, MOTIF_DATE_INVALIDE
    if date_heure.tzinfo is None:
        date_heure = date_heure.replace(tzinfo=DOUALA)

    return {
        "reference": champs["reference"],
        "date_heure": date_heure,
        "code_marchand": champs["code_marchand"],
        "telephone_payeur": champs["telephone_payeur"],
        "montant": montant,
        "statut": champs["statut"],
    }, None


def _rejeter(session: Session, importation: Import, numero: int, reference: str, motif: str) -> None:
    importation.lignes_rejetees += 1
    session.add(
        ImportLigne(
            import_id=importation.id,
            numero_ligne=numero,
            reference=reference or None,
            motif_rejet=motif,
        )
    )


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
    if fichier.content_type not in MIMES_ACCEPTES:
        raise HTTPException(status_code=400, detail="Type de fichier non accepté : CSV uniquement.")
    # Lecture bornée : on ne charge jamais plus de 2 Mo + 1 octet en mémoire
    contenu = await fichier.read(TAILLE_MAX_OCTETS + 1)
    if len(contenu) > TAILLE_MAX_OCTETS:
        raise HTTPException(status_code=400, detail="Fichier trop volumineux : 2 Mo maximum.")
    if not contenu.strip():
        raise HTTPException(status_code=400, detail="Fichier vide.")
    try:
        texte = contenu.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="Encodage invalide : UTF-8 attendu.")

    premiere_ligne = texte.splitlines()[0]
    separateur = ";" if ";" in premiere_ligne else ","
    lecteur = csv.DictReader(io.StringIO(texte), delimiter=separateur)
    manquantes = [c for c in COLONNES_REQUISES if c not in (lecteur.fieldnames or [])]
    if manquantes:
        raise HTTPException(
            status_code=400, detail=f"Colonnes manquantes : {', '.join(manquantes)}."
        )

    marchands_connus = set(session.scalars(select(Marchand.code)))
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

    # Références vues dans CE fichier : la session ne les a pas encore insérées en base
    vues: dict[str, tuple] = {}
    for numero_ligne, ligne in enumerate(lecteur, start=2):
        importation.lignes_lues += 1
        champs = {c: (ligne.get(c) or "").strip() for c in COLONNES_REQUISES}
        donnees, motif = _valider_ligne(champs, marchands_connus)
        if motif is not None:
            _rejeter(session, importation, numero_ligne, champs["reference"], motif)
            continue

        signature = tuple(donnees[c] for c in CHAMPS_COMPARES)
        existant = vues.get(donnees["reference"])
        if existant is None:
            en_base = session.scalar(
                select(Paiement).where(Paiement.reference == donnees["reference"])
            )
            if en_base is not None:
                existant = tuple(getattr(en_base, c) for c in CHAMPS_COMPARES)

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
        vues[donnees["reference"]] = signature
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