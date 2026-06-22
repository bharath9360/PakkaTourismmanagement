import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/useAuthStore';
import Logo3D from '../Logo3D';

/* ─── Inline SVG icon helper ────────────────────────────────────────────── */
const Icon = ({ d, size = 18 }) => (
  <svg
    width={size} height={size}
    viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round"
    className="sidebar-item-icon"
    aria-hidden="true"
  >
    <path d={d} />
  </svg>
);

/* ─── Icon paths ─────────────────────────────────────────────────────────── */
const ICONS = {
  dashboard: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10',
  attendance:'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10',
  leads:     'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8 M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75',
  quotes:    'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
  matrix:    'M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z',
  pricing:   'M12 1v22 M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
  bookings:  'M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z',
  vendors:   'M3 9a2 2 0 012-2h14a2 2 0 012 2 M3 9v10a2 2 0 002 2h14a2 2 0 002-2V9 M8 21V9 M12 21V9 M16 21V9',
  finance:   'M12 2L2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5',
  itinerary: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7',
  analytics: 'M18 20V10 M12 20V4 M6 20v-6',
  whatsapp:  'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z',
  exports:   'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4 M7 10l5 5 5-5 M12 15V3',
  settings:  'M12 15a3 3 0 100-6 3 3 0 000 6z M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z',
  logout:    'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',
  profile:   'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M12 11a4 4 0 100-8 4 4 0 000 8',
};

/* ─── Navigation groups ──────────────────────────────────────────────────── */
const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { to: '/dashboard',  label: 'Dashboard',       icon: 'dashboard',  roles: ['all'] },
      { to: '/attendance', label: 'Attendance',       icon: 'attendance', roles: ['all'] },
      { to: '/profile',    label: 'My Profile',      icon: 'profile',    roles: ['all'] },
    ]
  },
  {
    label: 'CRM',
    items: [
      { to: '/leads',     label: 'Lead Pipeline',    icon: 'leads',      roles: ['all'] },
      { to: '/quotes',    label: 'Quote Builder',     icon: 'quotes',     roles: ['all'] },
      { to: '/bookings',  label: 'Bookings',          icon: 'bookings',   roles: ['all'] },
      { to: '/itinerary', label: 'Itinerary',         icon: 'itinerary',  roles: ['all'] },
    ]
  },
  {
    label: 'Pricing',
    items: [
      { to: '/matrix',    label: 'Tariff Matrix',    icon: 'matrix',     roles: ['all'] },
      { to: '/pricing',   label: 'Pricing Engine',   icon: 'pricing',    roles: ['admin'] },
    ]
  },
  {
    label: 'Finance',
    items: [
      { to: '/vendors',   label: 'Vendors',           icon: 'vendors',    roles: ['all'] },
      { to: '/finance',   label: 'Financial Ledger',  icon: 'finance',    roles: ['admin'] },
    ]
  },
  {
    label: 'Intelligence',
    items: [
      { to: '/analytics', label: 'Analytics',         icon: 'analytics',  roles: ['admin'] },
      { to: '/whatsapp',  label: 'WhatsApp',          icon: 'whatsapp',   roles: ['all'] },
      { to: '/exports',   label: 'Excel Export',      icon: 'exports',    roles: ['all'] },
      { to: '/settings',  label: 'Settings',          icon: 'settings',   roles: ['admin'] },
    ]
  },
];

const AVATAR_COLORS = { admin: '#2563EB', employee: '#10B981' };

/* ─── Sidebar component ──────────────────────────────────────────────────── */
export default function Sidebar({ mobileOpen, onMobileClose }) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const canSee = (roles) => roles.includes('all') || roles.includes(user?.role);

  const handleLogout = () => {
    logout();              // clears Zustand state + localStorage (via useAuthStore)
    navigate('/login', { replace: true });
  };

  return (
    <aside className={`app-sidebar${mobileOpen ? ' sidebar-mobile-open' : ''}`}>
      {/* ── Brand ─────────────────────────────────────────────────────── */}
      <div className="sidebar-brand">
        <Logo3D size={38} logoUrl={user?.companyLogo || null} />
        <div className="sidebar-brand-text">
          <div className="sidebar-brand-name">Pakka Tourism</div>
          <div className="sidebar-brand-sub">Enterprise Suite</div>
        </div>

        {/* Close button — mobile only */}
        <button
          className="sidebar-close-btn"
          onClick={onMobileClose}
          aria-label="Close menu"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* ── Navigation ────────────────────────────────────────────── */}
      <nav className="sidebar-nav" aria-label="Main navigation">
        {NAV_GROUPS.map((group) => {
          const visible = group.items.filter(i => canSee(i.roles));
          if (!visible.length) return null;
          return (
            <div key={group.label}>
              <div className="sidebar-section">{group.label}</div>
              {visible.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}
                  onClick={onMobileClose}   // close drawer on nav on mobile
                >
                  <Icon d={ICONS[item.icon]} />
                  <span className="sidebar-label">{item.label}</span>
                  {item.badge && (
                    <span className="sidebar-badge">{item.badge}</span>
                  )}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>

      {/* ── Footer ────────────────────────────────────────────────── */}
      <div className="sidebar-footer">
        {/* User info */}
        <div className="sidebar-user" onClick={() => { navigate('/profile'); onMobileClose(); }}>
          <div
            className="sidebar-avatar"
            style={{ background: AVATAR_COLORS[user?.role] || '#3B82F6' }}
          >
            {(user?.name || 'U')[0].toUpperCase()}
          </div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{user?.name || 'User'}</div>
            <div className="sidebar-user-role">{user?.role?.replace('_', ' ')}</div>
          </div>
          <div className="sidebar-online" aria-hidden="true" />
        </div>

        {/* Logout button — always visible, red */}
        <button
          className="sidebar-logout-btn"
          onClick={handleLogout}
          aria-label="Logout"
        >
          <Icon d={ICONS.logout} size={16} />
          <span className="sidebar-label">Logout</span>
        </button>
      </div>
    </aside>
  );
}
