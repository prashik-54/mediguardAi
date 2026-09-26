"""Runtime settings.

Everything here is read lazily from the environment so tests and operators can flip a switch
without re-importing modules. The platform always behaves like a production system: there is no
demo mode, no seeded accounts and no shared password.

  APP_ENV                 development (default) | production. In production the server refuses to
                          start on the default JWT secret (see module_auth).
  BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD / BOOTSTRAP_ADMIN_NAME
                          Optional. When both email and password are set and the `users`
                          collection is empty, a single real Platform Admin account is created
                          from these values at startup. This is how a fresh deployment gets its
                          first sign-in, since "admin" and "administrator" accounts can never be
                          self-registered. Safe to leave set permanently - it only fires once,
                          against an empty database.
"""
import os


def app_env() -> str:
    return os.getenv("APP_ENV", "development").strip().lower() or "development"


def is_production() -> bool:
    return app_env() == "production"


def bootstrap_admin_credentials():
    """Returns (name, email, password) from the environment, or None if not configured."""
    email = (os.getenv("BOOTSTRAP_ADMIN_EMAIL") or "").strip()
    password = os.getenv("BOOTSTRAP_ADMIN_PASSWORD") or ""
    if not email or not password:
        return None
    name = (os.getenv("BOOTSTRAP_ADMIN_NAME") or "Platform Admin").strip()
    return name, email, password
