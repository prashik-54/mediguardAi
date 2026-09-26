# MediGuard AI — Clinical Dashboard (Module 9 UI)

React + Vite front end for the Personalized DDI & Clinical Risk Framework. It implements every
screen from the design reference: public site, authentication, doctor / pharmacist / patient / admin
workspaces, DDI analysis, reports and settings — wired to the FastAPI + MongoDB backend for real
accounts, patient records, pharmacist reviews and notifications.

## Run it

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173  (proxies /api → http://127.0.0.1:8000)
```

Run the FastAPI backend in another terminal (`uvicorn app.main:app --reload` from the repo root, with
MongoDB running — see the root `README.md`). Auth, patients, reviews and notifications always talk to
this backend directly. Only the DDI pipeline call has an offline fallback: if `GET /api/health` fails,
the DDI workspace falls back to the built-in reference interaction data (`src/data/interactions.js`) and shows
a **Reference data** badge instead of **Live engine** — nothing breaks either way.

### Serve the built UI from FastAPI

```bash
cd frontend && npm run build      # writes frontend/dist
cd .. && uvicorn app.main:app     # dashboard at http://127.0.0.1:8000/app/
```

`frontend/dist` is a build output (not committed — run the build above first) so `/app` works;
rebuild it after changing the UI.

## Signing in

There are no seeded accounts. The first Platform Admin is created from `BOOTSTRAP_ADMIN_EMAIL` /
`BOOTSTRAP_ADMIN_PASSWORD` (see the root `README.md`); that admin adds hospitals and staff. Doctors,
pharmacists and patients can also sign up directly — accounts are stored in MongoDB with a hashed password.

- **Auth** (`context/AuthContext.jsx`) — `login`/`signup`/`updateProfile` call
  `POST /api/auth/login`, `POST /api/auth/register`, `PUT /api/auth/me` directly. The session (JWT +
  user) is cached in `localStorage` and revalidated against `GET /api/auth/me` on load.
- **Patients** (`context/PatientsContext.jsx`) — loads `GET /api/patients` once signed in; add/edit/
  delete call the matching `POST` / `PUT` / `DELETE /api/patients/...` endpoints. If the backend is
  unreachable an error banner with a Retry button is shown.
- **Reviews** (`context/ReviewsContext.jsx`) — loads `GET /api/reviews`, submits with
  `POST /api/reviews/{id}/submit`; `DDIWorkspace`'s "Request pharmacist review" button calls
  `POST /api/reviews`. Risk scoring for the queue is still computed client-side (`lib/risk.js`) from
  the real patient record.
- **Notifications** (`context/NotificationsContext.jsx`) — polls `GET /api/notifications` every 20s;
  read/dismiss call the matching endpoints. Real events (e.g. a high-severity interaction found during
  an analysis, or a pharmacist review being requested/completed) push real notifications server-side.
- **DDI pipeline** — maps a UI patient to the `PatientClinicalProfile` schema (Module 1), then calls
  `POST /api/pipeline/process-and-fuse` for each medication pair (Modules 2–4). The engine's baseline
  severity is merged with local explanation text (mechanism, effects, recommendation). This is the one
  call with an offline fallback — see "Run it" above.

## Doctor consultation + prescription workflow

The doctor's consultation page (`src/pages/consult/Consultation.jsx`, route
`/app/consult/:appointmentId`) renders, in order: patient clinical profile, previous consultations,
a prescription summary card, and finally consultation notes — the notes section sits after the
prescription so the doctor's write-up (findings, diagnosis, assessment, follow-up) can reflect
whatever was actually prescribed, rather than being drafted blind beforehand. The full prescription
workspace (medicine items, DDI review, high-severity doctor decision, finalize, decision history,
earlier versions) lives on its own page (`src/pages/consult/Prescription.jsx`,
`/app/consult/:appointmentId/prescription`). The "Prescription" and "Consultation notes" buttons in
the page header jump to the `#prescription` and `#consultation-notes` sections respectively, so the
doctor never loses the patient/visit context while moving between them.

## Known simplifications (documented, not hidden)

- **Interaction text, risk scores and the home-page figures (10K+ patients, 98% accuracy…) are
  illustrative.** They come from the reference design and sample data — replace them with validated
  content, and swap `lib/risk.js` for the trained prediction engine (Module 4, part 2) and SHAP/LIME
  output (Module 8) once those exist.
- **The Admin section (users, audit trail, security events, platform-wide charts) still uses static
  sample data.** Wiring genuine audit logging / security monitoring was out of scope for this pass —
  the patient- and DDI-facing features (the actual subject of the project) are the real, database-backed
  part of the app.
- The Privacy Policy and Terms are drafts and need legal review.



## Design system (v2)

- **Fonts:** Bricolage Grotesque (headings) and Figtree (body), bundled via `@fontsource-variable`.
- **Tokens:** `src/styles/tokens.css` holds the colour, radius, shadow and motion tokens; change the palette there.
- **Artwork:** all imagery is original SVG in `src/components/art/` (capsules, hero network, role portraits, spot illustrations). Swap any of them for photos by replacing the component.
- **Motion:** the home hero plays one sequence on load; everything else responds to user action. `prefers-reduced-motion` is respected.
