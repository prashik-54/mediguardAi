"""
MongoDB connection layer.

Reads connection details from environment variables (see .env.example):
  MONGODB_URI   e.g. mongodb://localhost:27017  or a MongoDB Atlas SRV URI
  MONGODB_NAME  database name (default: ddi_framework)

If MongoDB cannot be reached (not installed / not running / bad URI), the
app does NOT crash. It falls back to a small in-memory store that mimics
the handful of PyMongo collection methods this project actually uses
(find, find_one, insert_one, update_one/upsert, delete_one, count_documents).
This keeps the API usable for local development even without Mongo installed
(data is lost on restart in that mode). Use a real MongoDB for anything that must persist.

The active mode is reported at GET /api/health as "database": "mongodb" | "in-memory".
"""
import os
import itertools
import threading
from typing import Any, Dict, List, Optional

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
MONGODB_NAME = os.getenv("MONGODB_NAME", "ddi_framework")

_client = None
_db = None
_mode = "unknown"


# ---------------------------------------------------------------------------
# In-memory fallback collection (subset of the PyMongo Collection API used
# by this project). Data does NOT persist across process restarts.
# ---------------------------------------------------------------------------
class _MemoryCollection:
    def __init__(self):
        self._rows: List[Dict[str, Any]] = []
        self._counter = itertools.count(1)

    @staticmethod
    def _matches(row: Dict[str, Any], query: Dict[str, Any]) -> bool:
        for key, expected in (query or {}).items():
            if isinstance(expected, dict) and "$in" in expected:
                if row.get(key) not in expected["$in"]:
                    return False
            elif row.get(key) != expected:
                return False
        return True

    def find_one(self, query: Dict[str, Any] = None, projection: Any = None) -> Optional[Dict[str, Any]]:
        for row in self._rows:
            if self._matches(row, query or {}):
                return dict(row)
        return None

    def find(self, query: Dict[str, Any] = None, projection: Any = None):
        return [dict(r) for r in self._rows if self._matches(r, query or {})]

    def insert_one(self, doc: Dict[str, Any]):
        doc = dict(doc)
        doc.setdefault("_seq", next(self._counter))
        self._rows.append(doc)
        return doc

    def update_one(self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False):
        s = (update or {}).get("$set", {})
        for row in self._rows:
            if self._matches(row, query):
                row.update(s)
                return {"matched": 1, "modified": 1}
        if upsert:
            new_doc = {**query, **s}
            self.insert_one(new_doc)
            return {"matched": 0, "modified": 0, "upserted": True}
        return {"matched": 0, "modified": 0}

    def delete_one(self, query: Dict[str, Any]):
        for i, row in enumerate(self._rows):
            if self._matches(row, query):
                del self._rows[i]
                return {"deleted": 1}
        return {"deleted": 0}

    def count_documents(self, query: Dict[str, Any] = None) -> int:
        return len(self.find(query or {}))

    def create_index(self, keys, **kwargs):
        """No-op in the in-memory fallback -- there is nothing to index,
        and unique constraints aren't enforced here. Real uniqueness (e.g.
        one user per email) is already checked in application code before
        insert (see UserStore.create), so this fallback never needs to
        reject a duplicate insert itself. Present only so callers can call
        `col.create_index(...)` the same way regardless of backend."""
        return f"memory-noop-{keys}"


class _MemoryDB:
    """Drop-in stand-in for a pymongo Database when Mongo is unreachable."""
    def __init__(self):
        self._collections: Dict[str, _MemoryCollection] = {}

    def __getitem__(self, name: str) -> _MemoryCollection:
        if name not in self._collections:
            self._collections[name] = _MemoryCollection()
        return self._collections[name]

    def __getattr__(self, name: str) -> _MemoryCollection:
        return self[name]


# ---------------------------------------------------------------------------
# Thin adapter around a real pymongo Collection so it behaves exactly like the
# in-memory collection above -- which is the contract the rest of the app was
# written against:
#   * documents come back as plain dicts WITHOUT Mongo's `_id` (an ObjectId is
#     not JSON serialisable and used to make every list/create endpoint answer
#     "500 Internal Server Error" on a real database),
#   * insert_one never mutates the caller's dict (pymongo injects `_id` into it),
#   * update_one / delete_one return plain dicts ({"deleted": n}, ...).
# ---------------------------------------------------------------------------
class _MongoCollection:
    def __init__(self, col):
        self._col = col

    @staticmethod
    def _projection(projection: Any) -> Dict[str, Any]:
        proj: Dict[str, Any] = {"_id": 0}
        if isinstance(projection, dict):
            proj.update({k: v for k, v in projection.items() if k != "_id"})
        return proj

    def find_one(self, query: Dict[str, Any] = None, projection: Any = None) -> Optional[Dict[str, Any]]:
        return self._col.find_one(query or {}, self._projection(projection))

    def find(self, query: Dict[str, Any] = None, projection: Any = None) -> List[Dict[str, Any]]:
        return list(self._col.find(query or {}, self._projection(projection)))

    def insert_one(self, doc: Dict[str, Any]) -> Dict[str, Any]:
        self._col.insert_one(dict(doc))  # copy: pymongo adds `_id` to what it is given
        return dict(doc)

    def update_one(self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False):
        res = self._col.update_one(query, update, upsert=upsert)
        return {"matched": res.matched_count, "modified": res.modified_count,
                "upserted": res.upserted_id is not None}

    def delete_one(self, query: Dict[str, Any]):
        return {"deleted": self._col.delete_one(query).deleted_count}

    def count_documents(self, query: Dict[str, Any] = None) -> int:
        return self._col.count_documents(query or {})

    def create_index(self, keys, **kwargs):
        return self._col.create_index(keys, **kwargs)


class _MongoDB:
    def __init__(self, database):
        self._database = database

    def __getitem__(self, name: str) -> _MongoCollection:
        return _MongoCollection(self._database[name])

    def __getattr__(self, name: str) -> _MongoCollection:
        if name.startswith("_"):
            raise AttributeError(name)
        return self[name]


_id_cache_lock = threading.Lock()
_id_cache: Dict[str, int] = {}


def next_id(col, prefix: str, width: int = 0, floor: int = 0) -> str:
    """Next identifier like ``ORG-101`` / ``RX-0004``: highest number already stored under
    `prefix`, plus one (never below `floor` + 1).

    Replaces the old ``count_documents() + 1`` and in-process counters, which produced duplicate ids after a
    delete or a server restart -- and, with the unique index on ``organizations.id``, a 500 on create.

    Scanning every document's `id` field on every single insert (the original implementation)
    is O(n) per insert -- O(n^2) overall as a collection grows, and on a real MongoDB each of
    those documents is a network round trip, which is what was making writes (and anything that
    triggers one, like audit logging on every request) slow. The highest number in use is cached
    in-process after the first scan for a given prefix, so every insert after that is O(1); a
    lock keeps concurrent inserts (FastAPI sync routes run in a thread pool) from racing on the
    same counter.
    """
    with _id_cache_lock:
        highest = _id_cache.get(prefix)
        if highest is None:
            highest = floor
            for row in col.find({}, {"id": 1}):
                rid = str(row.get("id") or "")
                if rid.startswith(prefix):
                    tail = rid[len(prefix):]
                    if tail.isdigit():
                        highest = max(highest, int(tail))
        highest += 1
        _id_cache[prefix] = highest
    return f"{prefix}{highest:0{width}d}" if width else f"{prefix}{highest}"


def get_db():
    """Returns a Mongo-like database handle, connecting lazily on first use."""
    global _client, _db, _mode
    if _db is not None:
        return _db

    try:
        from pymongo import MongoClient

        kwargs: Dict[str, Any] = {"serverSelectionTimeoutMS": 8000}
        # Atlas (mongodb+srv://) needs TLS. On some systems (notably Windows)
        # the OS certificate store is out of date and the TLS handshake fails
        # with a certificate verification error unless we hand pymongo a
        # trusted CA bundle explicitly via certifi.
        if MONGODB_URI.startswith("mongodb+srv://") or "mongodb.net" in MONGODB_URI:
            try:
                import certifi

                kwargs["tlsCAFile"] = certifi.where()
            except ImportError:
                pass  # certifi not installed; fall back to system CAs

        _client = MongoClient(MONGODB_URI, **kwargs)
        _client.admin.command("ping")
        _db = _MongoDB(_client[MONGODB_NAME])
        _mode = "mongodb"
        print(f"[MongoDB] Connected -> {MONGODB_URI} / db='{MONGODB_NAME}'")
    except Exception as exc:  # pymongo missing, or Mongo unreachable
        # Print the FULL reason loudly instead of swallowing it, so a bad
        # URI / missing dependency / firewall issue is obvious in the logs
        # instead of silently downgrading to in-memory storage.
        print("=" * 70)
        print("[MongoDB] COULD NOT CONNECT -- falling back to in-memory storage.")
        print(f"[MongoDB] URI tried: {MONGODB_URI}")
        print(f"[MongoDB] Reason: {type(exc).__name__}: {exc}")
        print("[MongoDB] Common fixes:")
        print("  - Did you create a .env file (copied from .env.example) at the")
        print("    project root, with your real MONGODB_URI in it?")
        print("  - In Atlas -> Network Access, did you allow access from")
        print("    anywhere (0.0.0.0/0)?")
        print("  - Is 'dnspython' and 'certifi' installed? (pip install -r requirements.txt)")
        print("=" * 70)
        _db = _MemoryDB()
        _mode = "in-memory"

    return _db


def db_mode() -> str:
    get_db()
    return _mode


# ---------------------------------------------------------------------------
# Index creation for the domain-foundation collections (CLAUDE.md Phase 1:
# "Add indexes/unique constraints where appropriate"). Every call is wrapped
# individually so one unsupported/duplicate index definition never blocks
# the rest -- same defensive style as app.seed.run_seed(). Safe to call
# every startup: create_index is idempotent for an identical definition.
# ---------------------------------------------------------------------------
def ensure_indexes() -> None:
    db = get_db()

    def _try(collection: str, keys, **kwargs):
        try:
            db[collection].create_index(keys, **kwargs)
        except Exception as exc:  # missing pymongo feature, unsupported in fallback, etc.
            print(f"[MongoDB] Skipped index {collection}:{keys} ({type(exc).__name__}: {exc})")

    _try("users", "email", unique=True)
    _try("users", "id", unique=True)  # hot path: get_by_id() on every audit/actor lookup
    _try("users", "org_id")
    _try("organizations", "id", unique=True)
    _try("patients", "id", unique=True)
    _try("patients", "org_id")
    _try("appointments", "id", unique=True)
    _try("appointments", "org_id")
    _try("appointments", [("doctor_id", 1), ("appointment_date", 1)])
    _try("appointments", "patient_id")
    _try("encounters", "id", unique=True)
    _try("encounters", "appointment_id")
    _try("encounters", "doctor_id")
    _try("encounters", "patient_id")
    _try("prescriptions", "id", unique=True)
    _try("prescriptions", "encounter_id")
    _try("prescriptions", "patient_id")
    _try("ddi_analyses", "id", unique=True)
    _try("ddi_analyses", "prescription_id")
    _try("ddi_analyses", "encounter_id")
    _try("doctor_decisions", "id", unique=True)
    _try("doctor_decisions", "prescription_id")
    _try("reports", "id", unique=True)
    _try("reports", "patient_id")
    _try("reports", "org_id")
    _try("pharmacy_orders", "id", unique=True)
    _try("pharmacy_orders", "org_id")
    _try("pharmacy_orders", "pharmacist_id")
    _try("dispensing_records", "id", unique=True)
    _try("dispensing_records", "pharmacy_order_id")
    _try("notifications", "id", unique=True)
    _try("notifications", "recipient_user_id")
    _try("notifications", "group")
    _try("analyses", "id", unique=True)
    _try("analyses", "patient_id")
    _try("analyses", "org_id")
    _try("reviews", "id", unique=True)
    _try("audit_logs", "id", unique=True)
    _try("audit_logs", "org_id")
    _try("audit_logs", [("resource_type", 1), ("resource_id", 1)])
    _try("audit_logs", "actor_user_id")
