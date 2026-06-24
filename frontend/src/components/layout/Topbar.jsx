import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/useAuthStore';
import useNotificationStore from '../../store/useNotificationStore';

const PAGE_TITLES = {
  '/dashboard': 'Dashboard', '/admin': 'Admin Dashboard',
  '/attendance': 'Smart Attendance', '/leads': 'Lead Pipeline',
  '/quotes': 'Quote Builder', '/matrix': 'Tariff Matrix',
  '/pricing': 'Pricing Engine', '/bookings': 'Booking Management',
  '/vendors': 'Vendor Management', '/finance': 'Financial Ledger',
  '/itinerary': 'Itinerary Builder', '/analytics': 'Analytics',
  '/whatsapp': 'WhatsApp Automation', '/exports': 'Excel Export',
  '/settings': 'Settings',
};

const TYPE_ICONS = {
  lead_assigned: '👤', lead_reassigned: '🔄', followup_reminder: '⏰',
  followup_overdue: '⚠️', lead_converted: '🎉', lead_lost: '❌',
  attendance_marked: '✅', geofence_failure: '📍', quote_sent: '📄',
  advance_received: '💰', booking_confirmed: '🎊', general: 'ℹ️'
};

function timeAgo(date) {
  const secs = Math.floor((new Date() - new Date(date)) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export default function Topbar({ onMenuToggle, mobileOpen }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, token } = useAuthStore();
  const { notifications, unreadCount, fetchNotifications, markRead, markAllRead, connectSocket, disconnectSocket } = useNotificationStore();
  const [notifOpen, setNotifOpen] = useState(false);
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'light');
  const notifRef = useRef(null);

  const pageTitle = PAGE_TITLES[location.pathname] || 'Pakka Tourism';

  // Connect socket and fetch notifications on mount
  useEffect(() => {
    if (token) {
      connectSocket(token);
      fetchNotifications();
      // Request browser notification permission
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }
    return () => disconnectSocket();
  }, [token]);

  // Refresh notification count on route change
  useEffect(() => {
    if (token) fetchNotifications();
  }, [location.pathname]);

  // Close notification panel on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    setTheme(next);
  };

  const handleNotifClick = (notif) => {
    if (!notif.read) markRead(notif._id);
    if (notif.actionUrl) navigate(notif.actionUrl);
    setNotifOpen(false);
  };

  const ROLE_COLORS = {
    admin: '#2563EB', employee: '#059669'
  };
  const roleColor = ROLE_COLORS[user?.role] || '#64748B';

  return (
    <header className="app-topbar">
      {/* Left */}
      <div className="topbar-left">
        {/* Hamburger / Close button */}
        <button
          className="btn btn-ghost btn-icon btn-sm topbar-hamburger"
          onClick={onMenuToggle}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? (
            /* X icon when open */
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            /* Hamburger ≡ when closed */
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6"  x2="21" y2="6"  />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          )}
        </button>
        <div>
          <div className="topbar-breadcrumb">Pakka Tourism</div>
          <div className="topbar-page">{pageTitle}</div>
        </div>
      </div>

      {/* Right */}
      <div className="topbar-right">
        {/* Role Badge — hidden on mobile */}
        <span className="badge topbar-role-badge" style={{ background: `${roleColor}18`, color: roleColor, borderColor: `${roleColor}30`, fontSize: '11px', fontWeight: 700 }}>
          {user?.role?.toUpperCase()}
        </span>

        {/* Theme Toggle — hidden on mobile */}
        <button className="btn btn-ghost btn-icon btn-sm topbar-theme-btn" onClick={toggleTheme} aria-label="Toggle theme">
          {theme === 'light' ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M6 .278a.768.768 0 0 1 .08.858 7.208 7.208 0 0 0-.878 3.46c0 4.021 3.278 7.277 7.318 7.277.527 0 1.04-.055 1.533-.16a.787.787 0 0 1 .81.316.733.733 0 0 1-.031.893A8.349 8.349 0 0 1 8.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.752.752 0 0 1 6 .278z" /></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 12.5a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11z" /></svg>
          )}
        </button>

        {/* 🔔 Notifications Bell */}
        <div style={{ position: 'relative' }} ref={notifRef}>
          <button
            className="btn btn-ghost btn-icon btn-sm"
            onClick={() => setNotifOpen(o => !o)}
            aria-label="Notifications"
            style={{ position: 'relative' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
            </svg>
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute', top: '-4px', right: '-4px',
                minWidth: '16px', height: '16px', padding: '0 3px',
                background: '#EF4444', borderRadius: '8px', fontSize: '9px',
                fontWeight: 700, color: '#fff', display: 'grid', placeItems: 'center',
                border: '2px solid var(--color-bg-surface)',
                animation: 'pulse 1.5s ease-in-out infinite'
              }}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Notification Panel */}
          {notifOpen && (
            <div style={{
          background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
              borderRadius: '16px', boxShadow: 'var(--shadow-xl)', zIndex: 200, overflow: 'hidden',
              maxHeight: '80vh', display: 'flex', flexDirection: 'column',
              /* Full-width on mobile, fixed on desktop */
              position: 'absolute', top: '48px', right: 0,
              width: 'min(340px, calc(100vw - 32px))',
            }}>
              {/* Header */}
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: '14px' }}>Notifications</span>
                  {unreadCount > 0 && <span style={{ marginLeft: '8px', background: '#EF4444', color: '#fff', borderRadius: '99px', padding: '1px 7px', fontSize: '10px', fontWeight: 700 }}>{unreadCount} new</span>}
                </div>
                {unreadCount > 0 && (
                  <button onClick={markAllRead} style={{ border: 'none', background: 'none', color: 'var(--color-accent)', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}>
                    Mark all read
                  </button>
                )}
              </div>

              {/* Notification list */}
              <div style={{ overflow: 'auto', flex: 1 }}>
                {notifications.length === 0 ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px' }}>
                    <div style={{ fontSize: '28px', marginBottom: '8px' }}>🔔</div>
                    All caught up!
                  </div>
                ) : (
                  notifications.slice(0, 20).map((n) => (
                    <div key={n._id}
                      onClick={() => handleNotifClick(n)}
                      style={{
                        display: 'flex', gap: '10px', padding: '12px 16px', cursor: 'pointer',
                        background: !n.read ? 'var(--color-accent-subtle)' : 'transparent',
                        borderBottom: '1px solid var(--color-border)',
                        transition: 'background 0.15s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg-secondary)'}
                      onMouseLeave={e => e.currentTarget.style.background = !n.read ? 'var(--color-accent-subtle)' : 'transparent'}
                    >
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--color-bg-secondary)', display: 'grid', placeItems: 'center', fontSize: '15px', flexShrink: 0 }}>
                        {TYPE_ICONS[n.type] || '🔔'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-primary)', lineHeight: 1.4, marginBottom: '2px' }}>{n.title}</div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{n.message}</div>
                        <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '3px' }}>{timeAgo(n.createdAt)}</div>
                      </div>
                      {!n.read && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#3B82F6', flexShrink: 0, marginTop: 6 }} />}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Avatar — shows profile photo if available */}
        <div
          onClick={() => navigate('/profile')}
          title={`${user?.name} — ${user?.role}`}
          style={{
            width: 34, height: 34, borderRadius: '50%', cursor: 'pointer',
            border: `2px solid ${roleColor}`,
            background: user?.profilePhoto
              ? `url(${user.profilePhoto.startsWith('http') ? user.profilePhoto : `http://${window.location.hostname}:5000${user.profilePhoto}`}) center/cover no-repeat`
              : roleColor,
            display: 'grid', placeItems: 'center',
            color: '#fff', fontWeight: 800, fontSize: '13px', flexShrink: 0,
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.boxShadow = `0 0 0 3px ${roleColor}40`; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}
        >
          {!user?.profilePhoto && (user?.name || 'U')[0].toUpperCase()}
        </div>
      </div>
    </header>
  );
}
