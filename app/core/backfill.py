"""One-off/idempotent data migration run at startup: give legacy reviews and
analyses (created before hospital scoping existed) an org_id derived from
their patient, so hospital-scoped queries can still find them."""
from app.db import get_db


def backfill_org_ids() -> int:
    db = get_db()
    patient_org = {p["id"]: p.get("org_id") for p in db["patients"].find({}) if p.get("id")}
    fixed = 0
    for coll in ("reviews", "analyses"):
        for row in db[coll].find({}):
            org_id = patient_org.get(row.get("patient_id"))
            if not row.get("org_id") and org_id and row.get("id"):
                db[coll].update_one({"id": row["id"]}, {"$set": {"org_id": org_id}})
                fixed += 1
    return fixed
