"""Journal d'audit : qui s'est connecté (ou a essayé), qui a importé quoi, quand, depuis quelle adresse.

- Écriture : `enregistrer`, appelée par la connexion et par l'import.
- Lecture : GET /audit, réservé à l'administrateur.
Aucun mot de passe n'est jamais écrit dans le journal.
"""

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.deps import admin_requis, get_session
from app.erreurs import ErreurReponse
from app.models import JournalAudit, Utilisateur

router = APIRouter(prefix="/audit", tags=["audit"])

CONNEXION = "CONNEXION"
IMPORT = "IMPORT"
TYPES = {CONNEXION, IMPORT}

SUCCES = "SUCCES"
ECHEC = "ECHEC"
BLOQUE = "BLOQUE"
RESULTATS = {SUCCES, ECHEC, BLOQUE}

PAR_PAGE = 50


def adresse_ip(request: Request) -> str | None:
    """Adresse de l'appelant (derrière un proxy, uvicorn la lit dans X-Forwarded-For si configuré)."""
    return request.client.host if request.client else None


def enregistrer(
    session: Session,
    type_: str,
    identifiant: str | None,
    resultat: str,
    ip: str | None,
    details: str | None = None,
) -> None:
    session.add(
        JournalAudit(
            date=datetime.now(timezone.utc),
            type=type_,
            # Tailles de colonnes respectées : un identifiant ou un détail trop long ne casse rien
            identifiant=(identifiant or "")[:50] or None,
            ip=ip[:45] if ip else None,
            resultat=resultat,
            details=details[:200] if details else None,
        )
    )
    session.commit()


class EvenementAudit(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    date: datetime = Field(description="Date et heure de l'événement (UTC).")
    type: str = Field(description="CONNEXION ou IMPORT.")
    identifiant: str | None = Field(description="Identifiant saisi (connexion) ou administrateur (import).")
    ip: str | None = Field(description="Adresse de l'appelant.")
    resultat: str = Field(description="SUCCES, ECHEC ou BLOQUE.")
    details: str | None = Field(description="Précision en français (cause de l'échec, bilan de l'import).")


class PageAudit(BaseModel):
    page: int
    pages: int
    total: int
    par_page: int
    evenements: list[EvenementAudit]


@router.get(
    "",
    response_model=PageAudit,
    summary="Journal d'audit",
    description=(
        "Connexions (réussies, échouées, bloquées) et imports, du plus récent au plus ancien, "
        f"{PAR_PAGE} par page. Filtres facultatifs : `type` (CONNEXION, IMPORT) et "
        "`resultat` (SUCCES, ECHEC, BLOQUE)."
    ),
    responses={
        400: {"model": ErreurReponse, "description": "Filtre inconnu ou numéro de page invalide."},
        401: {"model": ErreurReponse, "description": "Non authentifié : jeton absent, invalide ou expiré."},
        403: {"model": ErreurReponse, "description": "Accès refusé : route réservée au rôle ADMIN."},
    },
)
def lire_journal(
    type: Annotated[str | None, Query(description="CONNEXION ou IMPORT.", examples=["CONNEXION"])] = None,
    resultat: Annotated[str | None, Query(description="SUCCES, ECHEC ou BLOQUE.", examples=["ECHEC"])] = None,
    page: Annotated[int, Query(ge=1, description="Numéro de page, à partir de 1.")] = 1,
    session: Session = Depends(get_session),
    admin: Utilisateur = Depends(admin_requis),
):
    if type is not None and type not in TYPES:
        raise HTTPException(status_code=400, detail="Type invalide (CONNEXION ou IMPORT attendu).")
    if resultat is not None and resultat not in RESULTATS:
        raise HTTPException(status_code=400, detail="Résultat invalide (SUCCES, ECHEC ou BLOQUE attendu).")

    conditions = []
    if type is not None:
        conditions.append(JournalAudit.type == type)
    if resultat is not None:
        conditions.append(JournalAudit.resultat == resultat)

    total = session.scalar(select(func.count(JournalAudit.id)).where(*conditions))
    lignes = session.scalars(
        select(JournalAudit)
        .where(*conditions)
        .order_by(JournalAudit.date.desc(), JournalAudit.id.desc())
        .offset((page - 1) * PAR_PAGE)
        .limit(PAR_PAGE)
    ).all()
    return PageAudit(
        page=page,
        pages=(total + PAR_PAGE - 1) // PAR_PAGE,
        total=total,
        par_page=PAR_PAGE,
        evenements=[EvenementAudit.model_validate(ligne) for ligne in lignes],
    )