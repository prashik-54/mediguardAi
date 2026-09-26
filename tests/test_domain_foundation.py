"""
Phase 1 tests: CRUD + relationships for every new domain-foundation store,
plus a regression check that the pre-existing group-based notification path
(module6) still works after adding the recipient-based path.

Run with (from the repository root, with requirements.txt + pytest
installed):

    pip install -r requirements.txt pytest
    pytest tests/test_domain_foundation.py -v

These exercise the store/service layer directly -- there are no new HTTP
routes in this phase (see each new module's docstring), so there is
nothing to hit with a TestClient yet. Route-level tests belong to the
phases that actually add the routes (Phase 2 onward).
"""
from app.modules.module8_appointments import appointment_store, AppointmentCreate
from app.modules.module9_encounters import encounter_store, EncounterCreate, EncounterUpdate
from app.modules.module10_prescriptions import prescription_store, PrescriptionCreate, PrescriptionItemIn
from app.modules.module11_ddi_analysis import ddi_analysis_store, DDIAnalysisCreate
from app.modules.module12_doctor_decision import doctor_decision_store, DoctorDecisionCreate
from app.modules.module13_reports import report_store, ReportCreate, build_patient_view
from app.modules.module14_pharmacy import (
    pharmacy_order_store, PharmacyOrderCreate, dispensing_store, DispensingCreate,
)
from app.modules.module15_audit import audit_log_store
from app.modules.module6_notifications import notification_store
from app.modules.module5_reviews import review_store
from app.modules.module7_analyses import analysis_store

ORG_ID = "ORG-1"
PATIENT_ID = "P-001"
DOCTOR_ID = "U-101"
ADMIN_ID = "U-104"
PHARMACIST_ID = "U-102"


# --------------------------------------------------------------- appointment
def test_appointment_crud_and_queue_numbering():
    a1 = appointment_store.create(
        AppointmentCreate(patient_id=PATIENT_ID, doctor_id=DOCTOR_ID, reason="Fever",
                           appointment_date="2026-10-01", appointment_time="10:00"),
        org_id=ORG_ID, created_by=ADMIN_ID,
    )
    assert a1["status"] == "Scheduled"
    assert a1["queue_number"] == 1
    assert a1["org_id"] == ORG_ID

    a2 = appointment_store.create(
        AppointmentCreate(patient_id="P-002", doctor_id=DOCTOR_ID, reason="Follow-up",
                           appointment_date="2026-10-01"),
        org_id=ORG_ID, created_by=ADMIN_ID,
    )
    assert a2["queue_number"] == 2  # same org + date -> increments

    fetched = appointment_store.get(a1["id"])
    assert fetched["id"] == a1["id"]

    for_doctor = appointment_store.list_for_doctor(DOCTOR_ID, org_id=ORG_ID)
    assert {row["id"] for row in for_doctor} == {a1["id"], a2["id"]}

    for_patient = appointment_store.list_for_patient(PATIENT_ID)
    assert len(for_patient) == 1

    updated = appointment_store.update_status(a1["id"], "Checked In")
    assert updated["status"] == "Checked In"

    open_only = appointment_store.list_for_doctor(DOCTOR_ID, org_id=ORG_ID, open_only=True)
    assert len(open_only) == 2  # "Checked In" and "Scheduled" are both open


def test_appointment_rejects_invalid_status():
    a = appointment_store.create(
        AppointmentCreate(patient_id=PATIENT_ID, doctor_id=DOCTOR_ID, reason="Checkup",
                           appointment_date="2026-10-02"),
        org_id=ORG_ID, created_by=ADMIN_ID,
    )
    try:
        appointment_store.update_status(a["id"], "Not A Real Status")
        assert False, "expected ValueError"
    except ValueError:
        pass


# ----------------------------------------------------------------- encounter
def test_encounter_lifecycle_linked_to_appointment():
    appt = appointment_store.create(
        AppointmentCreate(patient_id=PATIENT_ID, doctor_id=DOCTOR_ID, reason="Cough",
                           appointment_date="2026-10-03"),
        org_id=ORG_ID, created_by=ADMIN_ID,
    )
    enc = encounter_store.create(
        EncounterCreate(appointment_id=appt["id"], patient_id=PATIENT_ID, doctor_id=DOCTOR_ID),
        org_id=ORG_ID,
    )
    assert enc["status"] == "In Progress"
    assert enc["appointment_id"] == appt["id"]
    assert encounter_store.get_for_appointment(appt["id"])["id"] == enc["id"]

    updated = encounter_store.update(enc["id"], EncounterUpdate(diagnosis="Viral URI", notes="Mild symptoms"))
    assert updated["diagnosis"] == "Viral URI"
    assert updated["notes"] == "Mild symptoms"

    completed = encounter_store.complete(enc["id"])
    assert completed["status"] == "Completed"
    assert completed["completed_at"] is not None

    assert len(encounter_store.list_for_doctor(DOCTOR_ID, org_id=ORG_ID)) == 1
    assert len(encounter_store.list_for_patient(PATIENT_ID)) == 1


# -------------------------------------------------------------- prescription
def _make_encounter():
    appt = appointment_store.create(
        AppointmentCreate(patient_id=PATIENT_ID, doctor_id=DOCTOR_ID, reason="Diabetes review",
                           appointment_date="2026-10-04"),
        org_id=ORG_ID, created_by=ADMIN_ID,
    )
    return encounter_store.create(
        EncounterCreate(appointment_id=appt["id"], patient_id=PATIENT_ID, doctor_id=DOCTOR_ID),
        org_id=ORG_ID,
    )


def test_prescription_items_versioning_and_finalize():
    enc = _make_encounter()
    rx = prescription_store.create(
        PrescriptionCreate(
            encounter_id=enc["id"], patient_id=PATIENT_ID, doctor_id=DOCTOR_ID,
            items=[PrescriptionItemIn(medicine_name="Metformin", dose="500", unit="mg", frequency="Twice daily")],
        ),
        org_id=ORG_ID,
    )
    assert rx["version"] == 1
    assert rx["status"] == "Draft"
    assert len(rx["items"]) == 1
    assert rx["items"][0]["prescription_id"] == rx["id"]
    assert rx["items"][0]["id"]  # each item is independently addressable

    under_review = prescription_store.update_status(rx["id"], "Under DDI Review")
    assert under_review["status"] == "Under DDI Review"

    # High-severity DDI result -> doctor revises -> new version, same encounter.
    revised = prescription_store.new_version(rx["id"])
    assert revised["version"] == 2
    assert revised["encounter_id"] == enc["id"]
    assert revised["id"] != rx["id"]
    assert prescription_store.get(rx["id"])["status"] == "Cancelled"

    finalized = prescription_store.finalize(revised["id"])
    assert finalized["status"] == "Finalized"
    assert finalized["finalized_at"] is not None

    versions = prescription_store.list_for_encounter(enc["id"])
    assert [v["version"] for v in versions] == [2, 1]  # newest first


def test_prescription_set_items_replaces_list():
    enc = _make_encounter()
    rx = prescription_store.create(
        PrescriptionCreate(encounter_id=enc["id"], patient_id=PATIENT_ID, doctor_id=DOCTOR_ID, items=[]),
        org_id=ORG_ID,
    )
    assert rx["items"] == []
    updated = prescription_store.set_items(rx["id"], [
        PrescriptionItemIn(medicine_name="Aspirin", dose="75", unit="mg"),
        PrescriptionItemIn(medicine_name="Atorvastatin", dose="10", unit="mg"),
    ])
    assert len(updated["items"]) == 2
    assert {i["medicine_name"] for i in updated["items"]} == {"Aspirin", "Atorvastatin"}


# ----------------------------------------------------------- ddi + decision
def test_ddi_analysis_and_doctor_decision_link_to_prescription():
    enc = _make_encounter()
    rx = prescription_store.create(
        PrescriptionCreate(
            encounter_id=enc["id"], patient_id=PATIENT_ID, doctor_id=DOCTOR_ID,
            items=[PrescriptionItemIn(medicine_name="Warfarin"), PrescriptionItemIn(medicine_name="Aspirin")],
        ),
        org_id=ORG_ID,
    )
    analysis = ddi_analysis_store.record(
        DDIAnalysisCreate(
            encounter_id=enc["id"], prescription_id=rx["id"], patient_id=PATIENT_ID, doctor_id=DOCTOR_ID,
            pairs=[{"a": "warfarin", "b": "aspirin", "severity": "High"}],
            overall_severity="High", patient_factors=["Age > 65"],
        ),
        org_id=ORG_ID,
    )
    assert analysis["overall_severity"] == "High"
    assert ddi_analysis_store.latest_for_prescription(rx["id"])["id"] == analysis["id"]
    assert len(ddi_analysis_store.list_for_encounter(enc["id"])) == 1

    decision = doctor_decision_store.create(
        DoctorDecisionCreate(
            encounter_id=enc["id"], prescription_id=rx["id"], doctor_id=DOCTOR_ID,
            analysis_id=analysis["id"], decision="Revise Prescription", reason="Bleeding risk too high",
        ),
        org_id=ORG_ID,
    )
    assert decision["analysis_id"] == analysis["id"]
    assert doctor_decision_store.list_for_prescription(rx["id"])[0]["id"] == decision["id"]


def test_doctor_decision_rejects_invalid_decision_value():
    enc = _make_encounter()
    rx = prescription_store.create(
        PrescriptionCreate(encounter_id=enc["id"], patient_id=PATIENT_ID, doctor_id=DOCTOR_ID),
        org_id=ORG_ID,
    )
    analysis = ddi_analysis_store.record(
        DDIAnalysisCreate(encounter_id=enc["id"], prescription_id=rx["id"], patient_id=PATIENT_ID, doctor_id=DOCTOR_ID),
        org_id=ORG_ID,
    )
    try:
        doctor_decision_store.create(
            DoctorDecisionCreate(encounter_id=enc["id"], prescription_id=rx["id"], doctor_id=DOCTOR_ID,
                                  analysis_id=analysis["id"], decision="Do Whatever"),
            org_id=ORG_ID,
        )
        assert False, "expected ValueError"
    except ValueError:
        pass


# ------------------------------------------------------------------- report
def test_report_excludes_ddi_and_only_shows_approved_fields():
    enc = _make_encounter()
    encounter_store.update(enc["id"], EncounterUpdate(diagnosis="Type 2 Diabetes", assessment="Stable",
                                                        follow_up="Review in 4 weeks"))
    enc = encounter_store.get(enc["id"])
    rx = prescription_store.create(
        PrescriptionCreate(
            encounter_id=enc["id"], patient_id=PATIENT_ID, doctor_id=DOCTOR_ID,
            items=[PrescriptionItemIn(medicine_name="Metformin", dose="500", unit="mg",
                                       frequency="Twice daily", duration="30 days")],
        ),
        org_id=ORG_ID,
    )
    ddi_analysis_store.record(
        DDIAnalysisCreate(encounter_id=enc["id"], prescription_id=rx["id"], patient_id=PATIENT_ID,
                           doctor_id=DOCTOR_ID, overall_severity="Low"),
        org_id=ORG_ID,
    )
    report = report_store.create(
        ReportCreate(encounter_id=enc["id"], patient_id=PATIENT_ID, doctor_id=DOCTOR_ID, prescription_id=rx["id"]),
        org_id=ORG_ID,
    )
    assert report["status"] == "Draft"
    assert report["patient_visible"] is False

    finalized = report_store.finalize(report["id"])
    assert finalized["status"] == "Finalized"
    assert finalized["patient_visible"] is True
    assert len(report_store.list_for_patient(PATIENT_ID)) == 1

    view = build_patient_view(
        report=finalized,
        hospital={"name": "City General Hospital", "address": "MG Road", "phone": "022-1234"},
        patient={"id": PATIENT_ID, "name": "John Doe", "age": 45, "gender": "Male"},
        doctor={"id": DOCTOR_ID, "name": "Dr. Sarah Wilson", "specialization": "General Medicine"},
        encounter=enc,
        prescription=rx,
    )
    assert view["medicines"][0]["name"] == "Metformin"
    assert view["visit"]["diagnosis"] == "Type 2 Diabetes"

    # The whole point of this function: no DDI/interaction/severity leakage,
    # anywhere in the assembled payload, however it's serialized.
    flattened = repr(view).lower()
    for forbidden in ("severity", "interaction", "ddi", "overall_severity", "patient_factors"):
        assert forbidden not in flattened


# -------------------------------------------------------------- pharmacy
def test_pharmacy_order_and_dispensing_record():
    enc = _make_encounter()
    rx = prescription_store.create(
        PrescriptionCreate(encounter_id=enc["id"], patient_id=PATIENT_ID, doctor_id=DOCTOR_ID,
                            items=[PrescriptionItemIn(medicine_name="Amoxicillin")]),
        org_id=ORG_ID,
    )
    order = pharmacy_order_store.create(
        PharmacyOrderCreate(prescription_id=rx["id"], patient_id=PATIENT_ID, pharmacist_id=PHARMACIST_ID),
        org_id=ORG_ID, sent_by=ADMIN_ID,
    )
    assert order["status"] == "Sent"
    assert order["pharmacist_id"] == PHARMACIST_ID

    accepted = pharmacy_order_store.update_status(order["id"], "Accepted")
    assert accepted["status"] == "Accepted"

    record = dispensing_store.create(
        DispensingCreate(
            pharmacy_order_id=order["id"], prescription_id=rx["id"], patient_id=PATIENT_ID,
            pharmacist_id=PHARMACIST_ID, status="Dispensed",
            items=[{"item_id": rx["items"][0]["id"], "medicine_name": "Amoxicillin", "quantity_dispensed": 21}],
        ),
        org_id=ORG_ID,
    )
    assert record["status"] == "Dispensed"
    assert dispensing_store.list_for_order(order["id"])[0]["id"] == record["id"]
    assert len(pharmacy_order_store.list_for_pharmacist(PHARMACIST_ID)) == 1
    assert len(pharmacy_order_store.list_for_patient(PATIENT_ID)) == 1


def test_dispensing_rejects_invalid_status():
    enc = _make_encounter()
    rx = prescription_store.create(
        PrescriptionCreate(encounter_id=enc["id"], patient_id=PATIENT_ID, doctor_id=DOCTOR_ID),
        org_id=ORG_ID,
    )
    order = pharmacy_order_store.create(
        PharmacyOrderCreate(prescription_id=rx["id"], patient_id=PATIENT_ID),
        org_id=ORG_ID, sent_by=ADMIN_ID,
    )
    try:
        dispensing_store.create(
            DispensingCreate(pharmacy_order_id=order["id"], prescription_id=rx["id"], patient_id=PATIENT_ID,
                              pharmacist_id=PHARMACIST_ID, status="Lost It"),
            org_id=ORG_ID,
        )
        assert False, "expected ValueError"
    except ValueError:
        pass


# --------------------------------------------------------------- audit log
def test_audit_log_records_and_filters():
    audit_log_store.log(ORG_ID, DOCTOR_ID, "doctor", "prescription.finalize", "prescription", "RX-9999",
                         metadata={"version": 2})
    audit_log_store.log(ORG_ID, ADMIN_ID, "administrator", "patient.register", "patient", PATIENT_ID)
    audit_log_store.log("ORG-2", DOCTOR_ID, "doctor", "prescription.finalize", "prescription", "RX-0001")

    for_org = audit_log_store.list_all(org_id=ORG_ID)
    assert len(for_org) == 2
    assert all(e["org_id"] == ORG_ID for e in for_org)

    for_resource_type = audit_log_store.list_all(resource_type="prescription")
    assert len(for_resource_type) == 2

    specific = audit_log_store.list_all(resource_type="patient", resource_id=PATIENT_ID)
    assert len(specific) == 1
    assert specific[0]["metadata"] == {}


# ------------------------------------------------------- notifications
def test_notification_group_path_unchanged_and_user_path_additive():
    # Regression: the existing group-based path used throughout app/main.py
    # today must keep working exactly as before.
    group_notif = notification_store.push("clinician", "High severity interaction detected",
                                           "P-001 · Warfarin + Aspirin", tone="high", icon="alert", kind="Alerts")
    assert group_notif["group"] == "clinician"
    assert group_notif["recipient_user_id"] is None
    for_group = notification_store.list_for_group("clinician")
    assert any(n["id"] == group_notif["id"] for n in for_group)

    # New: user-targeted path from the target domain model.
    user_notif = notification_store.push_to_user(
        DOCTOR_ID, "Prescription finalized", "Your prescription for P-001 was finalized.",
        org_id=ORG_ID, type_="Prescription", reference_type="prescription", reference_id="RX-0001",
    )
    assert user_notif["recipient_user_id"] == DOCTOR_ID
    assert user_notif["group"] is None
    for_user = notification_store.list_for_user(DOCTOR_ID)
    assert len(for_user) == 1
    assert for_user[0]["reference_id"] == "RX-0001"

    # The two paths never cross: a group listing never returns a
    # user-targeted notification and vice versa.
    assert all(n["recipient_user_id"] is None for n in for_group)
    assert all(n["group"] is None for n in for_user)


# ----------------------------------------------------- reviews / analyses
def test_review_and_analysis_store_accept_org_id():
    review = review_store.create(PATIENT_ID, "Dr. Sarah Wilson", priority="High", org_id=ORG_ID)
    assert review["org_id"] == ORG_ID
    assert review_store.list_for_org(ORG_ID)[0]["id"] == review["id"]

    analysis = analysis_store.record(PATIENT_ID, "Warfarin", "Aspirin", "High", True,
                                      "Dr. Sarah Wilson", {"engine": "modules-1-4"}, org_id=ORG_ID)
    assert analysis["org_id"] == ORG_ID
    assert analysis_store.list_for_org(ORG_ID)[0]["id"] == analysis["id"]

    # Backward compatibility: org_id remains optional (existing call sites
    # in app/main.py don't pass it yet -- that wiring is Phase 2's job).
    legacy_review = review_store.create(PATIENT_ID, "Dr. Sarah Wilson")
    assert legacy_review["org_id"] is None
