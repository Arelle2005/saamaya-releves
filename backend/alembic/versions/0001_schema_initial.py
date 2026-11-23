"""Schema initial : marchands, utilisateurs, paiements, imports, import_lignes.

Revision ID: 0001
Revises:
"""

from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "marchands",
        sa.Column("code", sa.String(10), primary_key=True),
        sa.Column("nom", sa.String(100), nullable=False),
    )
    op.create_table(
        "utilisateurs",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("identifiant", sa.String(50), nullable=False, unique=True),
        sa.Column("role", sa.String(10), nullable=False),
        sa.Column("code_marchand", sa.String(10), sa.ForeignKey("marchands.code")),
        sa.Column("mot_de_passe_hache", sa.String(100), nullable=False),
        sa.CheckConstraint("role IN ('ADMIN', 'MARCHAND')", name="ck_utilisateurs_role"),
    )
    op.create_table(
        "paiements",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("reference", sa.String(50), nullable=False, unique=True),
        sa.Column("date_heure", sa.DateTime(timezone=True), nullable=False),
        sa.Column("code_marchand", sa.String(10), sa.ForeignKey("marchands.code"), nullable=False),
        sa.Column("telephone_payeur", sa.String(9), nullable=False),
        sa.Column("montant", sa.Integer, nullable=False),
        sa.Column("frais_reseau", sa.Integer),
        sa.Column("commission", sa.Integer),
        sa.Column("net", sa.Integer),
        sa.Column("statut", sa.String(15), nullable=False),
        sa.CheckConstraint(
            "statut IN ('CONFIRME', 'EN_ATTENTE', 'REFUSE')", name="ck_paiements_statut"
        ),
    )
    op.create_index("ix_paiements_marchand_date", "paiements", ["code_marchand", "date_heure"])
    op.create_table(
        "imports",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("auteur", sa.Integer, sa.ForeignKey("utilisateurs.id"), nullable=False),
        sa.Column("lignes_lues", sa.Integer, nullable=False),
        sa.Column("lignes_importees", sa.Integer, nullable=False),
        sa.Column("lignes_deja_presentes", sa.Integer, nullable=False),
        sa.Column("lignes_rejetees", sa.Integer, nullable=False),
    )
    op.create_table(
        "import_lignes",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("import_id", sa.Integer, sa.ForeignKey("imports.id"), nullable=False),
        sa.Column("numero_ligne", sa.Integer, nullable=False),
        sa.Column("reference", sa.String(50)),
        sa.Column("motif_rejet", sa.String(200)),
    )


def downgrade() -> None:
    op.drop_table("import_lignes")
    op.drop_table("imports")
    op.drop_index("ix_paiements_marchand_date", table_name="paiements")
    op.drop_table("paiements")
    op.drop_table("utilisateurs")
    op.drop_table("marchands")
