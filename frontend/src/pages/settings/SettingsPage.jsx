import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import useAuthStore from '../../store/useAuthStore';
import useCompanyStore from '../../store/useCompanyStore';
import api from '../../services/api';
import FaceCapture from '../../components/FaceCapture';

// Fix Leaflet default icon issue with Vite/Webpack
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const ROLES = [
  { value: 'admin',    label: 'Admin',    desc: 'Full system access — Employee mgmt, pricing, finance, analytics', color: '#2563EB' },
  { value: 'employee', label: 'Employee', desc: 'CRM access — Leads, quotes, bookings, attendance with biometrics', color: '#10B981' },
];

const DESTINATIONS = [
  'Manali, HP', 'Shimla, HP', 'Kullu, HP', 'Dharamshala, HP',
  'Goa', 'Kerala', 'Rajasthan', 'Kashmir', 'Uttarakhand', 'All Locations'
];

const MOCK_EMPLOYEES = [
  { _id:'EMP-001', name:'Priya Sharma',   email:'priya@pakkatourism.com',  phone:'9876543001', role:'employee', department:'Sales',      destination:'Manali, HP',     faceRegistered:true,  isActive:true,  joinDate:'2024-03-15', lastLogin:'2025-05-26 09:02' },
  { _id:'EMP-002', name:'Rahul Mehta',    email:'rahul@pakkatourism.com',  phone:'9876543002', role:'employee', department:'Sales',      destination:'Shimla, HP',     faceRegistered:true,  isActive:true,  joinDate:'2024-05-20', lastLogin:'2025-05-26 09:15' },
  { _id:'EMP-003', name:'Anjali Kapoor',  email:'anjali@pakkatourism.com', phone:'9876543003', role:'employee', department:'Sales',      destination:'All Locations',  faceRegistered:true,  isActive:true,  joinDate:'2024-07-01', lastLogin:'2025-05-25 18:40' },
  { _id:'EMP-004', name:'Sanjay Rao',     email:'sanjay@pakkatourism.com', phone:'9876543004', role:'employee', department:'Operations', destination:'Goa',            faceRegistered:false, isActive:true,  joinDate:'2024-09-10', lastLogin:'2025-05-24 10:30' },
  { _id:'EMP-005', name:'Nisha Patel',    email:'nisha@pakkatourism.com',  phone:'9876543005', role:'employee', department:'Finance',    destination:'Kerala',         faceRegistered:true,  isActive:false, joinDate:'2024-01-08', lastLogin:'2025-04-30 17:00' },
];

// ─── Map Click Handler Component ─────────────────────────────────────────────
function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng);
    },
  });
  return null;
}

// ─── Geo-fence Tab with Live Map ──────────────────────────────────────────────
function GeoFenceTab() {
  const [locations, setLocations]     = useState([]);
  const [pin, setPin]                 = useState(null);         // { lat, lng }
  const [form, setForm]               = useState({ name: '', radius: 50 });
  const [saving, setSaving]           = useState(false);
  const [saveMsg, setSaveMsg]         = useState('');
  const [editId, setEditId]           = useState(null);         // ID being edited
  const [mapCenter]                   = useState([20.5937, 78.9629]); // India center

  // Load saved locations on mount
  useEffect(() => {
    loadLocations();
  }, []);

  const loadLocations = async () => {
    try {
      const { data } = await api.get('/settings/office-locations');
      setLocations(data.data || []);
    } catch (err) {
      console.error('Failed to load office locations:', err);
    }
  };

  const handleMapClick = useCallback((latlng) => {
    setPin({ lat: parseFloat(latlng.lat.toFixed(6)), lng: parseFloat(latlng.lng.toFixed(6)) });
    setSaveMsg('');
  }, []);

  const handleSave = async () => {
    if (!pin) { setSaveMsg('❌ Please click on the map to drop a pin first'); return; }
    if (!form.name.trim()) { setSaveMsg('❌ Location name is required'); return; }
    setSaving(true);
    setSaveMsg('');
    try {
      const payload = {
        name: form.name.trim(),
        lat: pin.lat,
        lng: pin.lng,
        radius: parseInt(form.radius) || 50,
        ...(editId ? { _id: editId } : {}),
      };
      const { data } = await api.post('/settings/office-location', payload);
      setLocations(data.data || []);
      setSaveMsg('✅ Office location saved successfully!');
      setPin(null);
      setForm({ name: '', radius: 50 });
      setEditId(null);
    } catch (err) {
      setSaveMsg(`❌ ${err.response?.data?.message || 'Failed to save location'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this office location?')) return;
    try {
      const { data } = await api.delete(`/settings/office-location/${id}`);
      setLocations(data.data || []);
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const handleEdit = (loc) => {
    setPin({ lat: loc.lat, lng: loc.lng });
    setForm({ name: loc.name, radius: loc.radius });
    setEditId(loc._id);
    setSaveMsg('');
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
          📍 Office Geo-Fence Configuration
        </div>
        <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
          Click on the map to drop a pin and save your office location. Employee GPS will be validated within the configured radius during In-Office check-in.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', alignItems: 'start' }}>

        {/* ── Map Container ── */}
        <div>
          {/* Map Instructions Banner */}
          <div style={{
            background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.2)',
            borderRadius: '10px', padding: '10px 14px', marginBottom: '12px',
            fontSize: '12px', color: 'var(--color-accent)', display: 'flex', alignItems: 'center', gap: '8px'
          }}>
            <span style={{ fontSize: '16px' }}>🗺️</span>
            <span><strong>Click anywhere on the map</strong> to drop a pin and capture the office GPS coordinates.</span>
          </div>

          {/* Leaflet Map */}
          <div style={{ borderRadius: '14px', overflow: 'hidden', border: '1.5px solid var(--color-border)', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}>
            <MapContainer
              center={pin ? [pin.lat, pin.lng] : mapCenter}
              zoom={pin ? 16 : 5}
              style={{ height: '420px', width: '100%' }}
              scrollWheelZoom={true}
            >
              <TileLayer
                attribution='&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapClickHandler onMapClick={handleMapClick} />

              {/* Dropped pin */}
              {pin && (
                <>
                  <Marker position={[pin.lat, pin.lng]}>
                    <Popup>
                      <div style={{ minWidth: '180px' }}>
                        <strong>{form.name || 'New Office Pin'}</strong><br />
                        <span style={{ fontSize: '11px', color: '#64748B' }}>
                          {pin.lat}, {pin.lng}
                        </span><br />
                        <span style={{ fontSize: '11px', color: '#2563EB' }}>
                          Radius: {form.radius}m
                        </span>
                      </div>
                    </Popup>
                  </Marker>
                  {/* Geo-fence radius circle */}
                  <Circle
                    center={[pin.lat, pin.lng]}
                    radius={parseInt(form.radius) || 50}
                    pathOptions={{ color: '#3B82F6', fillColor: '#3B82F6', fillOpacity: 0.1, weight: 2 }}
                  />
                </>
              )}

              {/* Previously saved locations */}
              {locations.filter(l => !editId || l._id !== editId).map((loc) => (
                <React.Fragment key={loc._id}>
                  <Marker position={[loc.lat, loc.lng]}>
                    <Popup>
                      <div style={{ minWidth: '180px' }}>
                        <strong>📍 {loc.name}</strong><br />
                        <span style={{ fontSize: '11px', color: '#64748B' }}>
                          {loc.lat}, {loc.lng}
                        </span><br />
                        <span style={{ fontSize: '11px', color: '#059669' }}>
                          Radius: {loc.radius}m ✓ Active
                        </span>
                      </div>
                    </Popup>
                  </Marker>
                  <Circle
                    center={[loc.lat, loc.lng]}
                    radius={loc.radius || 50}
                    pathOptions={{ color: '#10B981', fillColor: '#10B981', fillOpacity: 0.08, weight: 1.5, dashArray: '5,5' }}
                  />
                </React.Fragment>
              ))}
            </MapContainer>
          </div>

          {/* Lat/Lng readout */}
          {pin ? (
            <div style={{
              marginTop: '10px', padding: '10px 14px',
              background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)',
              borderRadius: '10px', display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap'
            }}>
              <span style={{ fontSize: '12px', color: '#059669' }}>📍 <strong>Pin Dropped</strong></span>
              <span style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--color-text-primary)' }}>
                Lat: <strong>{pin.lat}</strong>
              </span>
              <span style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--color-text-primary)' }}>
                Lng: <strong>{pin.lng}</strong>
              </span>
              <button
                onClick={() => { setPin(null); setForm({ name: '', radius: 50 }); setEditId(null); }}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#DC2626', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
              >
                ✕ Clear Pin
              </button>
            </div>
          ) : (
            <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--color-text-muted)', textAlign: 'center' }}>
              No pin dropped yet — click the map to select a location
            </div>
          )}
        </div>

        {/* ── Form Panel ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

          {/* Save Form */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: '16px' }}>
              {editId ? '✏️ Edit Location' : '➕ Add Office Location'}
            </div>

            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label className="form-label">Location Name *</label>
              <input
                className="form-input"
                placeholder="e.g. Manali Main Office"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label className="form-label">Latitude</label>
              <input
                className="form-input"
                type="number"
                step="0.000001"
                placeholder="Click map to auto-fill"
                value={pin?.lat ?? ''}
                onChange={e => setPin(p => ({ ...p, lat: parseFloat(e.target.value) }))}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label className="form-label">Longitude</label>
              <input
                className="form-input"
                type="number"
                step="0.000001"
                placeholder="Click map to auto-fill"
                value={pin?.lng ?? ''}
                onChange={e => setPin(p => ({ ...p, lng: parseFloat(e.target.value) }))}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label className="form-label">Geo-fence Radius (meters)</label>
              <input
                className="form-input"
                type="number"
                min="10"
                max="5000"
                value={form.radius}
                onChange={e => setForm(f => ({ ...f, radius: e.target.value }))}
              />
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                Employee must be within {form.radius}m of this point. Recommended: 50m for offices.
              </div>
            </div>

            {saveMsg && (
              <div style={{
                padding: '8px 12px', borderRadius: '8px', marginBottom: '12px', fontSize: '12px',
                background: saveMsg.startsWith('✅') ? 'rgba(16,185,129,0.1)' : 'rgba(220,38,38,0.1)',
                color: saveMsg.startsWith('✅') ? '#059669' : '#DC2626',
                border: `1px solid ${saveMsg.startsWith('✅') ? 'rgba(16,185,129,0.3)' : 'rgba(220,38,38,0.3)'}`
              }}>
                {saveMsg}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={handleSave}
                disabled={saving || !pin}
              >
                {saving ? '⟳ Saving…' : editId ? '💾 Update Location' : '📍 Save Location'}
              </button>
              {editId && (
                <button
                  className="btn btn-ghost"
                  onClick={() => { setEditId(null); setPin(null); setForm({ name: '', radius: 50 }); }}
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Saved Locations List */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: '12px' }}>
              Saved Locations ({locations.length})
            </div>
            {locations.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--color-text-muted)', fontSize: '12px' }}>
                <div style={{ fontSize: '24px', marginBottom: '6px' }}>📍</div>
                No office locations configured yet
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {locations.map((loc, i) => (
                  <div key={loc._id} style={{
                    padding: '10px 12px', borderRadius: '10px',
                    background: 'var(--color-bg-secondary)',
                    border: i === 0 ? '1.5px solid rgba(16,185,129,0.4)' : '1px solid var(--color-border)',
                    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px'
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        📍 {loc.name}
                        {i === 0 && (
                          <span style={{ fontSize: '10px', fontWeight: 600, padding: '1px 6px', borderRadius: '99px', background: 'rgba(16,185,129,0.12)', color: '#10B981', border: '1px solid rgba(52,211,153,0.3)' }}>
                            PRIMARY
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontFamily: 'monospace', marginTop: '2px' }}>
                        {loc.lat}, {loc.lng}
                      </div>
                      <div style={{ fontSize: '11px', color: '#2563EB', marginTop: '2px' }}>
                        Radius: {loc.radius}m
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                      <button className="btn btn-ghost btn-xs" title="Edit" onClick={() => handleEdit(loc)}>✏️</button>
                      <button className="btn btn-ghost btn-xs" title="Delete" style={{ color: 'var(--color-danger)' }} onClick={() => handleDelete(loc._id)}>🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Info card */}
          <div className="card card-sm" style={{ background: 'var(--color-accent-subtle)', borderLeft: '3px solid var(--color-accent)' }}>
            <div style={{ fontSize: '11px', color: 'var(--color-accent)', fontWeight: 700, marginBottom: '6px' }}>ℹ How Geo-Fencing Works</div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
              The <strong>first (PRIMARY)</strong> saved location is used to validate all employee In-Office check-ins using the Haversine Formula.<br /><br />
              If an employee is within the configured radius → ✓ Geo Verified<br />
              Outside the radius → ✗ Check-in blocked
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Settings Page ───────────────────────────────────────────────────────
export default function SettingsPage() {
  const { user } = useAuthStore();
  const { refreshCompany } = useCompanyStore();
  const [activeTab, setActiveTab] = useState('employees');
  const [employees, setEmployees] = useState([]);
  const [empLoading, setEmpLoading] = useState(false);
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [showEditEmployee, setShowEditEmployee] = useState(null);
  const [showFaceReg, setShowFaceReg] = useState(null);
  const [showResetPwd, setShowResetPwd] = useState(null);
  const [addEmpStep, setAddEmpStep] = useState('details'); // 'details' | 'face'
  const [faceResult, setFaceResult] = useState(null);      // { descriptor, photoDataUrl }
  const [empMsg, setEmpMsg] = useState('');

  // Load real employees on mount
  useEffect(() => { fetchEmployees(); }, []);

  const fetchEmployees = async () => {
    setEmpLoading(true);
    try {
      const { data } = await api.get('/auth/users');
      setEmployees(data.data || []);
    } catch (err) { console.error('Failed to load employees:', err); }
    finally { setEmpLoading(false); }
  };

  const [newEmp, setNewEmp] = useState({
    name:'', email:'', phone:'', password:'', department:'Sales', destination:'Manali, HP'
  });
  const [resetPwdForm, setResetPwdForm] = useState({ password: '', confirm: '' });

  // Settings State
  const [settings, setSettings] = useState({
    companyName: '', companyPhone: '', companyEmail: '', companyAddress: '', companyWebsite: '', gstNumber: '', panNumber: '', companyLogo: '',
    whatsapp: { apiToken: '', phoneNumberId: '', businessAccountId: '', webhookToken: '', isConfigured: false },
    reminders: { followUpEnabled: true, followUpBeforeHrs: 2, paymentEnabled: true, paymentBeforeDays: 3, travelEnabled: true, travelBeforeDays: 2, dailyDigest: false }
  });
  const [logoUploading, setLogoUploading] = useState(false);
  const logoRef = useRef(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data } = await api.get('/settings/company');
      if (data.data) setSettings(prev => ({ ...prev, ...data.data }));
    } catch (err) { console.error('Failed to load settings:', err); }
  };

  const saveCompanyInfo = async () => {
    try {
      await api.put('/settings/company', settings);
      alert('✅ Company info saved!');
    } catch (err) { alert('❌ Failed to save company info'); }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLogoUploading(true);
    try {
      const formData = new FormData();
      formData.append('logo', file);
      // Use the correct settings upload endpoint
      const { data } = await api.post('/settings/upload-logo', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setSettings(s => ({ ...s, companyLogo: data.url }));
      // Refresh global company store so logo updates everywhere (Sidebar, LoginPage, etc.)
      await refreshCompany();
      alert('✅ Logo uploaded successfully! It will now appear across all pages.');
    } catch (err) { alert('❌ Logo upload failed: ' + (err.response?.data?.message || err.message)); }
    finally { setLogoUploading(false); }
  };

  const saveWhatsapp = async () => {
    try {
      await api.put('/settings/whatsapp', settings.whatsapp);
      alert('✅ WhatsApp config saved!');
    } catch (err) { alert('❌ Failed to save WhatsApp config'); }
  };

  const saveReminders = async () => {
    try {
      await api.put('/settings/reminders', settings.reminders);
      alert('✅ Reminder settings saved!');
    } catch (err) { alert('❌ Failed to save reminder settings'); }
  };

  const TABS = [
    { id: 'employees',    label: '👥 Employee Management' },
    { id: 'general',      label: '⚙️ General' },
    { id: 'geofence',     label: '📍 Office Geo-fence' },
    { id: 'roles',        label: '🔐 Roles & Permissions' },
    { id: 'company',      label: '🏢 Company Profile' },
    { id: 'integrations', label: '🔗 Integrations' },
  ];

  const startFaceReg = (empId) => { setShowFaceReg(empId); };
  const saveFaceReg = () => {
    fetchEmployees(); // refresh to show updated faceRegistered status
    setShowFaceReg(null);
  };

  const toggleActive = async (id, currentStatus) => {
    try {
      await api.put(`/auth/users/${id}/toggle-status`, { isActive: !currentStatus });
      fetchEmployees();
    } catch (err) {
      setEmployees(prev => prev.map(e => e._id === id ? { ...e, isActive: !e.isActive } : e));
    }
  };

  const handleAddEmployee = async () => {
    try {
      const { data } = await api.post('/auth/register', { ...newEmp, role: 'employee' });
      const newEmpId = data.data?._id;

      // If face was captured, register it for the new employee
      if (faceResult && faceResult.descriptor && newEmpId) {
        try {
          await api.post(`/profile/${newEmpId}/face-register`, {
            descriptor: faceResult.descriptor,
            facePhotoDataUrl: faceResult.photoDataUrl || null,
          });
        } catch (faceErr) {
          console.warn('Face registration failed (employee created):', faceErr);
        }
      }

      setNewEmp({ name:'', email:'', phone:'', password:'', department:'Sales', destination:'Manali, HP' });
      setFaceResult(null);
      setAddEmpStep('details');
      setShowAddEmployee(false);
      setEmpMsg(faceResult ? '✅ Employee created with Face ID registered!' : '✅ Employee created! Face ID can be registered later.');
      setTimeout(() => setEmpMsg(''), 4000);
      fetchEmployees();
    } catch (err) {
      setEmpMsg(`❌ ${err.response?.data?.message || 'Failed to create employee'}`);
    }
  };

  const handleResetPassword = async () => {
    if (resetPwdForm.password !== resetPwdForm.confirm) {
      setEmpMsg('❌ Passwords do not match'); return;
    }
    if (resetPwdForm.password.length < 6) {
      setEmpMsg('❌ Password must be at least 6 characters'); return;
    }
    try {
      await api.put(`/auth/users/${showResetPwd._id}/reset-password`, { newPassword: resetPwdForm.password });
      setShowResetPwd(null);
      setResetPwdForm({ password: '', confirm: '' });
      setEmpMsg('✅ Password reset successfully!');
      setTimeout(() => setEmpMsg(''), 3000);
    } catch (err) {
      setEmpMsg(`❌ ${err.response?.data?.message || 'Reset failed'}`);
    }
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-sub">Employee management, system configuration & integrations</p>
      </div>

      {/* Tab Navigation */}
      <div style={{
        display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: '1px solid var(--color-border)',
        paddingBottom: '0', overflowX: 'auto'
      }}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            padding: '10px 16px', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
            border: 'none', background: 'none', borderBottom: `2px solid ${activeTab === tab.id ? 'var(--color-accent)' : 'transparent'}`,
            color: activeTab === tab.id ? 'var(--color-accent)' : 'var(--color-text-muted)',
            transition: 'all 0.15s', whiteSpace: 'nowrap', fontFamily: 'Inter, sans-serif'
          }}>{tab.label}</button>
        ))}
      </div>

      {/* ══════ EMPLOYEE MANAGEMENT ══════ */}
      {activeTab === 'employees' && (
        <div>
          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', marginBottom: '16px' }}>
            {[
              { label: 'Total Employees', value: employees.length, icon: '👥' },
              { label: 'Active',   value: employees.filter(e => e.isActive).length,   icon: '✅' },
              { label: 'Inactive', value: employees.filter(e => !e.isActive).length,  icon: '⏸️' },
              { label: 'Face Registered', value: employees.filter(e => e.faceRegistered).length, icon: '🔐' },
            ].map(k => (
              <div key={k.label} className="kpi-card">
                <div className="kpi-label">{k.label}</div>
                <div style={{ fontSize: '20px', marginBottom: '4px' }}>{k.icon}</div>
                <div className="kpi-value" style={{ fontSize: '22px' }}>{k.value}</div>
              </div>
            ))}
          </div>

          {empMsg && (
            <div style={{ padding: '10px 14px', borderRadius: '8px', marginBottom: '12px', fontSize: '12px',
              background: empMsg.startsWith('✅') ? 'rgba(16,185,129,0.1)' : 'rgba(220,38,38,0.1)',
              color: empMsg.startsWith('✅') ? '#059669' : '#DC2626',
              border: `1px solid ${empMsg.startsWith('✅') ? 'rgba(16,185,129,0.3)' : 'rgba(220,38,38,0.3)'}`
            }}>{empMsg}</div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
              {empLoading ? 'Loading…' : `${employees.length} employees registered · Only Admin can create employee accounts`}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-ghost btn-sm" onClick={fetchEmployees}>↻ Refresh</button>
              <button className="btn btn-primary btn-sm" onClick={() => setShowAddEmployee(true)}>+ Add Employee</button>
            </div>
          </div>

          <div className="table-card" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table className="ds-table" style={{ minWidth: '800px' }}>
              <thead><tr>
                <th>Employee</th><th>ID</th><th>Department</th><th>Destination</th>
                <th>Face ID</th><th>Status</th><th>Last Login</th><th>Actions</th>
              </tr></thead>
              <tbody>
                {employees.map(emp => (
                  <tr key={emp._id} style={{ opacity: emp.isActive ? 1 : 0.55 }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div className="avatar" style={{ background: emp.isActive ? '#10B981' : '#64748B', width: 32, height: 32 }}>
                          {emp.name[0]}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600 }}>{emp.name}</div>
                          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{emp.email}</div>
                        </div>
                      </div>
                    </td>
                    <td><span className="id-chip">{emp._id}</span></td>
                    <td>{emp.department}</td>
                    <td>📍 {emp.destination}</td>
                    <td>
                      {emp.faceRegistered ? (
                        <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '99px', background: 'rgba(16,185,129,0.12)', color: '#10B981', border: '1px solid rgba(52,211,153,0.3)' }}>
                          ✓ Registered
                        </span>
                      ) : (
                        <button className="btn btn-ghost btn-xs" style={{ color: 'var(--color-warning)' }} onClick={() => startFaceReg(emp._id)}>
                          ○ Register Face
                        </button>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${emp.isActive ? 'badge-confirmed' : 'badge-danger'}`}>
                        {emp.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{emp.lastLogin}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button className="btn btn-ghost btn-xs" title="View Profile" onClick={() => window.location.href = `/profile/${emp._id}`}>👤</button>
                        <button className="btn btn-ghost btn-xs" title="Edit" onClick={() => setShowEditEmployee(emp)}>✏️</button>
                        <button className="btn btn-ghost btn-xs" title="Reset Password" onClick={() => { setShowResetPwd(emp); setResetPwdForm({ password: '', confirm: '' }); }}>🔑</button>
                        <button className="btn btn-ghost btn-xs" title="Register Face" onClick={() => startFaceReg(emp._id)}>📸</button>
                        <button className="btn btn-ghost btn-xs" title={emp.isActive ? 'Disable' : 'Enable'} onClick={() => toggleActive(emp._id, emp.isActive)}
                          style={{ color: emp.isActive ? 'var(--color-danger)' : 'var(--color-success)' }}>
                          {emp.isActive ? '⏸' : '▶'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ADD EMPLOYEE MODAL — 2-step: details then face */}
          {showAddEmployee && (
            <div className="modal-overlay" onClick={() => { setShowAddEmployee(false); setAddEmpStep('details'); setFaceResult(null); }}>
              <div className="modal-box" style={{ maxWidth: '580px', background: '#111827' }} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <div>
                    <div className="modal-title">{addEmpStep === 'details' ? '👤 Add New Employee' : '📸 Register Face ID'}</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>Step {addEmpStep === 'details' ? '1' : '2'} of 2</div>
                  </div>
                  <button className="modal-close" onClick={() => { setShowAddEmployee(false); setAddEmpStep('details'); setFaceResult(null); }}>×</button>
                </div>

                {addEmpStep === 'details' && (
                  <>
                    <div className="modal-body">
                      <div style={{ background: 'var(--color-accent-subtle)', border: '1px solid var(--color-accent-border)', borderRadius: '10px', padding: '10px 14px', marginBottom: '16px', fontSize: '12px', color: 'var(--color-accent)' }}>
                        🛡️ Employee accounts can only be created by Admin.
                      </div>
                      <div className="form-grid">
                        <div className="form-group">
                          <label className="form-label">Full Name *</label>
                          <input className="form-input" placeholder="Rajesh Kumar" value={newEmp.name} onChange={e => setNewEmp(f => ({ ...f, name: e.target.value }))} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Email *</label>
                          <input className="form-input" type="email" placeholder="rajesh@pakkatourism.com" value={newEmp.email} onChange={e => setNewEmp(f => ({ ...f, email: e.target.value }))} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Phone *</label>
                          <input className="form-input" placeholder="9876543210" value={newEmp.phone} onChange={e => setNewEmp(f => ({ ...f, phone: e.target.value }))} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Initial Password *</label>
                          <input className="form-input" type="password" placeholder="••••••••" value={newEmp.password} onChange={e => setNewEmp(f => ({ ...f, password: e.target.value }))} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Department</label>
                          <select className="form-select" value={newEmp.department} onChange={e => setNewEmp(f => ({ ...f, department: e.target.value }))}>
                            <option>Sales</option><option>Operations</option><option>Finance</option><option>Marketing</option>
                          </select>
                        </div>
                        <div className="form-group">
                          <label className="form-label">Assigned Destination *</label>
                          <select className="form-select" value={newEmp.destination} onChange={e => setNewEmp(f => ({ ...f, destination: e.target.value }))}>
                            {DESTINATIONS.map(d => <option key={d}>{d}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                    <div className="modal-footer">
                      <button className="btn btn-secondary" onClick={() => setShowAddEmployee(false)}>Cancel</button>
                      <button className="btn btn-ghost" onClick={() => { if (newEmp.name && newEmp.email && newEmp.password) { handleAddEmployee(); } }}
                        disabled={!newEmp.name || !newEmp.email || !newEmp.password}
                        title="Create without face ID — register face later">
                        Skip Face →  Create
                      </button>
                      <button className="btn btn-primary" onClick={() => setAddEmpStep('face')}
                        disabled={!newEmp.name || !newEmp.email || !newEmp.password}>
                        📸 Next: Register Face
                      </button>
                    </div>
                  </>
                )}

                {addEmpStep === 'face' && (
                  <>
                    <div className="modal-body">
                      {faceResult ? (
                        <div style={{ textAlign: 'center', padding: '16px' }}>
                          {faceResult.photoDataUrl && (
                            <img src={faceResult.photoDataUrl} alt="Face capture" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: '50%', border: '3px solid #10B981', marginBottom: '12px' }} />
                          )}
                          <div style={{ fontSize: '15px', fontWeight: 700, color: '#10B981', marginBottom: '8px' }}>✅ Face Captured Successfully!</div>
                          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>Face descriptor extracted and ready to save</div>
                        </div>
                      ) : (
                        <FaceCapture
                          mode="register"
                          onSuccess={(result) => setFaceResult(result)}
                          onError={(msg) => setEmpMsg(`⚠️ ${msg}`)}
                          onCancel={() => setAddEmpStep('details')}
                        />
                      )}
                    </div>
                    <div className="modal-footer">
                      <button className="btn btn-ghost" onClick={() => { setFaceResult(null); setAddEmpStep('details'); }}>← Back</button>
                      {faceResult ? (
                        <button className="btn btn-success" onClick={handleAddEmployee}>✅ Create Employee with Face ID</button>
                      ) : (
                        <button className="btn btn-secondary" onClick={handleAddEmployee} title="Create employee without face registration">
                          Skip → Create Without Face
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* EDIT EMPLOYEE MODAL */}
          {showEditEmployee && (
            <div className="modal-overlay" onClick={() => setShowEditEmployee(null)}>
              <div className="modal-box" style={{ maxWidth: '560px' }} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{showEditEmployee._id}</div>
                    <div className="modal-title">Edit Employee — {showEditEmployee.name}</div>
                  </div>
                  <button className="modal-close" onClick={() => setShowEditEmployee(null)}>×</button>
                </div>
                <div className="modal-body">
                  <div className="form-grid">
                    <div className="form-group"><label className="form-label">Full Name</label><input className="form-input" defaultValue={showEditEmployee.name} /></div>
                    <div className="form-group"><label className="form-label">Email</label><input className="form-input" defaultValue={showEditEmployee.email} /></div>
                    <div className="form-group"><label className="form-label">Phone</label><input className="form-input" defaultValue={showEditEmployee.phone} /></div>
                    <div className="form-group">
                      <label className="form-label">Department</label>
                      <select className="form-select" defaultValue={showEditEmployee.department}>
                        <option>Sales</option><option>Operations</option><option>Finance</option><option>Marketing</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Assigned Destination</label>
                      <select className="form-select" defaultValue={showEditEmployee.destination}>
                        {DESTINATIONS.map(d => <option key={d}>{d}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Status</label>
                      <select className="form-select" defaultValue={showEditEmployee.isActive ? 'active' : 'disabled'}>
                        <option value="active">Active</option>
                        <option value="disabled">Disabled</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button className="btn btn-ghost" onClick={() => setShowEditEmployee(null)}>Cancel</button>
                  <button className="btn btn-primary" onClick={() => setShowEditEmployee(null)}>💾 Save Changes</button>
                </div>
              </div>
            </div>
          )}

          {/* FACE REGISTRATION MODAL — Real face-api.js */}
          {showFaceReg && (
            <div className="modal-overlay" onClick={() => setShowFaceReg(null)}>
              <div className="modal-box" style={{ maxWidth: '480px', background: '#111827' }} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <div>
                    <div className="modal-title">📸 Face ID Registration</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                      {employees.find(e => e._id === showFaceReg)?.name}
                    </div>
                  </div>
                  <button className="modal-close" onClick={() => setShowFaceReg(null)}>×</button>
                </div>
                <div className="modal-body">
                  <div style={{ background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: '10px', padding: '10px 14px', marginBottom: '16px', fontSize: '12px', color: '#93C5FD' }}>
                    ℹ️ Capture a clear face photo for biometric attendance check-in. The employee must be present in front of camera.
                  </div>
                  <FaceCapture
                    mode="register"
                    onSuccess={async (result) => {
                      try {
                        await api.post(`/profile/${showFaceReg}/face-register`, {
                          descriptor: result.descriptor,
                          facePhotoDataUrl: result.photoDataUrl || null,
                        });
                        setEmpMsg('✅ Face ID registered successfully!');
                        setTimeout(() => setEmpMsg(''), 3000);
                        saveFaceReg();
                      } catch (err) {
                        setEmpMsg('❌ Failed to save face data. Please try again.');
                      }
                    }}
                    onError={(msg) => {
                      setEmpMsg(`⚠️ ${msg}`);
                    }}
                    onCancel={() => setShowFaceReg(null)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* RESET PASSWORD MODAL */}
          {showResetPwd && (
            <div className="modal-overlay" onClick={() => setShowResetPwd(null)}>
              <div className="modal-box" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <div className="modal-title">🔑 Reset Password</div>
                  <button className="modal-close" onClick={() => setShowResetPwd(null)}>×</button>
                </div>
                <div className="modal-body">
                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '14px' }}>
                    Resetting password for <strong>{showResetPwd.name}</strong> ({showResetPwd._id})
                  </div>
                  <div className="form-group" style={{ marginBottom: '12px' }}>
                    <label className="form-label">New Password *</label>
                    <input className="form-input" type="password" placeholder="Enter new password" value={resetPwdForm.password} onChange={e => setResetPwdForm(f => ({...f, password: e.target.value}))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Confirm Password *</label>
                    <input className="form-input" type="password" placeholder="Confirm new password" value={resetPwdForm.confirm} onChange={e => setResetPwdForm(f => ({...f, confirm: e.target.value}))} />
                  </div>
                </div>
                <div className="modal-footer">
                  <button className="btn btn-ghost" onClick={() => setShowResetPwd(null)}>Cancel</button>
                  <button className="btn btn-primary" onClick={() => setShowResetPwd(null)}>🔑 Reset Password</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════ GENERAL SETTINGS ══════ */}
      {activeTab === 'general' && (
        <div style={{ maxWidth: '640px' }}>
          <div className="card" style={{ marginBottom: '16px' }}>
            <div className="card-title">Application Settings</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group"><label className="form-label">Default Currency</label><select className="form-select"><option>INR (₹)</option><option>USD ($)</option></select></div>
              <div className="form-group"><label className="form-label">Fiscal Year Start</label><select className="form-select"><option>April</option><option>January</option></select></div>
              <div className="form-group"><label className="form-label">Date Format</label><select className="form-select"><option>DD/MM/YYYY</option><option>MM/DD/YYYY</option><option>YYYY-MM-DD</option></select></div>
            </div>
          </div>
          
          <div className="card" style={{ marginBottom: '16px' }}>
            <div className="card-title">Reminder & Notification Settings</div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--color-border)' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '13px' }}>Follow-up Reminders</div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Remind before scheduled lead follow-ups</div>
              </div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <input type="number" className="form-input" style={{ width: '60px', padding: '4px' }} value={settings.reminders.followUpBeforeHrs} onChange={e => setSettings(s => ({...s, reminders: {...s.reminders, followUpBeforeHrs: parseInt(e.target.value)||0}}))} /> <span style={{fontSize:'12px'}}>hrs before</span>
                <label style={{ position: 'relative', display: 'inline-block', width: '40px', height: '22px' }}>
                  <input type="checkbox" checked={settings.reminders.followUpEnabled} onChange={e => setSettings(s => ({...s, reminders: {...s.reminders, followUpEnabled: e.target.checked}}))} style={{ opacity: 0, width: 0, height: 0 }} />
                  <span style={{ position: 'absolute', cursor: 'pointer', inset: 0, borderRadius: '22px', background: settings.reminders.followUpEnabled ? 'var(--color-accent)' : 'var(--color-border)', transition: '0.2s' }}>
                    <span style={{ position: 'absolute', height: '16px', width: '16px', left: settings.reminders.followUpEnabled ? '20px' : '3px', bottom: '3px', borderRadius: '50%', background: '#fff', transition: '0.2s' }} />
                  </span>
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--color-border)' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '13px' }}>Payment Reminders</div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Remind clients about upcoming payments</div>
              </div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <input type="number" className="form-input" style={{ width: '60px', padding: '4px' }} value={settings.reminders.paymentBeforeDays} onChange={e => setSettings(s => ({...s, reminders: {...s.reminders, paymentBeforeDays: parseInt(e.target.value)||0}}))} /> <span style={{fontSize:'12px'}}>days before</span>
                <label style={{ position: 'relative', display: 'inline-block', width: '40px', height: '22px' }}>
                  <input type="checkbox" checked={settings.reminders.paymentEnabled} onChange={e => setSettings(s => ({...s, reminders: {...s.reminders, paymentEnabled: e.target.checked}}))} style={{ opacity: 0, width: 0, height: 0 }} />
                  <span style={{ position: 'absolute', cursor: 'pointer', inset: 0, borderRadius: '22px', background: settings.reminders.paymentEnabled ? 'var(--color-accent)' : 'var(--color-border)', transition: '0.2s' }}>
                    <span style={{ position: 'absolute', height: '16px', width: '16px', left: settings.reminders.paymentEnabled ? '20px' : '3px', bottom: '3px', borderRadius: '50%', background: '#fff', transition: '0.2s' }} />
                  </span>
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--color-border)' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '13px' }}>Travel Date Reminders</div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Notify clients before their travel starts</div>
              </div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <input type="number" className="form-input" style={{ width: '60px', padding: '4px' }} value={settings.reminders.travelBeforeDays} onChange={e => setSettings(s => ({...s, reminders: {...s.reminders, travelBeforeDays: parseInt(e.target.value)||0}}))} /> <span style={{fontSize:'12px'}}>days before</span>
                <label style={{ position: 'relative', display: 'inline-block', width: '40px', height: '22px' }}>
                  <input type="checkbox" checked={settings.reminders.travelEnabled} onChange={e => setSettings(s => ({...s, reminders: {...s.reminders, travelEnabled: e.target.checked}}))} style={{ opacity: 0, width: 0, height: 0 }} />
                  <span style={{ position: 'absolute', cursor: 'pointer', inset: 0, borderRadius: '22px', background: settings.reminders.travelEnabled ? 'var(--color-accent)' : 'var(--color-border)', transition: '0.2s' }}>
                    <span style={{ position: 'absolute', height: '16px', width: '16px', left: settings.reminders.travelEnabled ? '20px' : '3px', bottom: '3px', borderRadius: '50%', background: '#fff', transition: '0.2s' }} />
                  </span>
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '13px' }}>Daily Digest Email</div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Send daily KPI and task digest to admins</div>
              </div>
              <label style={{ position: 'relative', display: 'inline-block', width: '40px', height: '22px' }}>
                <input type="checkbox" checked={settings.reminders.dailyDigest} onChange={e => setSettings(s => ({...s, reminders: {...s.reminders, dailyDigest: e.target.checked}}))} style={{ opacity: 0, width: 0, height: 0 }} />
                <span style={{ position: 'absolute', cursor: 'pointer', inset: 0, borderRadius: '22px', background: settings.reminders.dailyDigest ? 'var(--color-accent)' : 'var(--color-border)', transition: '0.2s' }}>
                  <span style={{ position: 'absolute', height: '16px', width: '16px', left: settings.reminders.dailyDigest ? '20px' : '3px', bottom: '3px', borderRadius: '50%', background: '#fff', transition: '0.2s' }} />
                </span>
              </label>
            </div>
            
            <button className="btn btn-primary" style={{ marginTop: '16px' }} onClick={saveReminders}>💾 Save Reminders</button>
          </div>
        </div>
      )}

      {/* ══════ GEO-FENCE TAB — Live Map ══════ */}
      {activeTab === 'geofence' && <GeoFenceTab />}

      {/* ══════ ROLES & PERMISSIONS ══════ */}
      {activeTab === 'roles' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))', gap: '12px' }}>
          {ROLES.map(role => (
            <div key={role.value} className="card" style={{ borderTop: `3px solid ${role.color}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <div className="avatar" style={{ background: role.color, width: 36, height: 36, fontSize: '14px' }}>{role.label[0]}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '14px' }}>{role.label}</div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{role.desc}</div>
                </div>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                <div style={{ fontWeight: 600, marginBottom: '6px' }}>Permissions:</div>
                {[
                  { label: 'View Dashboard', admin: true, employee: true },
                  { label: 'Lead Pipeline / CRM', admin: true, employee: true },
                  { label: 'Quote Builder', admin: true, employee: true },
                  { label: 'Booking Management', admin: true, employee: true },
                  { label: 'WhatsApp & Exports', admin: true, employee: true },
                  { label: 'Edit Pricing Engine', admin: true, employee: false },
                  { label: 'Financial Ledger', admin: true, employee: false },
                  { label: 'Analytics Dashboard', admin: true, employee: false },
                  { label: 'Employee Management', admin: true, employee: false },
                  { label: 'Settings & Config', admin: true, employee: false },
                  { label: 'Face ID Required', admin: false, employee: true },
                  { label: 'Geo-fence Validation', admin: false, employee: true },
                ].map((p, i) => {
                  const granted = role.value === 'admin' ? p.admin : p.employee;
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <span style={{ color: granted ? 'var(--color-success)' : 'var(--color-danger)', fontSize: '11px' }}>{granted ? '✓' : '✗'}</span>
                      <span style={{ opacity: granted ? 1 : 0.5 }}>{p.label}</span>
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--color-text-muted)' }}>
                {role.value === 'admin' ? '1 admin configured' : `${employees.filter(e => e.role === 'employee').length} employees assigned`}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ══════ COMPANY PROFILE ══════ */}
      {activeTab === 'company' && (
        <div style={{ maxWidth: '640px' }}>
          <div className="card">
            <div className="card-title">🏢 Company Information</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              
              {/* Logo Upload */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '10px' }}>
                <div style={{ width: '80px', height: '80px', borderRadius: '12px', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', overflow: 'hidden', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  {settings.companyLogo ? (
                    <img
                      src={settings.companyLogo.startsWith('http') ? settings.companyLogo : `${window.location.protocol}//${window.location.hostname}:5000${settings.companyLogo}`}
                      alt="Company Logo"
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                      onError={e => { e.target.style.display = 'none'; }}
                    />
                  ) : (
                    <span style={{ fontSize: '24px' }}>🏢</span>
                  )}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>Company Logo</div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '8px' }}>Recommended: 256x256px PNG or JPEG</div>
                  <input type="file" ref={logoRef} hidden accept="image/*" onChange={handleLogoUpload} />
                  <button className="btn btn-secondary btn-sm" onClick={() => logoRef.current?.click()} disabled={logoUploading}>
                    {logoUploading ? 'Uploading...' : 'Upload Logo'}
                  </button>
                </div>
              </div>

              <div className="form-group"><label className="form-label">Company Name</label><input className="form-input" value={settings.companyName} onChange={e => setSettings(s => ({...s, companyName: e.target.value}))} /></div>
              <div className="form-group"><label className="form-label">GST Number</label><input className="form-input" value={settings.gstNumber} onChange={e => setSettings(s => ({...s, gstNumber: e.target.value}))} /></div>
              <div className="form-group"><label className="form-label">PAN</label><input className="form-input" value={settings.panNumber} onChange={e => setSettings(s => ({...s, panNumber: e.target.value}))} /></div>
              <div className="form-group"><label className="form-label">Address</label><textarea className="form-textarea" value={settings.companyAddress} onChange={e => setSettings(s => ({...s, companyAddress: e.target.value}))} /></div>
              <div className="form-grid">
                <div className="form-group"><label className="form-label">Phone</label><input className="form-input" value={settings.companyPhone} onChange={e => setSettings(s => ({...s, companyPhone: e.target.value}))} /></div>
                <div className="form-group"><label className="form-label">Email</label><input className="form-input" value={settings.companyEmail} onChange={e => setSettings(s => ({...s, companyEmail: e.target.value}))} /></div>
              </div>
              <div className="form-group"><label className="form-label">Website</label><input className="form-input" value={settings.companyWebsite} onChange={e => setSettings(s => ({...s, companyWebsite: e.target.value}))} /></div>
              <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={saveCompanyInfo}>💾 Update Company Info</button>
            </div>
          </div>
        </div>
      )}

      {/* ══════ INTEGRATIONS ══════ */}
      {activeTab === 'integrations' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '640px' }}>
          
          <div className="card" style={{ borderLeft: '4px solid #25D366' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ width: 40, height: 40, borderRadius: '12px', background: '#25D36612', display: 'grid', placeItems: 'center', fontSize: '20px' }}>💬</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '16px' }}>WhatsApp Business API</div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Automated messaging, quotes, and itineraries</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600 }}>Active:</span>
                <label style={{ position: 'relative', display: 'inline-block', width: '36px', height: '20px' }}>
                  <input type="checkbox" checked={settings.whatsapp.isConfigured} onChange={e => setSettings(s => ({...s, whatsapp: {...s.whatsapp, isConfigured: e.target.checked}}))} style={{ opacity: 0, width: 0, height: 0 }} />
                  <span style={{ position: 'absolute', cursor: 'pointer', inset: 0, borderRadius: '22px', background: settings.whatsapp.isConfigured ? '#25D366' : 'var(--color-border)', transition: '0.2s' }}>
                    <span style={{ position: 'absolute', height: '14px', width: '14px', left: settings.whatsapp.isConfigured ? '19px' : '3px', bottom: '3px', borderRadius: '50%', background: '#fff', transition: '0.2s' }} />
                  </span>
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px', background: 'var(--color-bg-secondary)', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
              <div className="form-group">
                <label className="form-label">Phone Number ID</label>
                <input className="form-input" placeholder="e.g. 1090123456789" value={settings.whatsapp.phoneNumberId} onChange={e => setSettings(s => ({...s, whatsapp: {...s.whatsapp, phoneNumberId: e.target.value}}))} />
              </div>
              <div className="form-group">
                <label className="form-label">Business Account ID</label>
                <input className="form-input" placeholder="e.g. 1090123456789" value={settings.whatsapp.businessAccountId} onChange={e => setSettings(s => ({...s, whatsapp: {...s.whatsapp, businessAccountId: e.target.value}}))} />
              </div>
              <div className="form-group">
                <label className="form-label">Permanent Access Token</label>
                <input className="form-input" type="password" placeholder="EAA..." value={settings.whatsapp.apiToken} onChange={e => setSettings(s => ({...s, whatsapp: {...s.whatsapp, apiToken: e.target.value}}))} />
              </div>
              <div className="form-group">
                <label className="form-label">Webhook Verify Token</label>
                <input className="form-input" placeholder="Custom token for Meta Webhooks" value={settings.whatsapp.webhookToken} onChange={e => setSettings(s => ({...s, whatsapp: {...s.whatsapp, webhookToken: e.target.value}}))} />
              </div>
              <button className="btn btn-primary" style={{ alignSelf: 'flex-start', background: '#25D366', borderColor: '#25D366' }} onClick={saveWhatsapp}>
                💾 Save WhatsApp Config
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: '12px' }}>
            {[
              { name: 'Razorpay', icon: '💳', status: 'not_connected', desc: 'Payment gateway integration', color: '#3B82F6' },
              { name: 'Google Maps', icon: '🗺️', status: 'connected', desc: 'Geo-fencing and location services', color: '#4285F4' },
              { name: 'AWS S3', icon: '☁️', status: 'not_connected', desc: 'File and document storage', color: '#FF9900' },
            ].map(int => (
              <div key={int.name} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: 40, height: 40, borderRadius: '12px', background: `${int.color}12`, display: 'grid', placeItems: 'center', fontSize: '20px' }}>{int.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '14px' }}>{int.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{int.desc}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className={`badge ${int.status === 'connected' ? 'badge-confirmed' : 'badge-neutral'}`}>
                    {int.status === 'connected' ? '✓ Connected' : '○ Not Connected'}
                  </span>
                  <button className={`btn btn-sm ${int.status === 'connected' ? 'btn-ghost' : 'btn-primary'}`}>
                    {int.status === 'connected' ? 'Configure' : 'Connect'}
                  </button>
                </div>
              </div>
            ))}
          </div>

        </div>
      )}
    </div>
  );
}
