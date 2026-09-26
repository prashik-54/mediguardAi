import { useEffect } from 'react';
import { Link } from 'react-router-dom';

function LegalPage({ title, updated, intro, sections }) {
  useEffect(() => { document.title = `${title} — MediGuard AI`; }, [title]);
  return (
    <>
    <section className="legal-hero">
      <div className="container">
        <span className="auth-chip" style={{ marginBottom: 18 }}><i />Last updated {updated}</span>
        <h1>{title}</h1>
        <p>{intro}</p>
      </div>
    </section>
    <div className="container legal">
      <nav className="legal-toc" aria-label="On this page">
        {sections.map((s) => <a key={s.id} href={`#/${title === 'Privacy Policy' ? 'privacy' : 'terms'}`} onClick={(e) => { e.preventDefault(); document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth' }); }}>{s.title}</a>)}
      </nav>
      <article className="legal-body">
        <div className="callout callout-warn"><span>This is a draft prepared for a research prototype. It must be reviewed by qualified legal counsel before real patient data is processed.</span></div>
        {sections.map((s) => (
          <section key={s.id} id={s.id}>
            <h2>{s.title}</h2>
            {s.body.map((p, i) => <p key={i} className={i ? 'mt-8' : ''}>{p}</p>)}
            {s.list && <ul>{s.list.map((l) => <li key={l}>{l}</li>)}</ul>}
          </section>
        ))}
        <p className="mt-24 small muted">Questions? <Link to="/#contact" onClick={(e) => { e.preventDefault(); window.location.hash = '#/'; setTimeout(() => document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' }), 80); }} style={{ color: 'var(--primary)', textDecoration: 'underline' }}>Contact us</Link>.</p>
      </article>
    </div>
    </>
  );
}

export function Privacy() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="20 September 2026"
      intro="MediGuard AI processes health information on behalf of clinicians and their organisations. This policy explains what we collect, why, and the choices you have."
      sections={[
        { id: 'collect', title: 'Information we collect', body: ['We collect the account details you give us (name, email, role, organisation) and the clinical information your organisation enters: demographics, kidney and liver function, allergies, conditions and medications.'], list: ['Account and authentication data', 'Patient clinical records entered by authorised users', 'Usage logs such as sign-ins, exports and analysis runs'] },
        { id: 'use', title: 'How we use it', body: ['We use clinical data only to run drug-interaction analyses, show results to authorised users and produce reports. We do not sell personal data or use it for advertising.'] },
        { id: 'access', title: 'Who can see it', body: ['Access is role-based. Doctors and pharmacists see patients within their organisation; patients see only their own record; administrators manage accounts but do not browse clinical notes. Every view, edit and export is recorded in the audit trail.'] },
        { id: 'security', title: 'How we protect it', body: ['Data is encrypted in transit and at rest, sessions expire after inactivity, and multi-factor authentication is available for all roles. Security events are monitored and reviewed by administrators.'] },
        { id: 'retention', title: 'Retention and deletion', body: ['Records are kept for the period configured by your organisation (365 days by default). You can request an export or deletion of your personal data from Profile & Settings → Privacy.'] },
        { id: 'rights', title: 'Your rights', body: ['You can ask to access, correct, export or delete your personal data, and to withdraw consent for optional processing such as anonymised research use. We respond within 30 days.'] },
      ]}
    />
  );
}

export function Terms() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="20 September 2026"
      intro="By creating an account or using MediGuard AI you agree to these terms. Please read them with the clinical disclaimer on our home page."
      sections={[
        { id: 'use', title: 'Intended use', body: ['MediGuard AI is a clinical decision-support tool for healthcare professionals and researchers. It highlights possible drug–drug interactions and estimates patient-specific risk. It does not diagnose, prescribe or replace professional judgment.'] },
        { id: 'responsibilities', title: 'Your responsibilities', body: ['You are responsible for the accuracy of the data you enter and for every clinical decision you make.'], list: ['Keep your credentials secure and do not share accounts', 'Enter patient data only where you have a lawful basis and authorisation', 'Verify results against current guidelines before acting'] },
        { id: 'limits', title: 'Limits of the service', body: ['Interaction data and model outputs may be incomplete, delayed or wrong. The service is provided “as is” without warranties. To the extent permitted by law, we are not liable for treatment decisions made using its output.'] },
        { id: 'acceptable', title: 'Acceptable use', body: ['Do not attempt to access other users’ data, probe or disrupt the service, upload malicious content, or use outputs to train competing models without permission.'] },
        { id: 'changes', title: 'Changes and termination', body: ['We may update these terms and will notify you of material changes. You can close your account at any time; we may suspend accounts that breach these terms or put patients at risk.'] },
      ]}
    />
  );
}
