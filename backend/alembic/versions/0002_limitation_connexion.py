"""Ajout des colonnes de limitation des tentatives de connexion.

Revision ID: 0002
Revises: 0001
"""

from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "utilisateurs",
        sa.Column("tentatives_echouees", sa.Integer, nullable=False, server_default="0"),
    )
    op.add_column(
        "utilisateurs",
        sa.Column("bloque_jusqua", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("utilisateurs", "bloque_jusqua")
    op.drop_column("utilisateurs", "tentatives_echouees")