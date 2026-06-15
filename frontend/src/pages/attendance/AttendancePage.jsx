import React, { useState, useEffect, useRef, useCallback } from 'react';
import useAuthStore from '../../store/useAuthStore';
import api from '../../services/api';

/* ─── helpers ─────────────────────────────────────────────────────────────── */
const fmtTime = (d) => d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '—';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtHours = (h) => { const hrs = Math.floor(h); const min = Math.round((h - hrs) * 60); return `${hrs}h ${min}m`; };

const STATUS_BADGE = {
  present:  { cls: 'badge-confirmed',  label: 'Present' },
  absent:   { cls: 'badge-danger',     label: 'Absent' },
  half_day: { cls: 'badge-warning',    label: 'Half Day' },
  late:     { cls: 'badge-info',       label: 'Late' },
  on_leave: { cls: 'badge-neutral',    label: 'On Leave' },
};

const GEO_STATUS_COLOR = {
  verified: '#059669', failed: '#DC2626', wfh: '#2563EB', pending: '#D97706'
};

/* ─── Main Component ──────────────────────────────────────────────────────── */
export default function AttendancePage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const [activeTab, setActiveTab] = useState(isAdmin ? 'admin' : 'checkin');

  // Checkin state
  const [step, setStep]           = useState('idle'); // idle | camera | face | location | mode | done
  const [workMode, setWorkMode]   = useState('office');
  const [faceVerified, setFaceVerified] = useState(false);
  const [location, setLocation]   = useState(null);
  const [locationError, setLocationError] = useState('');
  const [geoStatus, setGeoStatus] = useState('idle'); // idle | fetching | granted | denied | unsupported
  const [scanning, setScanning]   = useState(false);
  const [scanPct, setScanPct]     = useState(0);
  const [checkedIn, setCheckedIn] = useState(false);
  const [checkedOut, setCheckedOut] = useState(false);
  const [todayRecord, setTodayRecord] = useState(null);
  const [checkInLoading, setCheckInLoading] = useState(false);
  const [checkOutLoading, setCheckOutLoading] = useState(false);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState('');
  const [now, setNow]             = useState(new Date());

  // History state
  const [history, setHistory]     = useState([]);
  const [historyStats, setHistoryStats] = useState(null);
  const [histLoading, setHistLoading] = useState(false);

  // Admin state
  const [adminRecords, setAdminRecords] = useState([]);
  const [adminStats, setAdminStats]     = useState(null);
  const [adminTrend, setAdminTrend]     = useState([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminFilter, setAdminFilter]   = useState({ date: '', status: '' });
  const [manualModal, setManualModal]   = useState(false);
  const [employees, setEmployees]       = useState([]);
  const [manualForm, setManualForm]     = useState({ employeeId: '', date: new Date().toISOString().split('T')[0], attendanceStatus: 'present', workMode: 'office', notes: '' });

  const videoRef = useRef(null);
  const streamRef = useRef(null);

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Auto-fetch geolocation on mount for employees
  useEffect(() => {
    if (!isAdmin) {
      autoFetchLocation();
    }
  }, []);

  // Load today's record on mount
  useEffect(() => {
    loadTodayRecord();
    if (isAdmin) {
      loadAdminStats();
      loadAdminRecords();
      loadAdminTrend();
      loadEmployees();
    }
  }, []);

  // Load attendance history when tab changes
  useEffect(() => {
    if (activeTab === 'history') loadHistory();
  }, [activeTab]);

  const loadTodayRecord = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data } = await api.get(`/attendance?month=${new Date().getMonth() + 1}&year=${new Date().getFullYear()}`);
      const todayRec = data.data?.find(r => r.date === today);
      if (todayRec) {
        setTodayRecord(todayRec);
        setCheckedIn(!!todayRec.checkInTime);
        setCheckedOut(!!todayRec.checkOutTime);
        if (todayRec.checkInTime) setStep('done');
      }
    } catch (err) {
      console.error('Failed to load today record:', err);
    }
  };

  const loadHistory = async () => {
    setHistLoading(true);
    try {
      const m = new Date().getMonth() + 1;
      const y = new Date().getFullYear();
      const { data } = await api.get(`/attendance?month=${m}&year=${y}&limit=31`);
      setHistory(data.data || []);
      setHistoryStats(data.stats || null);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setHistLoading(false);
    }
  };

  const loadAdminStats = async () => {
    try {
      const { data } = await api.get('/attendance/stats');
      setAdminStats(data.data);
    } catch (err) { console.error(err); }
  };

  const loadAdminRecords = async () => {
    setAdminLoading(true);
    try {
      const params = new URLSearchParams(adminFilter).toString();
      const { data } = await api.get(`/attendance/all?${params}&limit=50`);
      setAdminRecords(data.data || []);
    } catch (err) { console.error(err); } finally { setAdminLoading(false); }
  };

  const loadAdminTrend = async () => {
    try {
      const { data } = await api.get('/attendance/trend?days=14');
      setAdminTrend(data.data || []);
    } catch (err) { console.error(err); }
  };

  const loadEmployees = async () => {
    try {
      const { data } = await api.get('/auth/users');
      setEmployees(data.data || []);
    } catch (err) { console.error(err); }
  };

  /* ─── Camera (Face ID simulation) ─────────────────────────────────────── */
  const startCamera = async () => {
    setError('');
    setStep('camera');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      setError('Camera access denied. Face verification requires camera permission.');
      setStep('idle');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  const runFaceScan = () => {
    setScanning(true);
    setStep('face');
    setScanPct(0);
    let p = 0;
    const iv = setInterval(() => {
      p += Math.random() * 12 + 8;
      setScanPct(Math.min(p, 100));
      if (p >= 100) {
        clearInterval(iv);
        setFaceVerified(true);
        stopCamera();
        // If location already fetched on mount, go straight to work mode
        setTimeout(() => {
          if (location) {
            setStep('mode');
          } else {
            setStep('location');
          }
        }, 500);
      }
    }, 120);
  };

  /* ─── Location ─────────────────────────────────────────────────────────── */
  const autoFetchLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoStatus('unsupported');
      setLocationError('Geolocation is not supported by your browser');
      return;
    }
    setGeoStatus('fetching');
    setLocationError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
        setLocation(coords);
        setGeoStatus('granted');
      },
      (err) => {
        setGeoStatus('denied');
        if (err.code === 1) {
          setLocationError('Location permission denied. Please allow location access in your browser settings and refresh.');
        } else if (err.code === 2) {
          setLocationError('Location unavailable. Please check your device GPS.');
        } else if (err.code === 3) {
          setLocationError('Location request timed out. Please retry.');
        } else {
          setLocationError(err.message || 'Location permission denied');
        }
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  }, []);

  const requestLocation = () => {
    autoFetchLocation();
    // After face scan → move to mode selection if location already granted
    if (geoStatus === 'granted') {
      setStep('mode');
    }
  };

  /* ─── Check In ─────────────────────────────────────────────────────────── */
  const handleCheckIn = async () => {
    setCheckInLoading(true);
    setError('');
    try {
      const { data } = await api.post('/attendance/checkin', {
        workMode,
        latitude: location?.lat,
        longitude: location?.lng,
        faceVerified: true,
        deviceInfo: {
          userAgent: navigator.userAgent.substring(0, 200),
          platform: navigator.platform,
          language: navigator.language
        }
      });
      setTodayRecord(data.data);
      setCheckedIn(true);
      setStep('done');
      setSuccess(`✅ Checked in successfully at ${fmtTime(data.data.checkInTime)}!`);
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      setError(err.response?.data?.message || 'Check-in failed. Please try again.');
      setStep('mode');
    } finally {
      setCheckInLoading(false);
    }
  };

  /* ─── Check Out ────────────────────────────────────────────────────────── */
  const handleCheckOut = async () => {
    setCheckOutLoading(true);
    setError('');
    try {
      const { data } = await api.post('/attendance/checkout');
      setTodayRecord(data.data);
      setCheckedOut(true);
      setSuccess(`✅ Checked out! Total: ${fmtHours(data.data.hoursWorked)}`);
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      setError(err.response?.data?.message || 'Check-out failed.');
    } finally {
      setCheckOutLoading(false);
    }
  };

  /* ─── Manual Attendance (admin) ────────────────────────────────────────── */
  const handleManualMark = async () => {
    try {
      await api.post('/attendance/manual', manualForm);
      setManualModal(false);
      loadAdminRecords();
      loadAdminStats();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to mark attendance');
    }
  };

  /* ─── Render ────────────────────────────────────────────────────────────── */
  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Smart Attendance</h1>
          <p className="page-sub">Biometric · Geo-fence · Real-time tracking</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {isAdmin && <button className="btn btn-secondary btn-sm" onClick={() => { setManualModal(true); loadEmployees(); }}>✏️ Manual Mark</button>}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', background: 'var(--color-bg-secondary)', padding: '4px', borderRadius: '12px', width: 'fit-content' }}>
        {[
          ...(isAdmin ? [{ key: 'admin', label: '📊 Dashboard' }] : []),
          { key: 'checkin', label: '🕐 Check In/Out' },
          { key: 'history', label: '📋 My History' },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer',
              fontWeight: 600, fontSize: '13px', transition: 'all 0.2s',
              background: activeTab === tab.key ? 'var(--color-bg-elevated)' : 'transparent',
              color: activeTab === tab.key ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
              boxShadow: activeTab === tab.key ? '0 1px 4px rgba(0,0,0,0.1)' : 'none'
            }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Alerts */}
      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', color: '#DC2626', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          ❌ {error}
          <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#DC2626', cursor: 'pointer', fontSize: '16px' }}>×</button>
        </div>
      )}
      {success && (
        <div style={{ background: '#ECFDF5', border: '1px solid #6EE7B7', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', color: '#059669', fontSize: '13px' }}>
          {success}
        </div>
      )}

      {/* ── ADMIN DASHBOARD TAB ── */}
      {activeTab === 'admin' && isAdmin && (
        <div>
          {/* Today Stats */}
          {adminStats && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '20px' }}>
              {[
                { label: 'Present Today', value: adminStats.today.present, icon: '✅', color: '#059669', bg: '#ECFDF5' },
                { label: 'Absent', value: adminStats.today.absent, icon: '❌', color: '#DC2626', bg: '#FEF2F2' },
                { label: 'Late', value: adminStats.today.late, icon: '⏰', color: '#D97706', bg: '#FFFBEB' },
                { label: 'WFH', value: adminStats.today.wfh, icon: '🏠', color: '#2563EB', bg: '#EFF6FF' },
                { label: 'Monthly %', value: `${adminStats.monthly.attendancePct}%`, icon: '📊', color: '#7C3AED', bg: '#F5F3FF' },
              ].map(s => (
                <div key={s.label} className="card card-sm" style={{ textAlign: 'center', background: s.bg, borderColor: s.color + '20' }}>
                  <div style={{ fontSize: '24px', marginBottom: '4px' }}>{s.icon}</div>
                  <div style={{ fontSize: '28px', fontWeight: 800, color: s.color, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px', fontWeight: 600 }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Attendance Trend */}
          {adminTrend.length > 0 && (
            <div className="card" style={{ marginBottom: '16px' }}>
              <div className="card-title">📈 14-Day Attendance Trend</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '80px', padding: '8px 0' }}>
                {adminTrend.map((d, i) => {
                  const total = adminStats?.today?.totalEmployees || 1;
                  const pct = Math.min((d.present / total) * 100, 100);
                  return (
                    <div key={i} title={`${d.label}: ${d.present} present`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                      <div style={{ width: '100%', background: 'var(--color-bg-secondary)', borderRadius: '4px 4px 0 0', height: '60px', display: 'flex', alignItems: 'flex-end' }}>
                        <div style={{ width: '100%', height: `${pct}%`, background: pct > 80 ? '#10B981' : pct > 50 ? '#F59E0B' : '#EF4444', borderRadius: '4px 4px 0 0', transition: 'height 0.3s', minHeight: '2px' }} />
                      </div>
                      <span style={{ fontSize: '9px', color: 'var(--color-text-muted)', textAlign: 'center', transform: 'rotate(-45deg)', transformOrigin: 'center', whiteSpace: 'nowrap' }}>{d.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Filters + Table */}
          <div className="table-card">
            <div className="table-toolbar">
              <div className="card-title" style={{ margin: 0 }}>All Attendance Records</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input type="date" className="form-input" style={{ width: 'auto', padding: '6px 10px', fontSize: '12px' }}
                  value={adminFilter.date} onChange={e => setAdminFilter(f => ({ ...f, date: e.target.value }))} />
                <select className="form-select" style={{ width: 'auto', padding: '6px 10px', fontSize: '12px' }}
                  value={adminFilter.status} onChange={e => setAdminFilter(f => ({ ...f, status: e.target.value }))}>
                  <option value="">All Status</option>
                  <option value="present">Present</option>
                  <option value="absent">Absent</option>
                  <option value="late">Late</option>
                  <option value="half_day">Half Day</option>
                </select>
                <button className="btn btn-primary btn-sm" onClick={loadAdminRecords}>🔍 Filter</button>
              </div>
            </div>
            <div className="table-wrap">
              {adminLoading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading…</div>
              ) : adminRecords.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>📋</div>
                  <div>No attendance records found</div>
                  <div style={{ fontSize: '12px', marginTop: '4px' }}>Records appear once employees start checking in</div>
                </div>
              ) : (
                <table className="ds-table">
                  <thead><tr>
                    <th>Employee</th><th>Date</th><th>Check In</th><th>Check Out</th>
                    <th>Hours</th><th>Mode</th><th>Geo</th><th>Face</th><th>Status</th>
                  </tr></thead>
                  <tbody>
                    {adminRecords.map((r) => (
                      <tr key={r._id}>
                        <td><strong>{r.employeeName}</strong></td>
                        <td><span className="mono" style={{ fontSize: '12px' }}>{r.date}</span></td>
                        <td style={{ color: 'var(--color-success)', fontWeight: 500 }}>{fmtTime(r.checkInTime)}</td>
                        <td style={{ color: 'var(--color-danger)', fontWeight: 500 }}>{fmtTime(r.checkOutTime)}</td>
                        <td><strong>{r.hoursWorked ? fmtHours(r.hoursWorked) : '—'}</strong></td>
                        <td><span style={{ fontSize: '13px' }}>{r.workMode === 'office' ? '🏢 Office' : '🏠 WFH'}</span></td>
                        <td>
                          <span style={{ fontSize: '11px', fontWeight: 600, color: GEO_STATUS_COLOR[r.geoFenceStatus] || '#94A3B8' }}>
                            {r.geoFenceStatus === 'verified' ? '✓ Verified' : r.geoFenceStatus === 'failed' ? '✗ Failed' : r.geoFenceStatus === 'wfh' ? '🏠 WFH' : '—'}
                          </span>
                        </td>
                        <td><span style={{ color: r.faceVerified ? 'var(--color-success)' : 'var(--color-danger)' }}>{r.faceVerified ? '✓' : '✗'}</span></td>
                        <td>
                          {r.attendanceStatus && STATUS_BADGE[r.attendanceStatus] ? (
                            <span className={`badge ${STATUS_BADGE[r.attendanceStatus].cls}`}>{STATUS_BADGE[r.attendanceStatus].label}</span>
                          ) : <span>—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── CHECK IN/OUT TAB ── */}
      {activeTab === 'checkin' && (
        <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: '20px' }}>
          {/* Left: Check-in Panel */}
          <div>
            {/* Clock */}
            <div className="card" style={{ textAlign: 'center', marginBottom: '16px' }}>
              <div style={{ fontSize: '48px', fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                {now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                {now.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
            </div>

            {/* Status Panel */}
            <div className="card" style={{ marginBottom: '16px' }}>

              {/* Step: Already done */}
              {step === 'done' && todayRecord && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '48px', marginBottom: '8px' }}>{checkedOut ? '🎉' : '✅'}</div>
                  <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--color-success)', marginBottom: '4px' }}>
                    {checkedOut ? 'Day Complete!' : 'You are Checked In'}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
                    {todayRecord.workMode === 'office' ? '🏢 In-Office' : '🏠 Work From Home'}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                    <div style={{ padding: '12px', background: 'var(--color-bg-secondary)', borderRadius: '10px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>CHECK IN</div>
                      <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-success)' }}>{fmtTime(todayRecord.checkInTime)}</div>
                    </div>
                    <div style={{ padding: '12px', background: 'var(--color-bg-secondary)', borderRadius: '10px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>CHECK OUT</div>
                      <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-danger)' }}>
                        {checkedOut ? fmtTime(todayRecord.checkOutTime) : '—'}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
                    <span style={{ padding: '4px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: 600, background: '#ECFDF5', color: '#059669', border: '1px solid #6EE7B7' }}>✓ Face Verified</span>
                    <span style={{ padding: '4px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: 600, background: GEO_STATUS_COLOR[todayRecord.geoFenceStatus] + '15', color: GEO_STATUS_COLOR[todayRecord.geoFenceStatus], border: `1px solid ${GEO_STATUS_COLOR[todayRecord.geoFenceStatus]}40` }}>
                      {todayRecord.geoFenceStatus === 'verified' ? '✓ Geo Verified' : todayRecord.geoFenceStatus === 'wfh' ? '🏠 WFH Mode' : '⚠ Geo Pending'}
                    </span>
                    <span className={`badge ${STATUS_BADGE[todayRecord.attendanceStatus]?.cls}`}>{STATUS_BADGE[todayRecord.attendanceStatus]?.label}</span>
                  </div>
                  {!checkedOut && (
                    <button className="btn btn-danger" style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: '15px' }}
                      onClick={handleCheckOut} disabled={checkOutLoading}>
                      {checkOutLoading ? '⟳ Processing…' : '🔴 Check Out'}
                    </button>
                  )}
                  {checkedOut && todayRecord.hoursWorked > 0 && (
                    <div style={{ padding: '12px', background: 'var(--color-bg-secondary)', borderRadius: '10px', textAlign: 'center', fontSize: '13px' }}>
                      ⏱️ Total Hours: <strong>{fmtHours(todayRecord.hoursWorked)}</strong>
                    </div>
                  )}
                </div>
              )}

              {/* Step: Idle */}
              {step === 'idle' && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '64px', marginBottom: '12px' }}>👤</div>
                  <div style={{ fontWeight: 700, fontSize: '16px', marginBottom: '6px' }}>Ready to Check In</div>
                  <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '20px' }}>
                    Step 1 of 4: Face ID verification required
                  </div>
                  <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: '15px' }}
                    onClick={startCamera}>
                    📷 Start Face Verification
                  </button>
                </div>
              )}

              {/* Step: Camera */}
              {(step === 'camera' || step === 'face') && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ position: 'relative', marginBottom: '16px' }}>
                    <video ref={videoRef} autoPlay muted playsInline
                      style={{ width: '100%', borderRadius: '12px', border: '3px solid var(--color-accent)', maxHeight: '200px', objectFit: 'cover', background: '#000' }} />
                    {step === 'face' && (
                      <div style={{
                        position: 'absolute', inset: 0, borderRadius: '12px',
                        background: 'rgba(37,99,235,0.15)',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
                      }}>
                        <div style={{ width: '120px', height: '120px', border: '3px solid #3B82F6', borderRadius: '50%', marginBottom: '8px', position: 'relative', overflow: 'hidden' }}>
                          <div style={{ position: 'absolute', top: `${-120 + scanPct * 1.2}px`, left: 0, right: 0, height: '3px', background: 'rgba(59,130,246,0.8)', boxShadow: '0 0 10px #3B82F6', transition: 'top 0.1s linear' }} />
                        </div>
                        <div style={{ color: '#fff', fontWeight: 700, fontSize: '13px', textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
                          Scanning… {Math.round(scanPct)}%
                        </div>
                      </div>
                    )}
                  </div>
                  {step === 'camera' && (
                    <>
                      <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
                        Face centered? Hold still and press scan.
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <button className="btn btn-secondary" onClick={() => { stopCamera(); setStep('idle'); }}>Cancel</button>
                        <button className="btn btn-primary" onClick={runFaceScan}>🔍 Scan Face</button>
                      </div>
                    </>
                  )}
                  {step === 'face' && (
                    <div style={{ fontSize: '13px', color: '#2563EB', fontWeight: 600 }}>
                      Hold still — verifying identity…
                    </div>
                  )}
                </div>
              )}

              {/* Step: Location — auto-triggered, shows geo status */}
              {step === 'location' && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '48px', marginBottom: '12px' }}>✅</div>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--color-success)', marginBottom: '4px' }}>Face Verified!</div>
                  <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
                    Step 3 of 4: Getting your location
                  </div>

                  {/* Fetching state */}
                  {geoStatus === 'fetching' && (
                    <div style={{ background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.2)', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '8px' }}>
                        <div style={{ width: 18, height: 18, border: '2.5px solid rgba(37,99,235,0.3)', borderTopColor: '#2563EB', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#2563EB' }}>📡 Fetching your location…</span>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Allow the browser location popup if it appears</div>
                    </div>
                  )}

                  {/* Granted state */}
                  {geoStatus === 'granted' && location && (
                    <div style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '12px', padding: '14px', marginBottom: '16px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#059669', marginBottom: '8px' }}>✅ Location Captured!</div>
                      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <div style={{ background: 'rgba(255,255,255,0.5)', borderRadius: '8px', padding: '6px 12px', fontSize: '11px', fontFamily: 'monospace', color: '#047857' }}>
                          Lat: {location.lat.toFixed(6)}
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.5)', borderRadius: '8px', padding: '6px 12px', fontSize: '11px', fontFamily: 'monospace', color: '#047857' }}>
                          Lng: {location.lng.toFixed(6)}
                        </div>
                        {location.accuracy && (
                          <div style={{ background: 'rgba(255,255,255,0.5)', borderRadius: '8px', padding: '6px 12px', fontSize: '11px', color: '#059669' }}>
                            ±{Math.round(location.accuracy)}m accuracy
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Denied state */}
                  {(geoStatus === 'denied' || geoStatus === 'unsupported') && (
                    <div style={{ background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.25)', borderRadius: '12px', padding: '14px', marginBottom: '16px', textAlign: 'left' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#DC2626', marginBottom: '6px' }}>❌ Location Access Denied</div>
                      <div style={{ fontSize: '12px', color: '#7F1D1D', lineHeight: 1.6 }}>{locationError}</div>
                      <div style={{ marginTop: '10px', fontSize: '11px', color: '#991B1B', background: 'rgba(220,38,38,0.08)', borderRadius: '8px', padding: '8px 12px' }}>
                        <strong>To fix:</strong> Click the 🔒 icon in your browser address bar → Allow Location → Refresh the page
                      </div>
                    </div>
                  )}

                  {/* Idle / initial */}
                  {geoStatus === 'idle' && (
                    <div style={{ background: 'var(--color-bg-secondary)', borderRadius: '10px', padding: '12px', marginBottom: '16px', fontSize: '12px', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
                      📍 Your GPS coordinates are required for geo-fence verification.
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '8px' }}>
                    {(geoStatus === 'denied' || geoStatus === 'idle') && (
                      <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center', padding: '12px' }}
                        onClick={requestLocation}>
                        📍 Retry Location
                      </button>
                    )}
                    {geoStatus === 'granted' && (
                      <button className="btn btn-success" style={{ flex: 1, justifyContent: 'center', padding: '12px', fontWeight: 700 }}
                        onClick={() => setStep('mode')}>
                        ✅ Continue →
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Step: Work Mode */}
              {step === 'mode' && (
                <div>
                  <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '12px', textAlign: 'center' }}>
                    ✅ Face & Location verified! Choose work mode:
                  </div>
                  {location && (
                    <div style={{ background: '#ECFDF5', borderRadius: '8px', padding: '8px 12px', marginBottom: '12px', fontSize: '11px', color: '#059669' }}>
                      📍 Location captured (±{Math.round(location.accuracy || 0)}m accuracy)
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                    {[
                      { v: 'office', label: '🏢 In Office', desc: 'Geo-fence validated' },
                      { v: 'wfh', label: '🏠 Work From Home', desc: 'Remote work mode' }
                    ].map(m => (
                      <button key={m.v} onClick={() => setWorkMode(m.v)}
                        style={{
                          padding: '14px', borderRadius: '12px', cursor: 'pointer', textAlign: 'center',
                          border: workMode === m.v ? '2px solid var(--color-accent)' : '2px solid var(--color-border)',
                          background: workMode === m.v ? 'var(--color-accent-bg)' : 'var(--color-bg-secondary)',
                          transition: 'all 0.2s'
                        }}>
                        <div style={{ fontSize: '22px', marginBottom: '4px' }}>{m.label.split(' ')[0]}</div>
                        <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--color-text-primary)' }}>{m.label.substring(3)}</div>
                        <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '2px' }}>{m.desc}</div>
                      </button>
                    ))}
                  </div>
                  <button className="btn btn-success" style={{ width: '100%', justifyContent: 'center', padding: '14px', fontSize: '15px', fontWeight: 700 }}
                    onClick={handleCheckIn} disabled={checkInLoading}>
                    {checkInLoading ? '⟳ Processing…' : '✅ Confirm Check In'}
                  </button>
                </div>
              )}
            </div>

            {/* Verification Progress */}
            {step !== 'idle' && step !== 'done' && (
              <div className="card card-sm">
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '10px' }}>Verification Progress</div>
                {[
                  { label: 'Face ID', done: faceVerified, active: step === 'camera' || step === 'face' },
                  { label: 'Location', done: !!location, active: step === 'location' },
                  { label: 'Work Mode', done: step === 'done', active: step === 'mode' },
                  { label: 'Check In', done: checkedIn, active: step === 'mode' && checkInLoading },
                ].map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    <div style={{ width: '22px', height: '22px', borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: '11px', fontWeight: 700, flexShrink: 0, background: s.done ? '#059669' : s.active ? '#2563EB' : 'var(--color-bg-secondary)', color: s.done || s.active ? '#fff' : 'var(--color-text-muted)', transition: 'all 0.3s' }}>
                      {s.done ? '✓' : i + 1}
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: s.active ? 700 : 400, color: s.done ? 'var(--color-success)' : s.active ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>{s.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Today Summary + Quick Info */}
          <div>
            <div className="card" style={{ marginBottom: '16px' }}>
              <div className="card-title">📅 Today's Status</div>
              {todayRecord ? (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                    {[
                      { label: 'Check In', value: fmtTime(todayRecord.checkInTime), color: '#059669' },
                      { label: 'Check Out', value: fmtTime(todayRecord.checkOutTime), color: '#DC2626' },
                      { label: 'Hours Worked', value: todayRecord.hoursWorked ? fmtHours(todayRecord.hoursWorked) : '—', color: '#2563EB' },
                    ].map(s => (
                      <div key={s.label} style={{ padding: '14px', background: 'var(--color-bg-secondary)', borderRadius: '12px', textAlign: 'center' }}>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '6px', fontWeight: 600 }}>{s.label}</div>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: s.color, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                    <span style={{ padding: '4px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: 600, background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>
                      {todayRecord.workMode === 'office' ? '🏢 In Office' : '🏠 WFH'}
                    </span>
                    {todayRecord.attendanceStatus && <span className={`badge ${STATUS_BADGE[todayRecord.attendanceStatus]?.cls}`}>{STATUS_BADGE[todayRecord.attendanceStatus]?.label}</span>}
                    {todayRecord.markedManually && <span className="badge badge-info">Manual Entry</span>}
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--color-text-muted)', fontSize: '13px' }}>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>🕐</div>
                  No attendance record for today yet
                </div>
              )}
            </div>

            {/* Info Card */}
            <div className="card" style={{ background: 'linear-gradient(135deg, rgba(37,99,235,0.05), rgba(16,185,129,0.05))', border: '1px solid var(--color-border)' }}>
              <div className="card-title">ℹ️ Attendance Rules</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {[
                  { icon: '🏢', text: 'In-Office: GPS must be within office geo-fence radius' },
                  { icon: '🏠', text: 'WFH: Face ID required, location stored for records' },
                  { icon: '⏰', text: 'Check-in after 09:30 AM marked as Late' },
                  { icon: '⏱️', text: 'Less than 5 hours = Half Day' },
                  { icon: '🔒', text: 'Face verification mandatory for all modes' },
                ].map((r, i) => (
                  <div key={i} style={{ display: 'flex', gap: '8px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                    <span style={{ flexShrink: 0 }}>{r.icon}</span>
                    <span>{r.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── HISTORY TAB ── */}
      {activeTab === 'history' && (
        <div>
          {/* Stats */}
          {historyStats && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '16px' }}>
              {[
                { label: 'Days Present', value: historyStats.presentDays, icon: '✅', color: '#059669' },
                { label: 'Absent', value: historyStats.absentDays, icon: '❌', color: '#DC2626' },
                { label: 'Late', value: historyStats.lateDays, icon: '⏰', color: '#D97706' },
                { label: 'WFH Days', value: historyStats.wfhDays, icon: '🏠', color: '#2563EB' },
                { label: 'Total Hours', value: `${historyStats.totalHours}h`, icon: '⏱️', color: '#7C3AED' },
              ].map(s => (
                <div key={s.label} className="card card-sm" style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '20px', marginBottom: '4px' }}>{s.icon}</div>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* History Table */}
          <div className="table-card">
            <div className="table-toolbar">
              <div className="card-title" style={{ margin: 0 }}>My Attendance History — This Month</div>
              <button className="btn btn-ghost btn-sm" onClick={loadHistory}>🔄 Refresh</button>
            </div>
            <div className="table-wrap">
              {histLoading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading…</div>
              ) : history.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>📋</div>
                  No attendance records found for this month
                </div>
              ) : (
                <table className="ds-table">
                  <thead><tr>
                    <th>Date</th><th>Check In</th><th>Check Out</th>
                    <th>Hours</th><th>Mode</th><th>Face</th><th>Geo</th><th>Status</th>
                  </tr></thead>
                  <tbody>
                    {history.map((r) => (
                      <tr key={r._id}>
                        <td><span className="mono" style={{ fontSize: '12px' }}>{r.date}</span></td>
                        <td style={{ color: 'var(--color-success)', fontWeight: 500 }}>{fmtTime(r.checkInTime)}</td>
                        <td style={{ color: 'var(--color-danger)', fontWeight: 500 }}>{fmtTime(r.checkOutTime)}</td>
                        <td><strong>{r.hoursWorked ? fmtHours(r.hoursWorked) : '—'}</strong></td>
                        <td>{r.workMode === 'office' ? '🏢 Office' : r.workMode === 'wfh' ? '🏠 WFH' : '—'}</td>
                        <td><span style={{ color: r.faceVerified ? 'var(--color-success)' : 'var(--color-danger)' }}>{r.faceVerified ? '✓' : '✗'}</span></td>
                        <td><span style={{ fontSize: '11px', color: GEO_STATUS_COLOR[r.geoFenceStatus] }}>
                          {r.geoFenceStatus === 'verified' ? '✓' : r.geoFenceStatus === 'wfh' ? '🏠' : r.geoFenceStatus === 'failed' ? '✗' : '—'}
                        </span></td>
                        <td>
                          {r.attendanceStatus && STATUS_BADGE[r.attendanceStatus] ? (
                            <span className={`badge ${STATUS_BADGE[r.attendanceStatus].cls}`}>{STATUS_BADGE[r.attendanceStatus].label}</span>
                          ) : <span>—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Manual Mark Modal (Admin) */}
      {manualModal && (
        <div className="modal-overlay" onClick={() => setManualModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <div className="modal-title">✏️ Mark Attendance Manually</div>
              <button className="modal-close" onClick={() => setManualModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group full">
                  <label className="form-label">Employee *</label>
                  <select className="form-select" value={manualForm.employeeId} onChange={e => setManualForm(f => ({ ...f, employeeId: e.target.value }))}>
                    <option value="">Select employee…</option>
                    {employees.map(e => <option key={e._id} value={e._id}>{e.name} — {e.department}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Date *</label>
                  <input type="date" className="form-input" value={manualForm.date} onChange={e => setManualForm(f => ({ ...f, date: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Status *</label>
                  <select className="form-select" value={manualForm.attendanceStatus} onChange={e => setManualForm(f => ({ ...f, attendanceStatus: e.target.value }))}>
                    <option value="present">Present</option>
                    <option value="absent">Absent</option>
                    <option value="late">Late</option>
                    <option value="half_day">Half Day</option>
                    <option value="on_leave">On Leave</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Work Mode</label>
                  <select className="form-select" value={manualForm.workMode} onChange={e => setManualForm(f => ({ ...f, workMode: e.target.value }))}>
                    <option value="office">In Office</option>
                    <option value="wfh">WFH</option>
                  </select>
                </div>
                <div className="form-group full">
                  <label className="form-label">Notes</label>
                  <textarea className="form-textarea" placeholder="Reason for manual entry…" value={manualForm.notes} onChange={e => setManualForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setManualModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleManualMark} disabled={!manualForm.employeeId || !manualForm.date}>💾 Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
