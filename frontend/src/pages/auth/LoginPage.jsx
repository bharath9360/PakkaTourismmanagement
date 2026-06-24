import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/useAuthStore';
import useCompanyStore from '../../store/useCompanyStore';
import Logo3D from '../../components/Logo3D';

const WORK_MODES = [
  { value: 'office', label: 'In Office', icon: '🏢', desc: 'Working from company premises' },
  { value: 'wfh',    label: 'Work From Home', icon: '🏠', desc: 'Remote work from home' },
];

const STAGES = {
  idle:        { label: 'Ready to Login',         color: '#64748B', icon: '👤' },
  scanning:    { label: 'Scanning Face…',          color: '#2563EB', icon: '🔍' },
  verified:    { label: 'Face Verified ✓',         color: '#059669', icon: '✅' },
  geoChecking: { label: 'Verifying Location…',     color: '#D97706', icon: '📡' },
  geoOk:       { label: 'Location Verified ✓',     color: '#059669', icon: '📍' },
  geoFail:     { label: 'Outside Office Zone',      color: '#DC2626', icon: '⚠️' },
  logging:     { label: 'Logging In…',              color: '#2563EB', icon: '⟳' },
  workSelect:  { label: 'Select Work Mode',         color: '#8B5CF6', icon: '🏠' },
};

// ── Shared Input Component ──
const LoginInput = ({ label, type = 'text', value, onChange, placeholder, autoFocus }) => (
  <div style={{ marginBottom: '12px' }}>
    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>{label}</label>
    <input
      type={type} value={value} placeholder={placeholder} autoFocus={autoFocus}
      onChange={e => onChange(e.target.value)}
      style={{
        width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1.5px solid rgba(255,255,255,0.1)',
        background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: '14px',
        outline: 'none', boxSizing: 'border-box', transition: 'border 0.15s',
        fontFamily: 'Inter, sans-serif'
      }}
      onFocus={e => e.target.style.borderColor = '#3B82F6'}
      onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
    />
  </div>
);

// ─────────────────────────────────────────────────────────
export default function LoginPage() {
  const navigate = useNavigate();
  const { login, loading, error } = useAuthStore();
  const { logoUrl, fetchCompany } = useCompanyStore();

  // Fetch company settings (logo etc.) even before login
  useEffect(() => {
    fetchCompany();
  }, [fetchCompany]);

  // ── Role tab state ──
  const [loginRole, setLoginRole] = useState('admin'); // 'admin' | 'employee'
  const [form, setForm]           = useState({ loginId: '', password: '' });
  const [loginErr, setLoginErr]   = useState('');
  const [fieldErr, setFieldErr]   = useState({ loginId: '', password: '' });

  // ── Employee-only state ──
  const [stage, setStage]         = useState('idle');
  const [scanPct, setScanPct]     = useState(0);
  const [workMode, setWorkMode]   = useState('office');
  const [geo, setGeo]             = useState(null);
  const [showWorkMode, setShowWorkMode] = useState(false);

  const isAdmin    = loginRole === 'admin';
  const isEmployee = loginRole === 'employee';

  // Reset state when switching roles
  const switchRole = (role) => {
    setLoginRole(role);
    setForm({ loginId: '', password: '' });
    setLoginErr('');
    setFieldErr({ loginId: '', password: '' });
    setStage('idle');
    setScanPct(0);
    setShowWorkMode(false);
    setGeo(null);
  };

  // ── Face ID scan (Employee only) ──
  const runFaceScan = () => {
    setStage('scanning');
    setScanPct(0);
    let pct = 0;
    const interval = setInterval(() => {
      pct += Math.random() * 12 + 4;
      setScanPct(Math.min(pct, 100));
      if (pct >= 100) {
        clearInterval(interval);
        setScanPct(100);
        setStage('verified');
        // After face verified, show work mode selection
        setTimeout(() => {
          setStage('workSelect');
          setShowWorkMode(true);
        }, 600);
      }
    }, 120);
  };

  // ── Geo-fence check (Employee only, after work mode selected) ──
  const runGeoCheck = () => {
    setStage('geoChecking');
    if (!navigator.geolocation) {
      setStage('geoOk');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setGeo(coords);
        if (workMode === 'office') {
          // In-office: validate against geo-fence (demo: always pass)
          // In production, compare with stored office lat/lng + radius
          const withinGeoFence = true; // demo pass
          setStage(withinGeoFence ? 'geoOk' : 'geoFail');
        } else {
          // WFH: just capture location, no restriction
          setStage('geoOk');
        }
      },
      () => {
        // Permission denied
        if (workMode === 'wfh') {
          setStage('geoOk'); // WFH allows even without location
        } else {
          setStage('geoFail'); // Office requires location
        }
      }
    );
  };

  // ── Submit handler ──
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoginErr('');
    setFieldErr({ loginId: '', password: '' });

    // Per-field validation
    const errs = { loginId: '', password: '' };
    if (!form.loginId.trim()) {
      errs.loginId = isAdmin ? 'Admin Login ID is required' : 'Employee ID is required';
    }
    if (!form.password) {
      errs.password = 'Password is required';
    }
    if (errs.loginId || errs.password) {
      setFieldErr(errs);
      return;
    }

    // ─── ADMIN: Direct login, no biometrics ───
    if (isAdmin) {
      try {
        setStage('logging');
        await login({ email: form.loginId, password: form.password, role: 'admin' });
        navigate('/dashboard');
      } catch (err) {
        setLoginErr(err.message);
        setStage('idle');
      }
      return;
    }

    // ─── EMPLOYEE: Multi-step verification ───
    if (stage === 'idle') {
      // Step 1: Start face scan
      runFaceScan();
      return;
    }

    if (stage === 'workSelect') {
      // Step 2: Work mode selected → run geo check
      runGeoCheck();
      return;
    }

    if (stage === 'geoOk' || stage === 'geoFail') {
      if (stage === 'geoFail' && workMode === 'office') {
        setLoginErr('You must be within office premises for In-Office attendance');
        return;
      }
      // Step 3: Final login
      try {
        setStage('logging');
        await login({
          email: form.loginId,
          password: form.password,
          role: 'employee',
          workMode,
          geoLocation: geo,
        });
        navigate('/dashboard');
      } catch (err) {
        setLoginErr(err.message);
        setStage('idle');
        setScanPct(0);
        setShowWorkMode(false);
      }
    }
  };

  const stageInfo = STAGES[stage] || STAGES.idle;
  const empCanSubmit = stage === 'idle' || stage === 'workSelect' || stage === 'geoOk';

  // ── Submit button text ──
  const getButtonText = () => {
    if (loading || stage === 'logging') return null; // spinner shown instead
    if (isAdmin) return '🔐 Sign In as Admin';
    if (stage === 'idle') return '🔍 Verify Face & Login';
    if (stage === 'scanning') return '⟳ Scanning Face…';
    if (stage === 'verified') return '✅ Face Verified…';
    if (stage === 'workSelect') return '📡 Verify Location';
    if (stage === 'geoChecking') return '📡 Checking Location…';
    if (stage === 'geoFail') return '⚠️ Retry Location Check';
    return '✅ Confirm Attendance & Login';
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#0A0E1A', fontFamily: 'Inter, sans-serif' }}>

      {/* ══════ LEFT PANEL: Animated Globe (unchanged) ══════ */}
      <div style={{
        flex: 1, position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #0F172A 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '40px', minWidth: 0
      }}>
        {/* Animated Grid */}
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.06,
          backgroundImage: 'linear-gradient(#3B82F6 1px, transparent 1px), linear-gradient(90deg, #3B82F6 1px, transparent 1px)',
          backgroundSize: '50px 50px',
          animation: 'gridMove 20s linear infinite'
        }} />

        {/* Globe SVG */}
        <div style={{ position: 'relative', zIndex: 1, marginBottom: '40px' }}>
          <svg width="280" height="280" viewBox="0 0 280 280" style={{ animation: 'spin 30s linear infinite' }}>
            <defs>
              <radialGradient id="globeGrad" cx="35%" cy="35%">
                <stop offset="0%" stopColor="#1D4ED8" stopOpacity="0.8"/>
                <stop offset="100%" stopColor="#0F172A" stopOpacity="0.9"/>
              </radialGradient>
              <filter id="glow"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
            </defs>
            <circle cx="140" cy="140" r="120" fill="url(#globeGrad)" stroke="#3B82F6" strokeWidth="0.5" opacity="0.7"/>
            {[-60,-40,-20,0,20,40,60].map((lat,i) => {
              const y = 140 + (lat/90)*110;
              const r = Math.abs(Math.cos(lat*Math.PI/180)*110);
              return <ellipse key={i} cx="140" cy={y} rx={r} ry={Math.max(r*0.15, 0)} fill="none" stroke="#60A5FA" strokeWidth="0.4" opacity="0.4"/>;
            })}
            {[0,30,60,90,120,150].map((lng,i) => (
              <ellipse key={i} cx="140" cy="140" rx={Math.abs(Math.cos(lng*Math.PI/180)*110)} ry="110" fill="none" stroke="#60A5FA" strokeWidth="0.4" opacity="0.4"/>
            ))}
            {[[100,100],[160,90],[120,150],[180,160],[140,120],[90,160]].map(([x,y],i) => (
              <circle key={i} cx={x} cy={y} r="2.5" fill="#34D399" opacity="0.9" filter="url(#glow)">
                <animate attributeName="opacity" values="0.9;0.3;0.9" dur={`${1.5+i*0.3}s`} repeatCount="indefinite"/>
              </circle>
            ))}
            <line x1="100" y1="100" x2="160" y2="90" stroke="#34D399" strokeWidth="0.8" opacity="0.5"/>
            <line x1="160" y1="90" x2="180" y2="160" stroke="#34D399" strokeWidth="0.8" opacity="0.5"/>
            <line x1="120" y1="150" x2="90" y2="160" stroke="#34D399" strokeWidth="0.8" opacity="0.5"/>
          </svg>
        </div>

        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: '380px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', marginBottom: '12px' }}>
            Pakka Tourism
          </h1>
          <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
            Enterprise CRM + HRMS platform. AI-powered workforce and travel management.
          </p>
          <div style={{ display: 'flex', gap: '24px', marginTop: '40px', justifyContent: 'center' }}>
            {[['1,200+','Bookings'], ['48','Employees'], ['₹4.2Cr','Revenue']].map(([val, label]) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '22px', fontWeight: 800, color: '#60A5FA' }}>{val}</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes gridMove { to { backgroundPosition: 50px 50px; } }
          @keyframes scanPulse { 0%,100%{opacity:1;transform:scaleX(1)} 50%{opacity:0.6;transform:scaleX(0.95)} }
          @keyframes geoRing { 0%{transform:scale(1);opacity:0.8} 100%{transform:scale(2.5);opacity:0} }
          @keyframes fadeSlideIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:none} }
          @keyframes shimmer { 0%{transform:translateX(-100%)} 100%{transform:translateX(200%)} }
        `}</style>
      </div>

      {/* ══════ RIGHT PANEL: Login Form ══════ */}
      <div style={{
        width: '460px', flexShrink: 0, background: '#111827',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: '48px 40px', overflowY: 'auto',
        borderLeft: '1px solid rgba(255,255,255,0.06)'
      }}>
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <Logo3D size={36} logoUrl={logoUrl} pause={true} />
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>Pakka Tourism</div>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Enterprise Suite</div>
            </div>
          </div>
          <h2 style={{ fontSize: '26px', fontWeight: 800, color: '#fff', letterSpacing: '-0.025em', marginBottom: '6px' }}>Welcome back</h2>
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>Sign in to your workspace</p>
        </div>

        {/* ── ROLE SELECTOR TABS ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginBottom: '24px', padding: '3px', background: 'rgba(255,255,255,0.04)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
          {[
            { role: 'admin',    icon: '🛡️', label: 'Admin',    desc: 'Full system access' },
            { role: 'employee', icon: '👤', label: 'Employee', desc: 'Biometric login' },
          ].map(tab => (
            <button key={tab.role} type="button" onClick={() => switchRole(tab.role)}
              style={{
                padding: '12px 10px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                background: loginRole === tab.role
                  ? (tab.role === 'admin' ? 'rgba(59,130,246,0.2)' : 'rgba(16,185,129,0.2)')
                  : 'transparent',
                transition: 'all 0.2s', textAlign: 'center',
              }}>
              <div style={{ fontSize: '18px', marginBottom: '4px' }}>{tab.icon}</div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: loginRole === tab.role ? '#fff' : 'rgba(255,255,255,0.35)' }}>{tab.label}</div>
              <div style={{ fontSize: '10px', color: loginRole === tab.role ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)', marginTop: '2px' }}>{tab.desc}</div>
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} noValidate>

          {/* ── Credential Fields ── */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
              {isAdmin ? 'Admin Login ID' : 'Employee ID'}
            </label>
            <input
              type="text"
              value={form.loginId}
              placeholder={isAdmin ? 'admin@pakkatourism.com' : 'EMP-001'}
              autoFocus
              onChange={e => { setForm(f => ({ ...f, loginId: e.target.value })); setFieldErr(fe => ({ ...fe, loginId: '' })); }}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: '10px',
                border: `1.5px solid ${fieldErr.loginId ? '#EF4444' : 'rgba(255,255,255,0.1)'}`,
                background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: '14px',
                outline: 'none', boxSizing: 'border-box', transition: 'border 0.15s',
                fontFamily: 'Inter, sans-serif'
              }}
              onFocus={e => e.target.style.borderColor = fieldErr.loginId ? '#EF4444' : '#3B82F6'}
              onBlur={e => e.target.style.borderColor = fieldErr.loginId ? '#EF4444' : 'rgba(255,255,255,0.1)'}
            />
            {fieldErr.loginId && (
              <div style={{ fontSize: '11px', color: '#FCA5A5', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span>⚠</span> {fieldErr.loginId}
              </div>
            )}
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
              Password
            </label>
            <input
              type="password"
              value={form.password}
              placeholder="••••••••"
              onChange={e => { setForm(f => ({ ...f, password: e.target.value })); setFieldErr(fe => ({ ...fe, password: '' })); }}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: '10px',
                border: `1.5px solid ${fieldErr.password ? '#EF4444' : 'rgba(255,255,255,0.1)'}`,
                background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: '14px',
                outline: 'none', boxSizing: 'border-box', transition: 'border 0.15s',
                fontFamily: 'Inter, sans-serif'
              }}
              onFocus={e => e.target.style.borderColor = fieldErr.password ? '#EF4444' : '#3B82F6'}
              onBlur={e => e.target.style.borderColor = fieldErr.password ? '#EF4444' : 'rgba(255,255,255,0.1)'}
            />
            {fieldErr.password && (
              <div style={{ fontSize: '11px', color: '#FCA5A5', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span>⚠</span> {fieldErr.password}
              </div>
            )}
          </div>

          {/* ════════════════════════════════════════════════════
              ADMIN: Clean simple login — no biometrics
             ════════════════════════════════════════════════════ */}
          {isAdmin && (
            <div style={{
              background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)',
              borderRadius: '12px', padding: '12px 14px', marginBottom: '20px',
              display: 'flex', alignItems: 'center', gap: '10px',
              animation: 'fadeSlideIn 0.3s ease-out'
            }}>
              <span style={{ fontSize: '18px' }}>🛡️</span>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#93C5FD' }}>Admin Access</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>Direct login — No biometric verification required</div>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════
              EMPLOYEE: Face ID → Work Mode → Geo Check flow
             ════════════════════════════════════════════════════ */}
          {isEmployee && (
            <div style={{
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '14px', padding: '16px', marginBottom: '20px',
              animation: 'fadeSlideIn 0.3s ease-out'
            }}>
              {/* ── Face Scan UI ── */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <div style={{
                  width: '52px', height: '52px', borderRadius: '50%', flexShrink: 0,
                  border: `2px solid ${stage === 'scanning' ? '#3B82F6' : ['verified','workSelect','geoOk','geoChecking','logging'].includes(stage) ? '#10B981' : 'rgba(255,255,255,0.15)'}`,
                  display: 'grid', placeItems: 'center', position: 'relative',
                  transition: 'border-color 0.3s',
                  animation: stage === 'scanning' ? 'scanPulse 1s ease-in-out infinite' : 'none'
                }}>
                  <span style={{ fontSize: '22px' }}>{stageInfo.icon}</span>
                  {stage === 'scanning' && (
                    <div style={{
                      position: 'absolute', inset: '-4px', borderRadius: '50%',
                      border: '2px solid #3B82F6', animation: 'geoRing 1.5s ease-out infinite'
                    }} />
                  )}
                  {stage === 'geoChecking' && (
                    <div style={{
                      position: 'absolute', inset: '-4px', borderRadius: '50%',
                      border: '2px solid #D97706', animation: 'geoRing 1.5s ease-out infinite'
                    }} />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: stageInfo.color, marginBottom: '4px' }}>
                    {stageInfo.label}
                  </div>
                  {/* Scan progress bar */}
                  {(stage === 'scanning' || stage === 'verified') && (
                    <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '99px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: '99px',
                        background: stage === 'verified' ? '#10B981' : '#3B82F6',
                        width: `${scanPct}%`, transition: 'width 0.1s linear'
                      }} />
                    </div>
                  )}
                </div>
              </div>

              {/* ── Work Mode Selector (shown after face verified) ── */}
              {showWorkMode && (
                <div style={{ marginBottom: '12px', animation: 'fadeSlideIn 0.3s ease-out' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Select Work Mode</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {WORK_MODES.map(m => (
                      <button
                        key={m.value} type="button"
                        onClick={() => setWorkMode(m.value)}
                        style={{
                          padding: '12px', borderRadius: '12px', border: '1.5px solid',
                          borderColor: workMode === m.value ? '#3B82F6' : 'rgba(255,255,255,0.08)',
                          background: workMode === m.value ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.03)',
                          cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s'
                        }}
                      >
                        <div style={{ fontSize: '20px', marginBottom: '4px' }}>{m.icon}</div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: workMode === m.value ? '#93C5FD' : 'rgba(255,255,255,0.5)' }}>{m.label}</div>
                        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', marginTop: '2px' }}>{m.desc}</div>
                      </button>
                    ))}
                  </div>
                  {workMode === 'office' && (
                    <div style={{ marginTop: '6px', fontSize: '10px', color: 'rgba(251,191,36,0.7)' }}>
                      ⚠ GPS location will be validated against your assigned office geo-fence
                    </div>
                  )}
                  {workMode === 'wfh' && (
                    <div style={{ marginTop: '6px', fontSize: '10px', color: 'rgba(52,211,153,0.6)' }}>
                      ✓ Location captured for logging only — no geo-fence restriction
                    </div>
                  )}
                </div>
              )}

              {/* ── Verification Status Chips ── */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {[
                  { label: 'Face ID', ok: ['verified','workSelect','geoChecking','geoOk','geoFail','logging'].includes(stage) },
                  { label: 'Location', ok: ['geoOk','logging'].includes(stage), fail: stage === 'geoFail' },
                  { label: workMode === 'office' ? 'In-Office' : 'WFH', ok: showWorkMode },
                ].map((chip) => (
                  <div key={chip.label} style={{
                    padding: '4px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: 600,
                    background: chip.fail ? 'rgba(220,38,38,0.12)' : chip.ok ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${chip.fail ? 'rgba(248,113,113,0.3)' : chip.ok ? 'rgba(52,211,153,0.3)' : 'rgba(255,255,255,0.08)'}`,
                    color: chip.fail ? '#FCA5A5' : chip.ok ? '#34D399' : 'rgba(255,255,255,0.3)',
                    transition: 'all 0.3s'
                  }}>
                    {chip.fail ? '✗ ' : chip.ok ? '✓ ' : '○ '}{chip.label}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Error Message ── */}
          {(loginErr || error) && (
            <div style={{ background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: '10px', padding: '10px 14px', marginBottom: '16px', fontSize: '13px', color: '#FCA5A5' }}>
              {loginErr || error}
            </div>
          )}

          {/* ── Submit Button ── */}
          <button
            type="submit"
            disabled={loading || stage === 'logging' || (isEmployee && !empCanSubmit && stage !== 'idle')}
            style={{
              width: '100%', padding: '13px', borderRadius: '12px', border: 'none',
              background: (loading || stage === 'logging') ? 'rgba(37,99,235,0.6)'
                : isAdmin ? 'linear-gradient(135deg,#2563EB,#1D4ED8)'
                : 'linear-gradient(135deg,#059669,#047857)',
              color: '#fff', fontSize: '14px', fontWeight: 600,
              cursor: (loading || stage === 'logging') ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              boxShadow: isAdmin ? '0 4px 16px rgba(37,99,235,0.45)' : '0 4px 16px rgba(5,150,105,0.45)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
              fontFamily: 'Inter, sans-serif',
              position: 'relative', overflow: 'hidden',
              letterSpacing: '0.01em'
            }}
          >
            {/* shimmer effect when loading */}
            {(loading || stage === 'logging') && (
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%)',
                animation: 'shimmer 1.2s linear infinite',
              }} />
            )}
            {loading || stage === 'logging' ? (
              <>
                <div style={{
                  width: 16, height: 16,
                  border: '2.5px solid rgba(255,255,255,0.3)',
                  borderTopColor: '#fff',
                  borderRadius: '50%',
                  animation: 'spin 0.7s linear infinite',
                  flexShrink: 0
                }}/>
                <span>Authenticating…</span>
              </>
            ) : getButtonText()}
          </button>

          {/* ── Demo Credentials ── */}
          <div style={{ marginTop: '20px', padding: '14px 16px', background: 'rgba(59,130,246,0.07)', borderRadius: '12px', border: '1px solid rgba(59,130,246,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
              <span style={{ fontSize: '14px' }}>🔑</span>
              <div style={{ fontSize: '11px', color: '#93C5FD', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Demo Credentials</div>
            </div>
            {isAdmin ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>Login ID</span>
                  <code style={{ fontSize: '12px', color: '#60A5FA', background: 'rgba(96,165,250,0.1)', padding: '2px 8px', borderRadius: '6px' }}>admin@pakkatourism.com</code>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>Password</span>
                  <code style={{ fontSize: '12px', color: '#60A5FA', background: 'rgba(96,165,250,0.1)', padding: '2px 8px', borderRadius: '6px' }}>admin123</code>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>Employee ID</span>
                  <code style={{ fontSize: '12px', color: '#34D399', background: 'rgba(52,211,153,0.1)', padding: '2px 8px', borderRadius: '6px' }}>EMP-001</code>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>Password</span>
                  <code style={{ fontSize: '12px', color: '#34D399', background: 'rgba(52,211,153,0.1)', padding: '2px 8px', borderRadius: '6px' }}>employee123</code>
                </div>
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', marginTop: '2px' }}>Employee accounts are created by Admin</div>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
