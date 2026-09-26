import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Brand } from '../ui/Icons';
import AuthArt from '../art/AuthArt';

const COPY = {
  login: ['Welcome back to safer prescribing.', 'Pick up where you left off: your patients, reviews and interaction alerts are waiting.'],
  signup: ['Give every prescription a second opinion.', 'Set up your workspace in a minute. Doctors, pharmacists and patients each get a view built for them.'],
  forgot: ['Locked out? It happens.', 'We’ll email a secure code so you can set a new password and get back to your patients.'],
  verify: ['One quick check and you’re in.', 'Verification keeps patient information limited to the people who should see it.'],
};

export default function AuthLayout({ children, back = true, variant = 'login' }) {
  const [title, sub] = COPY[variant] || COPY.login;
  return (
    <div className="auth-shell">
      <div className="auth-main">
        <div className="row between">
          <Link to="/" aria-label="MediGuard AI home"><Brand dark={false} /></Link>
          {back && <Link to="/" className="btn btn-ghost btn-sm"><ArrowLeft size={14} /> Back to site</Link>}
        </div>
        <div className="auth-form-wrap"><div className="auth-card">{children}</div></div>
        <p className="tiny muted center">Clinical decision-support tool · <Link to="/privacy" style={{ textDecoration: 'underline' }}>Privacy</Link> · <Link to="/terms" style={{ textDecoration: 'underline' }}>Terms</Link></p>
      </div>
      <aside className="auth-visual" aria-hidden="true">
        <span className="auth-chip"><i />Explainable drug–drug interaction analysis</span>
        <AuthArt />
        <div>
          <h2>{title}</h2>
          <p className="sub">{sub}</p>
          <div className="auth-stats">
            <div><strong>10K+</strong><span>Active users</span></div>
            <div><strong>500+</strong><span>Hospitals</span></div>
            <div><strong>99.9%</strong><span>Uptime</span></div>
          </div>
        </div>
      </aside>
    </div>
  );
}
