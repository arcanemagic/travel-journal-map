"""fix null dates

Revision ID: fix_null_dates
Revises: fix_trip_dates
Create Date: 2024-01-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from datetime import datetime


# revision identifiers, used by Alembic.
revision = 'fix_null_dates'
down_revision = 'fix_trip_dates'
branch_labels = None
depends_on = None


def upgrade():
    # Get database connection
    connection = op.get_bind()
    
    # Update all existing trips to have a created_at timestamp if it's NULL
    now = datetime.utcnow()
    connection.execute(sa.text("UPDATE trip SET created_at = :now WHERE created_at IS NULL"), {'now': now})


def downgrade():
    pass
