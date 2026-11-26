"""Journal d'audit des connexions et des imports.

Revision ID: 0004
Revises: 0003
"""

from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "journal_audit",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("type", sa.String(20), nullable=False),
        sa.Column("identifiant", sa.String(50), nullable=True),
        sa.Column("ip", sa.String(45), nullable=True),
        sa.Column("resultat", sa.String(10), nullable=False),
        sa.Column("details", sa.String(200), nullable=True),
    )
    op.create_index("ix_journal_audit_date", "journal_audit", ["date"])


def downgrade() -> None:
    op.drop_index("ix_journal_audit_date", table_name="journal_audit")
    op.drop_table("journal_audit")