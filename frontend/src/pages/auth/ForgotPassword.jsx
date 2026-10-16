import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, ArrowLeft } from 'lucide-react';
import AuthLayout from '../../components/layout/AuthLayout';

/** There is no email service or reset API yet, so this page says so instead of pretending to send a link or
 *  change a password (Phase 12: no fake success states). */
export default function ForgotPassword() {
  useEffect(() => { document.title = 'Reset password — MediGuard AI'; }, []);
  return (
    <AuthLayout variant="forgot">
      <div className="status-icon info"><KeyRound size={26} /></div>
      <h1>Password reset</h1>
      <p className="muted mt-8 mb-16">Self-service password reset by email isn’t available yet. Ask your hospital administrator (or a platform administrator) to reset your password, then sign in with the new one.</p>
      <Link to="/login" className="btn btn-primary btn-block btn-lg"><ArrowLeft size={16} />Back to sign in</Link>
    </AuthLayout>
  );
}
