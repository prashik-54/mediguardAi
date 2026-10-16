"""
Shared pytest setup.

Forces `app.db.get_db()` to fall back to the in-memory store deterministically,
regardless of whether a real MongoDB happens to be reachable on the machine
running the tests. Port 1 is a privileged, essentially-never-bound port, so
pymongo's connection attempt fails fast (immediate refusal) instead of
running the full 8s server-selection timeout, and the test suite never
reads/writes a real database.

This must run before anything imports `app.db` (which lazily connects and
caches the connection on first use), so it lives in conftest.py and is
collected by pytest before any test module.
"""
import os

os.environ["MONGODB_URI"] = "mongodb://127.0.0.1:1/"
os.environ["MONGODB_NAME"] = "ddi_framework_test"
# The DDI CSVs are not in the repo, so tests run on the built-in reference interaction map.

import pytest  # noqa: E402

from app.db import get_db  # noqa: E402


@pytest.fixture(autouse=True)
def _isolated_collections():
    """Truncate every collection this test suite touches before each test,
    so CRUD/relationship tests never see state left over from a previous
    test. IDs are allocated as (highest stored number + 1), so a clean collection
    keeps them predictable within a single test."""
    db = get_db()
    names = [
        "users", "organizations", "patients", "reviews", "notifications", "analyses",
        "appointments", "encounters", "prescriptions", "ddi_analyses", "doctor_decisions",
        "reports", "pharmacy_orders", "dispensing_records", "audit_logs",
    ]
    for name in names:
        col = db[name]
        for row in col.find({}):
            col.delete_one({"id": row.get("id")}) if "id" in row else None
    yield
