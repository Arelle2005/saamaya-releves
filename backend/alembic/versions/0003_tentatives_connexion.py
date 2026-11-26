"""Limitation des connexions par identifiant (comptes inconnus inclus).

Remplace les colonnes tentatives_echouees et bloque_jusqua de la table utilisateurs
par une table tentatives_connexion indexée par identifiant.

Revision ID: 0003
Revises: 0002
"""

from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tentatives_connexion",
        sa.Column("identifiant", sa.String(50), primary_key=True),
        sa.Column("echecs", sa.Integer, nullable=False),
        sa.Column("bloque_jusqua", sa.DateTime(timezone=True), nullable=True),
        sa.Column("derniere_tentative", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_tentatives_derniere", "tentatives_connexion", ["derniere_tentative"])
    op.drop_column("utilisateurs", "bloque_jusqua")
    op.drop_column("utilisateurs", "tentatives_echouees")


def downgrade() -> None:
    op.add_column(
        "utilisateurs",
        sa.Column("tentatives_echouees", sa.Integer, nullable=False, server_default="0"),
    )
    op.add_column(
        "utilisateurs",
        sa.Column("bloque_jusqua", sa.DateTime(timezone=True), nullable=True),
    )
    op.drop_index("ix_tentatives_derniere", table_name="tentatives_connexion")
    op.drop_table("tentatives_connexion")