import { Link } from 'react-router-dom';
import { Brand } from '../components/ui/Icons';
import { NotFoundArt } from '../components/art/Spots';

export default function NotFound() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center', background: 'radial-gradient(700px 400px at 50% 0%, rgba(43,217,181,.16), transparent 70%), var(--bg)' }}>
      <div style={{ maxWidth: 460 }}>
        <Brand dark={false} />
        <NotFoundArt />
        <h1 style={{ fontSize: 32 }}>We can’t find that page</h1>
        <p className="muted mt-8">The link may be broken or the page may have moved.</p>
        <div className="row gap-8 mt-24" style={{ justifyContent: 'center' }}><Link to="/" className="btn btn-outline">Home</Link><Link to="/app/dashboard" className="btn btn-primary">Open dashboard</Link></div>
      </div>
    </div>
  );
}
