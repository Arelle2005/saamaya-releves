"""Paiements, relevé et export CSV du marchand. Le code marchand vient toujours du JWT."""

import csv
import io
from datetime import date, datetime, time
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, field_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.deps import get_session, marchand_isole
from app.masquage import masquer_telephone
from app.models import Paiement, Utilisateur

router = APIRouter(tags=["relevés"])

DOUALA = ZoneInfo("Africa/Douala")
PAR_PAGE = 20
STATUTS_VALIDES = {"CONFIRME", "EN_ATTENTE", "REFUSE"}


def bornes_periode(du: date, au: date) -> tuple[datetime, datetime]:
    if du > au:
        raise HTTPException(
            status_code=400, detail="La date « du » doit être antérieure ou égale à la date « au »."
        )
    if (au - du).days > 90:
        raise HTTPException(status_code=400, detail="La période ne peut pas dépasser 90 jours.")
    # Bornes incluses en heure Africa/Douala ; time.max couvre toute la dernière seconde
    debut = datetime.combine(du, time.min, tzinfo=DOUALA)
    fin = datetime.combine(au, time.max, tzinfo=DOUALA)
    return debut, fin


def _filtres(marchand: Utilisateur, debut: datetime, fin: datetime):
    return (
        Paiement.code_marchand == marchand.code_marchand,
        Paiement.date_heure >= debut,
        Paiement.date_heure <= fin,
    )


class PaiementReponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    date_heure: datetime
    reference: str
    telephone_payeur: str
    montant: int
    frais_reseau: int | None
    commission: int | None
    net: int | None
    statut: str

    # Masquage garanti à la frontière de sérialisation, quel que soit l'appelant
    @field_validator("telephone_payeur")
    @classmethod
    def masquer(cls, valeur: str) -> str:
        return masquer_telephone(valeur)


class PagePaiements(BaseModel):
    page: int
    pages: int
    total: int
    par_page: int
    paiements: list[PaiementReponse]


class ReleveReponse(BaseModel):
    du: date
    au: date
    nb_confirmes: int
    brut: int
    frais: int
    commission: int
    net: int


def _totaux(session: Session, marchand: Utilisateur, debut: datetime, fin: datetime) -> ReleveReponse:
    # Une seule requête d'agrégation, uniquement sur les CONFIRME
    ligne = session.execute(
        select(
            func.count(Paiement.id),
            func.coalesce(func.sum(Paiement.montant), 0),
            func.coalesce(func.sum(Paiement.frais_reseau), 0),
            func.coalesce(func.sum(Paiement.commission), 0),
            func.coalesce(func.sum(Paiement.net), 0),
        ).where(*_filtres(marchand, debut, fin), Paiement.statut == "CONFIRME")
    ).one()
    return ReleveReponse(
        du=debut.date(), au=fin.date(),
        nb_confirmes=ligne[0], brut=ligne[1], frais=ligne[2],
        commission=ligne[3], net=ligne[4],
    )


@router.get("/paiements", response_model=PagePaiements)
def paiements(
    du: date,
    au: date,
    statut: str | None = None,
    page: int = Query(1, ge=1),
    session: Session = Depends(get_session),
    marchand: Utilisateur = Depends(marchand_isole),
):
    debut, fin = bornes_periode(du, au)
    if statut is not None and statut not in STATUTS_VALIDES:
        raise HTTPException(
            status_code=400, detail="Statut invalide (CONFIRME, EN_ATTENTE ou REFUSE attendu)."
        )
    conditions = list(_filtres(marchand, debut, fin))
    if statut is not None:
        conditions.append(Paiement.statut == statut)

    total = session.scalar(select(func.count(Paiement.id)).where(*conditions))
    lignes = session.scalars(
        select(Paiement)
        .where(*conditions)
        .order_by(Paiement.date_heure.desc(), Paiement.id.desc())
        .offset((page - 1) * PAR_PAGE)
        .limit(PAR_PAGE)
    ).all()
    return PagePaiements(
        page=page,
        pages=(total + PAR_PAGE - 1) // PAR_PAGE,
        total=total,
        par_page=PAR_PAGE,
        paiements=[PaiementReponse.model_validate(p) for p in lignes],
    )


@router.get("/releve", response_model=ReleveReponse)
def releve(
    du: date,
    au: date,
    session: Session = Depends(get_session),
    marchand: Utilisateur = Depends(marchand_isole),
):
    debut, fin = bornes_periode(du, au)
    return _totaux(session, marchand, debut, fin)


COLONNES_CSV = [
    "date_heure", "reference", "telephone_payeur", "montant",
    "frais_reseau", "commission", "net", "statut",
]


def _generateur_csv(lignes: list[Paiement], totaux: ReleveReponse):
    tampon = io.StringIO()
    ecrivain = csv.writer(tampon)

    def produire() -> str:
        valeur = tampon.getvalue()
        tampon.seek(0)
        tampon.truncate(0)
        return valeur

    yield "\ufeff"  # BOM UTF-8 : Excel affiche correctement les accents
    ecrivain.writerow(COLONNES_CSV)
    yield produire()
    for p in lignes:
        ecrivain.writerow([
            p.date_heure.astimezone(DOUALA).isoformat(),
            p.reference,
            masquer_telephone(p.telephone_payeur),
            p.montant,
            p.frais_reseau if p.frais_reseau is not None else "",
            p.commission if p.commission is not None else "",
            p.net if p.net is not None else "",
            p.statut,
        ])
        yield produire()
    ecrivain.writerow([
        f"TOTAUX ({totaux.nb_confirmes} confirmés)", "", "",
        totaux.brut, totaux.frais, totaux.commission, totaux.net, "",
    ])
    yield produire()


@router.get("/releve/export")
def exporter_releve(
    du: date,
    au: date,
    session: Session = Depends(get_session),
    marchand: Utilisateur = Depends(marchand_isole),
):
    debut, fin = bornes_periode(du, au)
    totaux = _totaux(session, marchand, debut, fin)
    # Période ≤ 90 jours : volume borné, on charge les lignes puis on stream le CSV
    lignes = session.scalars(
        select(Paiement)
        .where(*_filtres(marchand, debut, fin))
        .order_by(Paiement.date_heure, Paiement.id)
    ).all()
    nom = f"releve_{marchand.code_marchand}_{du.isoformat()}_{au.isoformat()}.csv"
    return StreamingResponse(
        _generateur_csv(lignes, totaux),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{nom}"'},
    )