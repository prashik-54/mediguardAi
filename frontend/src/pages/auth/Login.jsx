import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { CircleAlert } from 'lucide-react';
import AuthLayout from '../../components/layout/AuthLayout';
import { TextField, PasswordField } from '../../components/ui/Field';
import { GoogleIcon, MicrosoftIcon, AppleIcon } from '../../components/ui/Icons';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useSystemStatus } from '../../context/SystemStatusContext';
import { isEmail } from '../../lib/format';

export function OAuthRow() {
  const toast = useToast();
  const off = (n) => () => toast.info(`${n} sign-in isn’t configured yet.`);
  return (
    <>
      <div className="or-line">Or continue with</div>
      <div className="oauth-row">
        <button type="button" className="oauth" onClick={off('Google')}><GoogleIcon />Google</button>
        <button type="button" className="oauth" onClick={off('Microsoft')}><MicrosoftIcon />Microsoft</button>
        <button type="button" className="oauth" onClick={off('Apple')}><AppleIcon />Apple</button>
      </div>
    </>
  );
}

function AdminAccountNotice() {
  const { info } = useSystemStatus();
  if (info.admin_accounts_provisioned) return null;
  return (
    <div className="callout callout-info mt-16">
      <span>
        No account has been provisioned yet. Accounts for Doctors, Pharmacists, Patients and
        Hospital Administrators are created by your hospital administrator — ask them for your
        login credentials. Platform Admin accounts are provisioned by whoever deployed this system.
      </span>
    </div>
  );
}

export default function Login() {
  const { login, user } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [f, setF] = useState({ email: '', password: '', remember: true });
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { document.title = 'Sign in — MediGuard AI'; }, []);
  useEffect(() => { if (user) nav('/app/dashboard', { replace: true }); }, []); // eslint-disable-line

  const submit = async (e) => {
    e.preventDefault();
    const n = {};
    if (!isEmail(f.email)) n.email = 'Enter a valid email address';
    if (f.password.length < 8) n.password = 'Password must be at least 8 characters';
    setErr(n);
    if (Object.keys(n).length) return;
    setBusy(true);
    try {
      await login({ email: f.email, password: f.password });
      nav(loc.state?.from || '/app/dashboard', { replace: true });
    } catch (ex) {
      setErr({ form: ex.message || 'Sign in failed. Check your credentials and try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout variant="login">
      <h1>Welcome Back</h1>
      <p className="muted mb-16">Sign in to your account to continue</p>
      <form className="grid mt-16" style={{ gap: 14 }} onSubmit={submit} noValidate>
        {(err.email || err.password || err.form) ? <div className="callout callout-high" role="alert"><CircleAlert size={16} />{err.form || 'Check the highlighted fields and try again.'}</div> : null}
        <TextField label="Email Address" type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} error={err.email} />
        <div>
          <PasswordField label="Password" autoComplete="current-password" placeholder="At least 8 characters" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} error={err.password} />
          <div className="row between mt-8">
            <label className="check"><input type="checkbox" checked={f.remember} onChange={(e) => setF({ ...f, remember: e.target.checked })} />Remember me</label>
            <Link to="/forgot-password" className="small strong" style={{ color: 'var(--primary)' }}>Forgot password?</Link>
          </div>
        </div>
        <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={busy}>{busy ? <><span className="spinner sm" style={{ borderTopColor: '#fff', borderColor: 'rgba(255,255,255,.35)' }} />Signing in…</> : 'Sign In'}</button>
      </form>
      <OAuthRow />
      <AdminAccountNotice />
    </AuthLayout>
  );
}
