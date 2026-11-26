"""Limitation des tentatives de connexion : 5 échecs, puis blocage de 15 minutes.

Principe : on COMPTE la tentative AVANT de vérifier le mot de passe, en une seule
instruction SQL atomique (INSERT ... ON CONFLICT DO UPDATE). Conséquences :
- deux requêtes simultanées ne peuvent pas se partager le même numéro de tentative ;
- au plus 5 mots de passe sont vérifiés par période, même sous une rafale de requêtes ;
- un identifiant inconnu est compté et bloqué comme un compte réel (pas d'énumération).
"""

import math
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, case, delete, not_, or_
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models import TentativeConnexion

MAX_TENTATIVES = 5
DUREE_BLOCAGE = timedelta(minutes=15)
# Un compteur inactif depuis plus de 24 h est oublié (et les vieilles lignes sont purgées,
# pour que des identifiants inventés n'encombrent pas la table)
FENETRE_OUBLI = timedelta(hours=24)


@dataclass(frozen=True)
class EtatTentatives:
    echecs: int  # numéro de CETTE tentative dans la série en cours
    bloque_jusqua: datetime | None

    @property
    def verification_autorisee(self) -> bool:
        # Les tentatives 1 à 5 sont vérifiées ; à partir de la 6e, le compte est bloqué
        return self.echecs <= MAX_TENTATIVES

    @property
    def derniere_autorisee(self) -> bool:
        return self.echecs == MAX_TENTATIVES


def secondes_restantes(bloque_jusqua: datetime | None, maintenant: datetime | None = None) -> int:
    maintenant = maintenant or datetime.now(timezone.utc)
    if bloque_jusqua is None:
        return int(DUREE_BLOCAGE.total_seconds())
    return max(1, math.ceil((bloque_jusqua - maintenant).total_seconds()))


def minutes_restantes(bloque_jusqua: datetime | None, maintenant: datetime | None = None) -> int:
    return max(1, math.ceil(secondes_restantes(bloque_jusqua, maintenant) / 60))


def compter_tentative(
    session: Session, identifiant: str, maintenant: datetime | None = None
) -> EtatTentatives:
    maintenant = maintenant or datetime.now(timezone.utc)
    t = TentativeConnexion.__table__

    # Trois situations pour la ligne existante de cet identifiant :
    actif = and_(t.c.bloque_jusqua.is_not(None), t.c.bloque_jusqua > maintenant)  # bloqué
    expire = and_(t.c.bloque_jusqua.is_not(None), t.c.bloque_jusqua <= maintenant)  # blocage fini
    perime = and_(t.c.derniere_tentative < maintenant - FENETRE_OUBLI, not_(actif))  # oublié

    # Nouveau numéro de tentative : on repart de 1 si le blocage est fini ou le compteur périmé.
    # Pendant un blocage actif, on continue de compter (6, 7, 8...) sans toucher à la date de fin :
    # des tentatives pendant le blocage ne le prolongent pas.
    nouveau = case((or_(expire, perime), 1), else_=t.c.echecs + 1)
    bloque = case(
        (actif, t.c.bloque_jusqua),
        (nouveau >= MAX_TENTATIVES, maintenant + DUREE_BLOCAGE),
        else_=None,
    )

    requete = (
        pg_insert(t)
        .values(
            identifiant=identifiant,
            echecs=1,
            bloque_jusqua=maintenant + DUREE_BLOCAGE if 1 >= MAX_TENTATIVES else None,
            derniere_tentative=maintenant,
        )
        .on_conflict_do_update(
            index_elements=[t.c.identifiant],
            set_={"echecs": nouveau, "bloque_jusqua": bloque, "derniere_tentative": maintenant},
        )
        .returning(t.c.echecs, t.c.bloque_jusqua)
    )
    ligne = session.execute(requete).one()

    # Purge des lignes inactives depuis plus de 24 h et non bloquées
    session.execute(
        delete(t).where(
            t.c.derniere_tentative < maintenant - FENETRE_OUBLI,
            or_(t.c.bloque_jusqua.is_(None), t.c.bloque_jusqua < maintenant),
        )
    )
    # Commit immédiat : la tentative est comptée AVANT la vérification du mot de passe
    session.commit()
    return EtatTentatives(echecs=ligne.echecs, bloque_jusqua=ligne.bloque_jusqua)


def effacer(session: Session, identifiant: str) -> None:
    """Connexion réussie : la série d'échecs repart de zéro."""
    session.execute(
        delete(TentativeConnexion.__table__).where(
            TentativeConnexion.__table__.c.identifiant == identifiant
        )
    )
    session.commit()