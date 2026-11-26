from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Marchand(Base):
    __tablename__ = "marchands"

    code: Mapped[str] = mapped_column(String(10), primary_key=True)
    nom: Mapped[str] = mapped_column(String(100))


class Utilisateur(Base):
    __tablename__ = "utilisateurs"
    __table_args__ = (
        CheckConstraint("role IN ('ADMIN', 'MARCHAND')", name="ck_utilisateurs_role"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    identifiant: Mapped[str] = mapped_column(String(50), unique=True)
    role: Mapped[str] = mapped_column(String(10))
    code_marchand: Mapped[str | None] = mapped_column(ForeignKey("marchands.code"))
    mot_de_passe_hache: Mapped[str] = mapped_column(String(100))


class TentativeConnexion(Base):
    """Échecs de connexion par identifiant, y compris pour les identifiants inconnus.

    Une ligne par identifiant essayé : un compte qui n'existe pas se bloque exactement
    comme un compte réel, donc on ne peut pas deviner quels comptes existent.
    """

    __tablename__ = "tentatives_connexion"
    __table_args__ = (Index("ix_tentatives_derniere", "derniere_tentative"),)

    identifiant: Mapped[str] = mapped_column(String(50), primary_key=True)
    echecs: Mapped[int] = mapped_column(Integer)
    bloque_jusqua: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    derniere_tentative: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Paiement(Base):
    __tablename__ = "paiements"
    __table_args__ = (
        CheckConstraint(
            "statut IN ('CONFIRME', 'EN_ATTENTE', 'REFUSE')", name="ck_paiements_statut"
        ),
        # Index composite : toutes les requetes marchand filtrent par code + periode
        Index("ix_paiements_marchand_date", "code_marchand", "date_heure"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    reference: Mapped[str] = mapped_column(String(50), unique=True)
    date_heure: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    code_marchand: Mapped[str] = mapped_column(ForeignKey("marchands.code"))
    telephone_payeur: Mapped[str] = mapped_column(String(9))
    # Montants en FCFA : entiers uniquement, jamais de flottants
    montant: Mapped[int] = mapped_column(Integer)
    frais_reseau: Mapped[int | None] = mapped_column(Integer)
    commission: Mapped[int | None] = mapped_column(Integer)
    net: Mapped[int | None] = mapped_column(Integer)
    statut: Mapped[str] = mapped_column(String(15))


class Import(Base):
    __tablename__ = "imports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    auteur: Mapped[int] = mapped_column(ForeignKey("utilisateurs.id"))
    lignes_lues: Mapped[int] = mapped_column(Integer)
    lignes_importees: Mapped[int] = mapped_column(Integer)
    lignes_deja_presentes: Mapped[int] = mapped_column(Integer)
    lignes_rejetees: Mapped[int] = mapped_column(Integer)


class ImportLigne(Base):
    __tablename__ = "import_lignes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    import_id: Mapped[int] = mapped_column(ForeignKey("imports.id"))
    numero_ligne: Mapped[int] = mapped_column(Integer)
    reference: Mapped[str | None] = mapped_column(String(50))
    motif_rejet: Mapped[str | None] = mapped_column(String(200))