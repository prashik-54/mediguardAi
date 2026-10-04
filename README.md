# MediGuard AI — Hospital DDI & Clinical Workflow Platform

A hospital workflow system built around explainable drug–drug interaction (DDI) analysis:

**Platform Admin → Hospital → Hospital Administrator → Patient → Doctor → Prescription/DDI →
Report → Pharmacist → Patient**

FastAPI + MongoDB backend, React + Vite frontend. Every account is provisioned inside the
system by an administrator — there is no public sign-up. See [Signing in](#signing-in).

---

## Table of contents

- [Architecture](#architecture)
- [Roles](#roles)
- [Workflow](#workflow)
- [Signing in](#signing-in)
- [Project structure](#project-structure)
- [Running the project](#running-the-project)
- [Backend setup](#backend-setup)
- [Frontend setup](#frontend-setup)
- [Testing](#testing)
- [Backend module map](#backend-module-map)
- [Doctor consultation + prescription workflow](#doctor-consultation--prescription-workflow)
- [Known simplifications](#known-simplifications-documented-not-hidden)
- [Design system](#design-system-v2)

---

## Architecture

```
┌──────────────────────────┐        HTTPS / JSON        ┌───────────────────────────────┐
│   React + Vite frontend  │  ─────────────────────────▶ │        FastAPI backend        │
│   (frontend/src)         │  ◀───────────────────────── │        (app/main.py)          │
│   HashRouter SPA         │        JWT bearer token      │  routes → app/modules/*       │
└──────────────────────────┘                              │  cross-cutting checks →        │
        │  npm run build → frontend/dist                  │  app/core/permissions.py       │
        │  served by FastAPI at /app (StaticFiles)         └───────────────┬────────────────┘
        ▼                                                                  │ PyMongo
┌──────────────────────────┐                                               ▼
│  dev only: Vite dev       │                                  ┌───────────────────────────┐
│  server (localhost:5173) │                                  │         MongoDB            │
│  proxies /api → :8000    │                                  │  (falls back to an in-     │
└──────────────────────────┘                                  │  memory store per-process  │
                                                                │  if unreachable — see      │
                                                                │  app/db.py)                │
                                                                └───────────────────────────┘
```

- **Frontend** is a single-page app (`HashRouter`, so routes look like `/#/app/dashboard`).
  In dev it runs on Vite (`localhost:5173`) and proxies `/api/*` to the backend. In production
  it's built to static files (`frontend/dist`) and FastAPI serves them directly at `/app`, so
  there's exactly one origin and no CORS to configure.
- **Backend** is a single FastAPI app (`app/main.py`) that wires together the domain modules in
  `app/modules/` (one file per bounded concern — auth, org, patients, DDI pipeline,
  appointments, encounters, prescriptions, reports, pharmacy, audit…) plus shared, reusable
  authorization logic in `app/core/permissions.py` that every sensitive route goes through
  instead of doing its own ad-hoc role/org checks.
- **Data layer** (`app/db.py`) talks to MongoDB via PyMongo. If Mongo can't be reached (not
  installed, not running, bad URI), the backend does **not** crash — it transparently falls
  back to a small in-memory store for local development (data is lost on restart in that mode).
  The active mode is reported at `GET /api/health` as `"database": "mongodb" | "in-memory"`.
  Use a real MongoDB for anything that needs to persist.
- **Auth** is stateless JWT bearer tokens (`app/modules/module_auth.py`), issued at login and
  sent as `Authorization: Bearer <token>`; the frontend caches the token + user in
  `localStorage` and revalidates against `GET /api/auth/me` on load.
- **Startup bootstrap** (`app/seed.py`) creates exactly one Platform Admin from
  `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` when the `users` collection is empty,
  and nothing else — no demo hospitals, staff or patients are ever seeded.
- **DDI analysis** — doctor-only endpoints perform the existing `DrugKnowledgeBase` lookup
  (module2) and patient-factor assessment, then add a supplemental DGAT model score from
  `app/ml/`. Standalone and prescription-linked analyses use the same pair-scoring helper;
  prescription analyses persist both sources on the encounter-linked record. Baseline
  severity alone continues to control prescription review and finalization. DGAT scores are
  TWOSIDES population-association scores, not patient-specific risk probabilities or clinical
  severity. The standalone workspace uses reference data only when the backend is unreachable;
  backend HTTP failures are shown as errors.
- **DGAT assets** — `app/ml/assets/` contains the trained checkpoint, molecular graphs,
  interaction graph, drug lookup map/table, and side-effect summaries copied from the DDI model project.
  The backend precomputes drug embeddings at startup. `DDI_MODEL_ASSETS_DIR` can point to an
  alternate artifact directory; model availability is exposed at `GET /api/health`.

## Roles

There are two distinct administrator roles — never merge them:

| Role | Scope |
|---|---|
| **Platform Admin** (`admin`) | Owns the whole platform. Creates hospitals/organizations and their Hospital Administrator accounts. Not involved in day-to-day hospital operations. |
| **Hospital Administrator** (`administrator`) | An employee of one hospital. Searches/registers patients, assigns doctors and appointments, manages that hospital's doctors/pharmacists/patients, and can view finalized reports and send prescriptions to the pharmacy. |
| **Doctor** | Sees only patients/visits assigned to them. Runs consultations, writes prescriptions, and runs DDI analysis against them. |
| **Pharmacist** | Sees finalized prescriptions sent to the pharmacy and records dispensing. |
| **Patient** | Sees only their own reports, prescriptions and medications. |

## Workflow

1. **Patient arrives** at the hospital and goes to the Hospital Administrator / reception.
2. **Hospital Administrator** searches for the patient (ID, name, phone, email, DOB) or
   registers them if new.
3. **Doctor allocation** — the administrator assigns an available doctor and appointment slot,
   creating the visit/encounter.
4. **Doctor consultation** — the doctor reviews the patient's profile and history, records
   notes/diagnosis, and builds the prescription.
5. **DDI analysis** — the doctor runs the DDI engine against the prescription. Detailed
   interaction results and clinician decision history stay doctor-only. The patient report
   receives a separate, allowlisted safety summary and score explanation.
6. **Low/moderate result** → the doctor confirms and finalizes the prescription; the
   report is generated and immediately visible to that patient and the hospital team.
   **High-severity result** → the doctor reviews the alert (and any candidate alternatives),
   then explicitly approves the final medication plan. Nothing is auto-replaced.
7. **Patient report** — a printable/downloadable patient-facing report
   (hospital, patient, visit, doctor, diagnosis, medicines, dose/timing/duration,
   follow-up), with color-coded screening score, recorded medicine-pair findings and exact
   SHAP (Shapley) contributions explaining each score term. The score is a screening aid,
   not a probability or diagnosis; detailed analysis and clinician decisions stay doctor-only.
8. **Pharmacist** receives the finalized prescription (patient identity, medicines, dose,
   frequency, duration, dispensing status) and records dispensing.
9. **Patient** can view only their own finalized report/prescription and report notification —
   never clinician decision records or another patient's record.

## Signing in

**There is no public sign-up page or self-registration flow in the UI.** Every account —
Hospital Administrator, Doctor, Pharmacist and Patient — is created for you by an
administrator and is already linked to the right hospital organization:

- The very first **Platform Admin** account is created automatically at backend startup from
  `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` (see [Backend setup](#backend-setup))
  the first time the `users` collection is empty. Safe to leave those variables set
  permanently — it only fires once, against an empty database.
- That Platform Admin creates hospitals and their Hospital Administrator accounts
  (`POST /api/organizations`, then `POST /api/admin/users`).
- Each Hospital Administrator then creates that hospital's Doctor, Pharmacist and Patient
  accounts (`POST /api/admin/users`, restricted to `doctor` / `pharmacist` / `patient` and
  forced into their own hospital).

Everyone just opens `/#/login` and signs in with the credentials their administrator gave
them — there's nothing to "create an account" for.

The backend still exposes `POST /api/auth/register` (no frontend page routes to it), used only
by the automated test suite to prove that a self-registered account is quarantined: it gets no
`org_id`, so it can't see any hospital data, and the privileged `admin` / `administrator` roles
are blocked from self-registering entirely (`tests/test_rbac_isolation.py`). It's not part of
the intended user-facing flow.

## Project structure

```
.
├── app/                          # FastAPI backend
│   ├── main.py                   # App instance, all HTTP routes, wiring
│   ├── ml/                       # DGAT model service and inference artifacts
│   ├── db.py                     # MongoDB connection + in-memory fallback
│   ├── seed.py                   # One-time Platform Admin bootstrap (no demo data)
│   ├── core/
│   │   ├── settings.py           # Env-driven runtime settings (APP_ENV, bootstrap creds)
│   │   ├── permissions.py        # Shared hospital/role authorization helpers
│   │   └── backfill.py           # Idempotent org_id backfill for legacy records
│   └── modules/                  # One file per domain concern
│       ├── module_auth.py        # JWT auth, users, roles
│       ├── module_org.py         # Hospitals/organizations
│       ├── module1_patient.py    # Patient clinical profile CRUD
│       ├── module2_drug.py       # Drug mapping / DDI knowledge base
│       ├── module3_pipeline.py   # Clinical preprocessing
│       ├── module4_fusion.py     # Feature fusion (PyTorch)
│       ├── module5_reviews.py    # Pharmacist review queue
│       ├── module6_notifications.py  # Per-recipient notifications
│       ├── module7_analyses.py   # Analysis history
│       ├── module8_appointments.py   # Doctor allocation / scheduling
│       ├── module9_encounters.py     # Patient visit/encounter lifecycle
│       ├── module10_prescriptions.py # Prescriptions + items
│       ├── module11_ddi_analysis.py  # DDI analysis tied to a prescription
│       ├── module12_doctor_decision.py # High-severity doctor decision workflow
│       ├── module13_reports.py       # Patient-safe reports and Shapley score explanations
│       ├── module14_pharmacy.py      # Pharmacy orders + dispensing
│       └── module15_audit.py         # Hospital-scoped audit log
│
├── frontend/                     # React + Vite SPA
│   ├── index.html
│   ├── vite.config.js            # Dev proxy (:5173 → :8000), relative base for /app hosting
│   ├── package.json
│   └── src/
│       ├── main.jsx               # Entry point
│       ├── App.jsx                # HashRouter route table + role gating
│       ├── components/
│       │   ├── layout/            # PublicLayout, AuthLayout, AppLayout (RequireAuth/RoleGate)
│       │   ├── ui/                 # Buttons, fields, modals, tabs, badges, banners
│       │   ├── charts/             # Recharts wrappers
│       │   └── art/                # Original SVG illustrations
│       ├── context/                # AuthContext, PatientsContext, ReviewsContext,
│       │                           # NotificationsContext, SystemStatusContext, ToastContext
│       ├── pages/
│       │   ├── public/             # Home, Privacy, Terms
│       │   ├── auth/                # Login, ForgotPassword  (no Signup — see "Signing in")
│       │   ├── dashboard/          # Per-role dashboards (Doctor/Pharmacist/Patient/Admin/Hospital)
│       │   ├── intake/              # Hospital admin: patient intake + registration
│       │   ├── patients/           # Patient list / profile / form
│       │   ├── consult/            # Doctor queue, consultation, prescription, history
│       │   ├── ddi/                 # DDIWorkspace
│       │   ├── review/              # PharmacistReview
│       │   ├── pharmacy/            # Pharmacy dispensing workspace
│       │   ├── reports/             # Reports
│       │   ├── admin/               # AdminSecurity (platform/hospital admin views)
│       │   ├── settings/            # Settings
│       │   ├── support/             # Notifications + Help
│       │   └── NotFound.jsx
│       ├── data/                    # Reference/sample data (illustrative, see below)
│       ├── lib/                     # api.js, format.js, pdf.js, risk.js, stats.js, audit.js
│       ├── styles/                  # tokens.css + one stylesheet per area
│       └── test/                    # Vitest setup + smoke test
│
├── tests/                          # Backend pytest suite (see Testing)
├── requirements.txt                 # Backend Python dependencies
├── pytest.ini
├── .env.example / .env              # Backend environment variables (see Backend setup)
├── CLAUDE.md                        # Original build plan / target workflow spec
├── ARCHITECTURE_AUDIT.md            # Point-in-time audit of the repo against CLAUDE.md
└── README.md                        # This file
```

## Running the project

Two terminals, backend first:

```bash
# Terminal 1 — backend
pip install -r requirements.txt
uvicorn app.main:app --reload            # http://127.0.0.1:8000

# Terminal 2 — frontend (dev mode, hot reload)
cd frontend
npm install
npm run dev                              # http://localhost:5173  (proxies /api → :8000)
```

Then open `http://localhost:5173/#/login`. Full details for each below.

## Backend setup

```bash
python -m venv .venv && source .venv/bin/activate   # or your preferred env manager
pip install -r requirements.txt
```

The DDI predictor dependencies are included in `requirements.txt`. The trained model and
inference artifacts are bundled under `app/ml/assets/`; set `DDI_MODEL_ASSETS_DIR` only if you
store those artifacts elsewhere. At startup, the backend loads the checkpoint and precomputes
drug embeddings. Check `GET /api/health` for `"dgat_model": {"status": "ready"}` before testing
predictions. If the model cannot load, the baseline DDI service remains available but reports
the model as unavailable rather than treating that state as a negative prediction.

Create a `.env` file at the repo root (see `.env.example`):

```bash
MONGODB_URI=mongodb+srv://<user>:<password>@<your-cluster-address>/   # or mongodb://localhost:27017
MONGODB_NAME=ddi_framework

JWT_SECRET_KEY=<a long random string>
JWT_TTL_SECONDS=<e.g. 86400>

BOOTSTRAP_ADMIN_EMAIL=<first platform admin email>
BOOTSTRAP_ADMIN_PASSWORD=<first platform admin password>
BOOTSTRAP_ADMIN_NAME=Platform Admin

APP_ENV=development   # set to "production" when deploying; refuses to start on the default JWT secret
```

Run the API:

```bash
uvicorn app.main:app --reload            # http://127.0.0.1:8000, auto-reload on file changes
uvicorn app.main:app --host 0.0.0.0 --port 8000   # bind for LAN/container access, no reload
```

If `MONGODB_URI` is unreachable the backend still starts and runs on an in-memory store (see
[Architecture](#architecture)) — fine for a quick local check, but nothing persists across
restarts, so use a real MongoDB for anything you want to keep.

## Frontend setup

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173  (proxies /api → http://127.0.0.1:8000)
```

Run the FastAPI backend in another terminal (see [Backend setup](#backend-setup) above). Auth,
patients, appointments, encounters, prescriptions, reviews, reports, pharmacy and notifications
all talk to this backend directly. Only the DDI pipeline call has an offline fallback: if
`GET /api/health` fails, the DDI workspace falls back to the built-in reference interaction data
(`src/data/interactions.js`) and shows a **Reference data** badge instead of **Live engine** —
nothing breaks either way.

### Serve the built UI from FastAPI

```bash
cd frontend && npm run build      # writes frontend/dist
cd .. && uvicorn app.main:app     # dashboard at http://127.0.0.1:8000/app/
```

`frontend/dist` is a build output (not committed — run the build above first) so `/app` works;
rebuild it after changing the UI. `npm run preview` serves that build locally (`vite preview`)
if you want to sanity-check it without the backend.

### Frontend integration points

- **Auth** (`context/AuthContext.jsx`) — `login`/`updateProfile` call `POST /api/auth/login`,
  `PUT /api/auth/me` directly. The session (JWT + user) is cached in `localStorage` and
  revalidated against `GET /api/auth/me` on load. There is no sign-up call in the UI; the
  `/signup` route redirects straight to `/login`.
- **Patients** (`context/PatientsContext.jsx`) — loads `GET /api/patients`, scoped server-side
  to the caller's hospital/role; add/edit/delete call the matching `POST` / `PUT` /
  `DELETE /api/patients/...` endpoints. If the backend is unreachable an error banner with a
  Retry button is shown.
- **Reviews** (`context/ReviewsContext.jsx`) — loads `GET /api/reviews`, submits with
  `POST /api/reviews/{id}/submit`; `DDIWorkspace`'s "Request pharmacist review" button calls
  `POST /api/reviews`.
- **Notifications** (`context/NotificationsContext.jsx`) — polls `GET /api/notifications` every
  20s; read/dismiss call the matching endpoints. Real events (a high-severity interaction found
  during analysis, a pharmacist review requested/completed, an appointment assigned, a
  prescription finalized…) push real, per-recipient notifications server-side.
- **DDI analysis** — the standalone workspace calls the doctor-only `POST /api/ddi/check`;
  prescription DDI uses `POST /api/prescriptions/{id}/ddi-analysis`. Both return the baseline
  lookup, patient factors, and the same supplemental DGAT pair scores. A model-only score is
  shown as a neutral “Model signal” and never changes clinical severity or prescription status.
  Only network failure before the backend responds uses the standalone page's reference-data
  fallback; API errors from a reachable backend are surfaced.

## Testing

```bash
# Backend — pytest (tests/, see pytest.ini)
pytest                     # full suite
pytest tests/test_rbac_isolation.py -v   # a single file

# Frontend — Vitest (frontend/src/test/)
cd frontend
npm test                   # vitest run
```

Backend test files, by area: `test_platform_bootstrap`, `test_domain_foundation`,
`test_hospital_intake`, `test_rbac_isolation`, `test_doctor_consultation`,
`test_doctor_ddi_analysis`, `test_high_severity_decision`, `test_prescription_workflow`,
`test_final_report`, `test_pharmacy`, `test_patient_portal`, `test_notifications_audit`,
`test_e2e_release_workflow`, `test_release_hardening`.

## Backend module map

| Module | Responsibility |
|---|---|
| `module_auth.py` | JWT authentication, user accounts, roles, hospital-managed-role rules |
| `module_org.py` | Hospitals/organizations |
| `module1_patient.py` | Patient clinical profile CRUD |
| `module2_drug.py` | Drug mapping / DDI knowledge base |
| `module3_pipeline.py` | Clinical preprocessing |
| `module4_fusion.py` | Feature fusion (PyTorch) |
| `module5_reviews.py` | Pharmacist review queue |
| `module6_notifications.py` | Per-recipient notifications |
| `module7_analyses.py` | Analysis history |
| `module8_appointments.py` | Doctor allocation / appointment scheduling |
| `module9_encounters.py` | Patient visit/encounter lifecycle |
| `module10_prescriptions.py` | Prescriptions and prescription items |
| `module11_ddi_analysis.py` | DDI analysis tied to a prescription/encounter |
| `module12_doctor_decision.py` | High-severity doctor decision workflow |
| `module13_reports.py` | Patient-safe clinical report and explainable screening summary |
| `module14_pharmacy.py` | Pharmacy orders and dispensing records |
| `module15_audit.py` | Hospital-scoped audit log |
| `app/core/permissions.py` | Shared hospital/role scoping helpers used across routes |

## Doctor consultation + prescription workflow

The doctor's consultation page (`src/pages/consult/Consultation.jsx`, route
`/app/consult/:appointmentId`) renders, in order: patient clinical profile, previous
consultations, a prescription summary card, and finally consultation notes — the notes
section sits after the prescription so the doctor's write-up (findings, diagnosis, assessment,
follow-up) can reflect whatever was actually prescribed, rather than being drafted blind
beforehand. The full prescription workspace (medicine items, DDI review, high-severity doctor
decision, finalize, decision history, earlier versions) lives on its own page
(`src/pages/consult/Prescription.jsx`, `/app/consult/:appointmentId/prescription`). The
"Prescription" and "Consultation notes" buttons in the page header jump to the `#prescription`
and `#consultation-notes` sections respectively, so the doctor never loses the patient/visit
context while moving between them.

## Known simplifications (documented, not hidden)

- **Interaction text and the home-page marketing figures (10K+ patients, 98% accuracy…) are
  illustrative.** The DGAT predictor is integrated as a population-level TWOSIDES association
  signal, but is not validated for clinical decision-making; the website's local risk score and
  clinical severity remain separate from that model output. No SHAP/LIME explanations are
  currently generated.
- **The Admin section's platform-wide charts still use some static sample data** alongside the
  real, database-backed audit log — the patient-, DDI- and workflow-facing features are the
  real part of the app.
- **MongoDB has an in-memory fallback for local dev** (see [Architecture](#architecture)) — make
  sure `MONGODB_URI` actually resolves before relying on data surviving a restart.
- The Privacy Policy and Terms are drafts and need legal review.

## Design system (v2)

- **Fonts:** Bricolage Grotesque (headings) and Figtree (body), bundled via `@fontsource-variable`.
- **Tokens:** `frontend/src/styles/tokens.css` holds the colour, radius, shadow and motion tokens; change the palette there.
- **Artwork:** all imagery is original SVG in `frontend/src/components/art/` (capsules, hero network, role portraits, spot illustrations). Swap any of them for photos by replacing the component.
- **Motion:** the home hero plays one sequence on load; everything else responds to user action. `prefers-reduced-motion` is respected.

## API endpoints and implemented workflows

The following inventory describes all 76 FastAPI endpoints currently implemented in
`app/main.py`. The root, health, registration, and login endpoints are public; the remaining
endpoints use the application's bearer-token authentication and role/organization/patient
scoping.

### System and authentication

| Method | Endpoint | Implemented behavior |
|---|---|---|
| `GET` | `/` | Serves the application entry point. |
| `GET` | `/api/health` | Reports application, database, DDI dataset, and DGAT model status. |
| `POST` | `/api/auth/register` | Registers an account under the application's account-creation rules. |
| `POST` | `/api/auth/login` | Authenticates an account and issues its session token. |
| `GET` | `/api/auth/me` | Returns the authenticated user's profile. |
| `PUT` | `/api/auth/me` | Updates the authenticated user's profile. |
| `PUT` | `/api/auth/me/password` | Changes the authenticated user's password. |

### Organizations, staff, and patients

| Method | Endpoint | Implemented behavior |
|---|---|---|
| `POST` | `/api/organizations` | Creates an organization. |
| `GET` | `/api/organizations` | Lists organizations available to the caller. |
| `GET` | `/api/organizations/{org_id}` | Reads an organization record. |
| `PUT` | `/api/organizations/{org_id}` | Updates an organization record. |
| `DELETE` | `/api/organizations/{org_id}` | Deletes an organization. |
| `GET` | `/api/organizations/{org_id}/users` | Lists users belonging to an organization. |
| `GET` | `/api/admin/users` | Lists and filters administratively managed users. |
| `POST` | `/api/admin/users` | Creates a managed user account. |
| `GET` | `/api/admin/users/{user_id}` | Reads a managed user account. |
| `PUT` | `/api/admin/users/{user_id}` | Updates a managed user account. |
| `POST` | `/api/admin/users/{user_id}/status` | Changes a managed user's active status. |
| `DELETE` | `/api/admin/users/{user_id}` | Deletes a managed user account. |
| `GET` | `/api/patients` | Lists patients visible to the caller. |
| `GET` | `/api/patients/search` | Searches within the caller's patient scope. |
| `GET` | `/api/patients/{patient_id}` | Reads an accessible patient record. |
| `POST` | `/api/patients` | Creates a patient record. |
| `PUT` | `/api/patients/{patient_id}` | Updates an accessible patient record. |
| `DELETE` | `/api/patients/{patient_id}` | Deletes an accessible patient record. |
| `POST` | `/api/patients/{patient_id}/login` | Creates login access linked to a patient record. |
| `POST` | `/api/patient/register` | Registers or synchronizes a patient's submitted clinical profile. |

### Appointments, encounters, and prescriptions

| Method | Endpoint | Implemented behavior |
|---|---|---|
| `POST` | `/api/appointments` | Creates an appointment. |
| `GET` | `/api/appointments` | Lists appointments available to the caller. |
| `GET` | `/api/appointments/{appointment_id}` | Reads an accessible appointment. |
| `PATCH` | `/api/appointments/{appointment_id}/status` | Updates appointment status. |
| `GET` | `/api/doctor/appointments` | Lists the authenticated doctor's appointments. |
| `POST` | `/api/encounters` | Starts an encounter for an appointment. |
| `GET` | `/api/appointments/{appointment_id}/encounter` | Reads the encounter associated with an appointment. |
| `GET` | `/api/encounters/{encounter_id}` | Reads an accessible encounter. |
| `PUT` | `/api/encounters/{encounter_id}` | Updates encounter clinical information. |
| `POST` | `/api/encounters/{encounter_id}/complete` | Completes an encounter. |
| `GET` | `/api/patients/{patient_id}/encounters` | Lists encounters for an accessible patient. |
| `POST` | `/api/prescriptions` | Creates a prescription draft. |
| `GET` | `/api/encounters/{encounter_id}/prescriptions` | Lists prescriptions for an encounter. |
| `GET` | `/api/prescriptions/{prescription_id}` | Reads an accessible prescription. |
| `PUT` | `/api/prescriptions/{prescription_id}` | Updates an editable prescription. |
| `POST` | `/api/prescriptions/{prescription_id}/new-version` | Starts a revised prescription version. |
| `GET` | `/api/patients/{patient_id}/prescriptions` | Lists prescriptions for an accessible patient. |
| `POST` | `/api/prescriptions/{prescription_id}/decision` | Records a doctor's decision for a reviewed prescription. |
| `GET` | `/api/prescriptions/{prescription_id}/decisions` | Reads the prescription's doctor-decision history. |
| `POST` | `/api/prescriptions/{prescription_id}/finalize` | Finalizes an eligible prescription and generates its patient report. |

### Medicine catalog and DDI analysis

| Method | Endpoint | Implemented behavior |
|---|---|---|
| `GET` | `/api/drugs/catalog` | Returns the available medicine catalog; `q` searches matching medicine names. |
| `POST` | `/api/ddi/check` | Checks medicine pairs and patient factors without saving a prescription analysis. |
| `POST` | `/api/prescriptions/{prescription_id}/ddi-analysis` | Runs and records DDI analysis for an editable prescription. |
| `GET` | `/api/prescriptions/{prescription_id}/ddi-analysis` | Reads the latest recorded DDI analysis. |
| `GET` | `/api/prescriptions/{prescription_id}/ddi-analyses` | Lists recorded DDI analyses for a prescription. |
| `POST` | `/api/pipeline/process-and-fuse` | Runs the legacy drug-mapping, patient-feature, and feature-fusion pipeline. |

### Patient reports, pharmacy, and reviews

| Method | Endpoint | Implemented behavior |
|---|---|---|
| `POST` | `/api/reports/from-prescription/{prescription_id}` | Creates or reads a report for a finalized prescription. |
| `GET` | `/api/reports` | Lists reports visible to the caller. |
| `GET` | `/api/reports/{report_id}` | Reads an accessible report, including the patient-safe screening summary. |
| `POST` | `/api/reports/{report_id}/release` | Publishes a report to its linked patient; retained for administrator workflow compatibility. |
| `POST` | `/api/reports/{report_id}/log-access` | Records report print/download access. |
| `POST` | `/api/pharmacy/orders` | Sends a finalized prescription to the pharmacy. |
| `GET` | `/api/pharmacy/orders` | Lists pharmacy orders visible to the caller. |
| `GET` | `/api/pharmacy/orders/{order_id}` | Reads an accessible pharmacy order. |
| `POST` | `/api/pharmacy/orders/{order_id}/accept` | Accepts a pharmacy order. |
| `POST` | `/api/pharmacy/orders/{order_id}/dispense` | Records dispensing status for order items. |
| `GET` | `/api/reviews` | Lists review requests visible to the caller. |
| `POST` | `/api/reviews` | Creates a review request. |
| `POST` | `/api/reviews/{review_id}/submit` | Submits a pharmacist review. |

### Patient portal, notifications, audit, and dashboard

| Method | Endpoint | Implemented behavior |
|---|---|---|
| `GET` | `/api/portal/me` | Returns the authenticated patient's linked portal profile. |
| `GET` | `/api/portal/appointments` | Lists the authenticated patient's appointments. |
| `GET` | `/api/portal/medications` | Lists the patient's report-backed medication and dispensing information. |
| `GET` | `/api/notifications` | Lists notifications available to the authenticated user. |
| `POST` | `/api/notifications/{notif_id}/read` | Marks a notification as read. |
| `POST` | `/api/notifications/read-all` | Marks all available notifications as read. |
| `DELETE` | `/api/notifications/{notif_id}` | Dismisses a notification. |
| `GET` | `/api/audit` | Lists audit events within the caller's permitted scope. |
| `GET` | `/api/analyses` | Lists analysis records available to the caller. |
| `GET` | `/api/dashboard/stats` | Returns dashboard summary statistics for the caller. |
