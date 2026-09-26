import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { Brand } from '../ui/Icons';
import { useAuth } from '../../context/AuthContext';

const LINKS = [['Home', '/#top'], ['Features', '/#features'], ['How It Works', '/#how'], ['About', '/#about'], ['Contact', '/#contact']];

export function scrollToHash(hash) {
  const el = document.getElementById(hash.replace('#', ''));
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  else window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function PublicHeader({ light = false }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { user } = useAuth();
  const loc = useLocation();
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const go = (e, to) => {
    // Hash router: "/#features" is a route + in-page anchor. Handle the anchor ourselves.
    e.preventDefault();
    setOpen(false);
    const anchor = to.split('#')[1];
    if (loc.pathname !== '/') { window.location.hash = '#/'; setTimeout(() => scrollToHash(anchor), 80); } else scrollToHash(anchor);
  };
  return (
    <header className={`pub-header ${light ? 'light' : ''} ${scrolled ? 'scrolled' : ''}`}>
      <div className="container pub-header-inner">
        <Link to="/" aria-label="MediGuard AI home"><Brand dark={!light} /></Link>
        <nav className={`pub-links ${open ? 'open' : ''}`} aria-label="Primary">
          {LINKS.map(([label, to]) => <a key={label} href={to} onClick={(e) => go(e, to)}>{label}</a>)}
        </nav>
        <div className="pub-actions">
          {user ? (
            <Link to="/app/dashboard" className="btn btn-accent btn-sm">Open dashboard</Link>
          ) : (
            <>
              <Link to="/login" className="btn btn-accent btn-sm">Login</Link>
            </>
          )}
          <button className={`icon-btn pub-burger ${light ? '' : 'plain'}`} style={light ? undefined : { color: '#fff' }} aria-label="Toggle menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? <X size={18} /> : <Menu size={18} />}</button>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-col">
            <Brand />
            <p className="small mt-12" style={{ maxWidth: 300, lineHeight: 1.65 }}>Personalised drug–drug interaction analysis and clinical risk prediction, built for Indian healthcare.</p>
          </div>
          <div className="footer-col"><h4>Product</h4><ul><li><a href="/#features" onClick={(e) => { e.preventDefault(); window.location.hash = '#/'; setTimeout(() => scrollToHash('features'), 80); }}>Features</a></li><li><Link to="/login">Login</Link></li></ul></div>
          <div className="footer-col"><h4>Company</h4><ul><li><a href="/#about" onClick={(e) => { e.preventDefault(); window.location.hash = '#/'; setTimeout(() => scrollToHash('about'), 80); }}>About</a></li><li><a href="/#contact" onClick={(e) => { e.preventDefault(); window.location.hash = '#/'; setTimeout(() => scrollToHash('contact'), 80); }}>Contact</a></li></ul></div>
          <div className="footer-col"><h4>Legal</h4><ul><li><Link to="/privacy">Privacy Policy</Link></li><li><Link to="/terms">Terms of Service</Link></li></ul></div>
        </div>
        <div className="footer-base">
          <span>© {new Date().getFullYear()} MediGuard AI. Clinical decision support — not a substitute for professional medical judgment.</span>
          <span>CSE_C_09 · GH Raisoni College of Engineering, Nagpur</span>
        </div>
      </div>
    </footer>
  );
}

export default function PublicLayout({ light = false }) {
  const { pathname } = useLocation();
  // Reset scroll when navigating between public pages (in-page anchors are handled by scrollToHash).
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return (
    <>
      <PublicHeader light={light} />
      <main id="top"><Outlet /></main>
      <SiteFooter />
    </>
  );
}
