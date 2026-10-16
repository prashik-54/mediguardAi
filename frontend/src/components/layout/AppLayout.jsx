import { Fragment, useEffect, useRef, useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bell, Settings, Search, Menu, LogOut, User, LifeBuoy, ChevronDown, LayoutDashboard, Users, FlaskConical, FileText, ClipboardCheck, Pill, KeyRound, ScrollText, ShieldAlert, SlidersHorizontal, UserCog, PanelLeftClose, Building2, UserPlus, Stethoscope } from 'lucide-react';
import { Brand } from '../ui/Icons';
import { Popover } from '../ui/Misc';
import SystemBanner from '../ui/SystemBanner';
import Portrait from '../art/Portraits';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationsContext';

const NAV = {
  doctor: [
    { to: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { section: 'Clinical', to: '/app/queue', label: 'My Queue', icon: Stethoscope },
    { to: '/app/patients', label: 'My Patients', icon: Users },
    { to: '/app/ddi', label: 'DDI Checker', icon: FlaskConical },
    { section: 'Records', to: '/app/reports', label: 'Patient Reports', icon: FileText },
    { to: '/app/notifications', label: 'Notifications', icon: Bell, badge: true },
  ],
  pharmacist: [
    { to: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { section: 'Dispensing', to: '/app/pharmacy', label: 'Pharmacy Orders', icon: Pill },
    { to: '/app/notifications', label: 'Notifications', icon: Bell, badge: true },
    { section: 'Other', to: '/app/review', label: 'Review Requests', icon: ClipboardCheck },
  ],
  patient: [
    { to: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/app/appointments', label: 'Appointments', icon: Stethoscope },
    { to: '/app/medications', label: 'Medications', icon: Pill },
    { to: '/app/reports', label: 'Reports', icon: FileText },
    { to: '/app/notifications', label: 'Notifications', icon: Bell, badge: true },
  ],
  admin: [
    { to: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { section: 'Platform', to: '/app/admin/users', label: 'Users', icon: Users },
    { to: '/app/admin/organizations', label: 'Hospitals', icon: Building2 },
    { section: 'Governance', to: '/app/admin/roles', label: 'Roles & Permissions', icon: KeyRound },
    { to: '/app/admin/audit', label: 'Audit Trail', icon: ScrollText },
    { to: '/app/admin/security', label: 'Security Events', icon: ShieldAlert },
    { to: '/app/admin/config', label: 'Configuration', icon: SlidersHorizontal },
  ],
  administrator: [
    { to: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { section: 'Front desk', to: '/app/intake', label: 'Patient Intake', icon: UserPlus },
    { to: '/app/patients', label: 'Patient Records', icon: Users },
    { to: '/app/reports', label: 'Final Reports', icon: FileText },
    { to: '/app/pharmacy', label: 'Pharmacy Orders', icon: Pill },
    { to: '/app/notifications', label: 'Notifications', icon: Bell, badge: true },
    { section: 'Hospital', to: '/app/admin/users', label: 'Staff & Patients', icon: Users },
    { to: '/app/admin/organizations', label: 'My Hospital', icon: Building2 },
    { section: 'Oversight', to: '/app/admin/audit', label: 'Audit Trail', icon: ScrollText },
    { to: '/app/admin/security', label: 'Security Events', icon: ShieldAlert },
    { to: '/app/admin/config', label: 'Configuration', icon: SlidersHorizontal },
  ],
};

export function RequireAuth() {
  const { user } = useAuth();
  const loc = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return <AppLayout />;
}

const COLLAPSE_KEY = 'mediguard.sidebar';

function AppLayout() {
  const { user, logout } = useAuth();
  const { unread } = useNotifications();
  const nav = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; } });
  const [q, setQ] = useState('');
  const searchRef = useRef(null);
  const items = NAV[user.role];

  useEffect(() => { setOpen(false); window.scrollTo(0, 0); }, [loc.pathname]);
  useEffect(() => { try { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0'); } catch { /* storage unavailable */ } }, [collapsed]);
  useEffect(() => {
    // "/" jumps to search, like most modern dashboards.
    const onKey = (e) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
      if (searchRef.current) { e.preventDefault(); searchRef.current.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const search = (e) => { e.preventDefault(); nav(`/app/patients?q=${encodeURIComponent(q.trim())}`); };
  const canSearch = user.role === 'doctor' || user.role === 'pharmacist';
  const link = ({ isActive }) => `nav-link ${isActive ? 'active' : ''}`;

  return (
    <div className={`app ${collapsed ? 'is-collapsed' : ''}`}>
      <a href="#main" className="skip-link" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to main content</a>
      <div className={`sidebar-scrim ${open ? 'open' : ''}`} onClick={() => setOpen(false)} aria-hidden="true" />
      <aside className={`sidebar ${open ? 'open' : ''}`} id="app-sidebar" aria-label="Sidebar">
        <div className="sidebar-brand">
          <Brand />
          <button className="collapse-btn" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}><PanelLeftClose size={15} /></button>
        </div>
        <div className="sidebar-user">
          <Portrait role={user.role} size={40} />
          <div><b>{user.name}</b><span>{user.roleLabel}</span></div>
        </div>
        <nav className="sidebar-nav" aria-label="Main">
          {items.map(({ to, label, icon: I, badge, section }) => (
            <Fragment key={to}>
              {section && <div className="nav-section" role="presentation">{section}</div>}
              <NavLink to={to} end={to === '/app/dashboard'} className={link} title={collapsed ? label : undefined}>
                <I size={18} /><span className="nav-label">{label}</span>{badge && unread > 0 && <span className="count" aria-label={`${unread} unread`}>{unread}</span>}
              </NavLink>
            </Fragment>
          ))}
        </nav>
        <div className="sidebar-foot">
          <NavLink to="/app/settings" className={link} title={collapsed ? 'Profile & Settings' : undefined}><UserCog size={18} /><span className="nav-label">Profile & Settings</span></NavLink>
          <NavLink to="/app/help" className={link} title={collapsed ? 'Help & Support' : undefined}><LifeBuoy size={18} /><span className="nav-label">Help & Support</span></NavLink>
        </div>
      </aside>

      <div className="app-main">
        <SystemBanner />
        <header className="topbar">
          <button className="icon-btn menu-btn" aria-label="Open menu" aria-expanded={open} aria-controls="app-sidebar" onClick={() => setOpen(true)}><Menu size={18} /></button>
          {canSearch && (
            <form className="search input-icon" onSubmit={search} role="search">
              <Search size={16} />
              <input ref={searchRef} className="input" placeholder="Search patients, medications, or IDs…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search patients" />
              <span className="search-kbd" aria-hidden="true">/</span>
            </form>
          )}
          <div className="topbar-right">
            <button className="icon-btn" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} onClick={() => nav('/app/notifications')}><Bell size={17} />{unread > 0 && <span className="pip" />}</button>
            <button className="icon-btn" aria-label="Settings" onClick={() => nav('/app/settings')}><Settings size={17} /></button>
            <Popover trigger={({ toggle, open: o }) => (
              <button className="user-btn" onClick={toggle} aria-haspopup="menu" aria-expanded={o}>
                <Portrait role={user.role} size={36} />
                <span className="who"><b>{user.name}</b><span>{user.roleLabel}</span></span>
                <ChevronDown size={14} color="var(--muted)" />
              </button>
            )}>
              <button onClick={() => nav('/app/settings')}><User size={15} />Profile & Settings</button>
              <button onClick={() => nav('/app/help')}><LifeBuoy size={15} />Help & Support</button>
              <hr />
              <button className="danger" onClick={() => { logout(); nav('/login'); }}><LogOut size={15} />Sign out</button>
            </Popover>
          </div>
        </header>
        <main className="content route-fade" id="main" tabIndex={-1} key={loc.pathname}><Outlet /></main>
      </div>
    </div>
  );
}

/** Route guard: shows the dashboard if the current role can't open a page. */
export function RoleGate({ roles, children }) {
  const { user } = useAuth();
  if (!roles.includes(user.role)) return <Navigate to="/app/dashboard" replace />;
  return children;
}
