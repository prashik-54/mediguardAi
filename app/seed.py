"""
First-account bootstrap.

A brand-new deployment has no users, and "admin" (Platform Admin) / "administrator" (Hospital
Administrator) accounts can never be self-registered. Set BOOTSTRAP_ADMIN_EMAIL and
BOOTSTRAP_ADMIN_PASSWORD (see .env.example) and one real Platform Admin is created at startup.
No hospital, patients or other sample records are ever created.
"""
from app.core.settings import bootstrap_admin_credentials
from app.modules.module_auth import user_store


def run_bootstrap_admin():
    """Creates exactly one Platform Admin from BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD when the
    `users` collection is empty. A no-op once any user exists."""
    creds = bootstrap_admin_credentials()
    if not creds:
        return
    if user_store.list_all():
        return
    name, email, password = creds
    user_store.create(name, email, password, "admin")
    print(f"[Bootstrap] Created the first Platform Admin account ({email}).")
