import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../services/api';
import useAuthStore from '../../store/useAuthStore';

const API_BASE = `http://${window.location.hostname}:5000`;

const DOC_TYPES = [
  { value: 'aadhaar',     label: '🪪 Aadhaar Card',    color: '#F97316' },
  { value: 'pan',         label: '💳 PAN Card',        color: '#8B5CF6' },
  { value: 'certificate', label: '📜 Certificate',     color: '#2563EB' },
  { value: 'other',       label: '📎 Other Document',  color: '#64748B' },
];

const BLOOD_GROUPS = ['A+','A-','B+','B-','AB+','AB-','O+','O-'];

export default function ProfilePage() {
  const { id } = useParams();
  const { user: authUser, updateUser } = useAuthStore();
  const isOwnProfile = !id || id === authUser?._id;
  const isAdmin = authUser?.role === 'admin';

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [uploading, setUploading] = useState(false);
  const [docUpload, setDocUpload] = useState({ show: false, type: 'aadhaar', name: '' });

  const avatarRef = useRef(null);
  const docRef = useRef(null);

  useEffect(() => { fetchProfile(); }, [id]);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const endpoint = isOwnProfile ? '/profile/me' : `/profile/${id}`;
      const { data } = await api.get(endpoint);
      setProfile(data.data);
    } catch (err) {
      console.error('Failed to load profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMsg('');
    try {
      const endpoint = isOwnProfile ? '/profile/me' : `/profile/${id}`;
      const { data } = await api.put(endpoint, profile);
      setProfile(data.data);
      setMsg('✅ Profile saved successfully!');
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      setMsg(`❌ ${err.response?.data?.message || 'Save failed'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const endpoint = isOwnProfile ? '/profile/avatar' : `/profile/${id}/avatar`;
      const { data } = await api.post(endpoint, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setProfile(data.data);
      // Sync to auth store so Topbar photo updates immediately
      if (isOwnProfile && data.data?.profilePhoto) {
        updateUser({ profilePhoto: data.data.profilePhoto });
      }
      setMsg('Photo uploaded!');
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      setMsg(`❌ Upload failed: ${err.response?.data?.message || err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDocUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('document', file);
      formData.append('docType', docUpload.type);
      formData.append('docName', docUpload.name || file.name);
      const endpoint = isOwnProfile ? '/profile/document' : `/profile/${id}/document`;
      const { data } = await api.post(endpoint, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setProfile(data.data);
      setDocUpload({ show: false, type: 'aadhaar', name: '' });
      setMsg('✅ Document uploaded!');
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      setMsg(`❌ Upload failed: ${err.response?.data?.message || err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDocDelete = async (docId) => {
    if (!window.confirm('Delete this document?')) return;
    try {
      const endpoint = isOwnProfile
        ? `/profile/document/${docId}`
        : `/profile/${id}/document/${docId}`;
      const { data } = await api.delete(endpoint);
      setProfile(data.data);
    } catch (err) {
      setMsg(`❌ Delete failed`);
    }
  };

  if (loading) return (
    <div className="page-content">
      <div style={{ textAlign: 'center', padding: '80px', color: 'var(--color-text-muted)' }}>
        <div style={{ fontSize: '48px', marginBottom: '12px' }}>👤</div>
        <div style={{ fontSize: '15px', fontWeight: 600 }}>Loading profile…</div>
      </div>
    </div>
  );

  if (!profile) return (
    <div className="page-content">
      <div style={{ textAlign: 'center', padding: '60px', color: '#DC2626' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
        <div style={{ fontWeight: 700 }}>Profile not found</div>
      </div>
    </div>
  );

  const TABS = [
    { id: 'overview',  label: '👤 Overview' },
    { id: 'personal',  label: '📋 Personal Details' },
    { id: 'documents', label: '📎 Documents' },
    ...(isAdmin ? [{ id: 'admin', label: '🔐 Admin' }] : []),
  ];

  const avatarUrl = profile.profilePhoto
    ? (profile.profilePhoto.startsWith('http') ? profile.profilePhoto : `${API_BASE}${profile.profilePhoto}`)
    : null;

  return (
    <div className="page-content">
      <div className="page-header">
        <h1 className="page-title">{isOwnProfile ? 'My Profile' : `Employee Profile — ${profile.name}`}</h1>
        <p className="page-sub">
          {isOwnProfile ? 'View and manage your account details' : `Viewing ${profile.name}'s profile`}
        </p>
      </div>

      {/* Status Message */}
      {msg && (
        <div style={{
          padding: '10px 16px', borderRadius: '10px', marginBottom: '16px', fontSize: '13px',
          background: msg.startsWith('✅') ? 'rgba(16,185,129,0.1)' : 'rgba(220,38,38,0.1)',
          color: msg.startsWith('✅') ? '#059669' : '#DC2626',
          border: `1px solid ${msg.startsWith('✅') ? 'rgba(16,185,129,0.3)' : 'rgba(220,38,38,0.3)'}`
        }}>
          {msg}
        </div>
      )}

      {/* Profile Header Card */}
      <div className="card" style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
        {/* Avatar */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div style={{
            width: 80, height: 80, borderRadius: '50%', overflow: 'hidden',
            border: '3px solid var(--color-accent)',
            background: avatarUrl ? `url(${avatarUrl}) center/cover no-repeat` : 'linear-gradient(135deg, #2563EB, #7C3AED)',
            display: 'grid', placeItems: 'center',
            color: '#fff', fontSize: '32px', fontWeight: 800,
          }}>
            {!avatarUrl && (profile.name?.[0] || 'U').toUpperCase()}
          </div>
          <button
            onClick={() => avatarRef.current?.click()}
            disabled={uploading}
            style={{
              position: 'absolute', bottom: -4, right: -4,
              width: 28, height: 28, borderRadius: '50%',
              background: 'var(--color-accent)', color: '#fff', border: '2px solid var(--color-bg-surface)',
              display: 'grid', placeItems: 'center', cursor: 'pointer', fontSize: '12px'
            }}
          >
            📷
          </button>
          <input ref={avatarRef} type="file" accept="image/*" hidden onChange={handleAvatarUpload} />
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '22px', fontWeight: 800 }}>{profile.name}</div>
          <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '4px' }}>
            <span>✉️ {profile.email}</span>
            {profile.phone && <span>📞 {profile.phone}</span>}
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
            <span style={{
              fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '99px',
              background: profile.role === 'admin' ? 'rgba(37,99,235,0.12)' : 'rgba(16,185,129,0.12)',
              color: profile.role === 'admin' ? '#2563EB' : '#10B981',
              border: `1px solid ${profile.role === 'admin' ? 'rgba(37,99,235,0.3)' : 'rgba(16,185,129,0.3)'}`
            }}>
              {profile.role?.toUpperCase()}
            </span>
            <span style={{
              fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '99px',
              background: 'rgba(100,116,139,0.1)', color: '#64748B', border: '1px solid rgba(100,116,139,0.2)'
            }}>
              {profile.department} · {profile.designation}
            </span>
            {profile.faceRegistered && (
              <span style={{
                fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '99px',
                background: 'rgba(16,185,129,0.12)', color: '#10B981', border: '1px solid rgba(52,211,153,0.3)'
              }}>
                🔐 Face ID Registered
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: '4px', marginBottom: '20px', borderBottom: '1px solid var(--color-border)',
        overflowX: 'auto', paddingBottom: '0'
      }}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            padding: '10px 16px', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
            border: 'none', background: 'none',
            borderBottom: `2px solid ${activeTab === tab.id ? 'var(--color-accent)' : 'transparent'}`,
            color: activeTab === tab.id ? 'var(--color-accent)' : 'var(--color-text-muted)',
            transition: 'all 0.15s', whiteSpace: 'nowrap', fontFamily: 'Inter, sans-serif'
          }}>{tab.label}</button>
        ))}
      </div>

      {/* ══════ OVERVIEW TAB ══════ */}
      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          <div className="card">
            <div className="card-title">Basic Information</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
              {[
                ['Full Name', profile.name],
                ['Email', profile.email],
                ['Phone', profile.phone || '—'],
                ['Department', profile.department],
                ['Designation', profile.designation],
                ['Destination', profile.destination || '—'],
                ['Work Mode', profile.workMode === 'wfh' ? '🏠 WFH' : '🏢 In-Office'],
                ['Join Date', profile.joinDate ? new Date(profile.joinDate).toLocaleDateString('en-IN') : '—'],
                ['Last Login', profile.lastLogin ? new Date(profile.lastLogin).toLocaleString('en-IN') : '—'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>{k}</span>
                  <span style={{ fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-title">Quick Stats</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '10px' }}>
              {[
                { label: 'Documents', value: profile.documents?.length || 0, icon: '📎' },
                { label: 'Face ID', value: profile.faceRegistered ? '✓' : '✗', icon: '🔐' },
                { label: 'Status', value: profile.isActive ? 'Active' : 'Disabled', icon: profile.isActive ? '✅' : '⏸️' },
                { label: 'Blood Group', value: profile.bloodGroup || '—', icon: '🩸' },
              ].map(s => (
                <div key={s.label} className="card card-sm" style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '20px', marginBottom: '4px' }}>{s.icon}</div>
                  <div style={{ fontSize: '16px', fontWeight: 700 }}>{s.value}</div>
                  <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════ PERSONAL DETAILS TAB ══════ */}
      {activeTab === 'personal' && (
        <div className="card" style={{ maxWidth: '640px' }}>
          <div className="card-title">Personal Details</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="form-group"><label className="form-label">Full Name *</label><input className="form-input" value={profile.name || ''} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} /></div>
            <div className="form-group"><label className="form-label">Phone</label><input className="form-input" value={profile.phone || ''} onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))} /></div>
            <div className="form-group"><label className="form-label">Date of Birth</label><input type="date" className="form-input" value={profile.dateOfBirth ? profile.dateOfBirth.substring(0, 10) : ''} onChange={e => setProfile(p => ({ ...p, dateOfBirth: e.target.value }))} /></div>
            <div className="form-group"><label className="form-label">Blood Group</label>
              <select className="form-select" value={profile.bloodGroup || ''} onChange={e => setProfile(p => ({ ...p, bloodGroup: e.target.value }))}>
                <option value="">Select</option>
                {BLOOD_GROUPS.map(bg => <option key={bg}>{bg}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Address</label><textarea className="form-textarea" value={profile.address || ''} onChange={e => setProfile(p => ({ ...p, address: e.target.value }))} /></div>
            <div className="form-group"><label className="form-label">Emergency Contact</label><input className="form-input" value={profile.emergencyContact || ''} onChange={e => setProfile(p => ({ ...p, emergencyContact: e.target.value }))} /></div>

            {(isAdmin || isOwnProfile) && (
              <>
                <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '14px', marginTop: '4px' }}>
                  <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '12px' }}>🏦 Bank Details</div>
                </div>
                <div className="form-group"><label className="form-label">Bank Name</label><input className="form-input" value={profile.bankDetails?.bankName || ''} onChange={e => setProfile(p => ({ ...p, bankDetails: { ...p.bankDetails, bankName: e.target.value } }))} /></div>
                <div className="form-group"><label className="form-label">Account Number</label><input className="form-input" value={profile.bankDetails?.accountNumber || ''} onChange={e => setProfile(p => ({ ...p, bankDetails: { ...p.bankDetails, accountNumber: e.target.value } }))} /></div>
                <div className="form-group"><label className="form-label">IFSC Code</label><input className="form-input" value={profile.bankDetails?.ifsc || ''} onChange={e => setProfile(p => ({ ...p, bankDetails: { ...p.bankDetails, ifsc: e.target.value } }))} /></div>
              </>
            )}

            <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ alignSelf: 'flex-start' }}>
              {saving ? '⟳ Saving…' : '💾 Save Changes'}
            </button>
          </div>
        </div>
      )}

      {/* ══════ DOCUMENTS TAB ══════ */}
      {activeTab === 'documents' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
              {profile.documents?.length || 0} documents uploaded
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => setDocUpload(d => ({ ...d, show: true }))}>
              + Upload Document
            </button>
          </div>

          {/* Upload Panel */}
          {docUpload.show && (
            <div className="card" style={{ marginBottom: '16px', border: '2px dashed var(--color-accent)', background: 'var(--color-accent-subtle)' }}>
              <div className="card-title">📎 Upload New Document</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Document Type</label>
                  <select className="form-select" value={docUpload.type} onChange={e => setDocUpload(d => ({ ...d, type: e.target.value }))}>
                    {DOC_TYPES.map(dt => <option key={dt.value} value={dt.value}>{dt.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Document Name</label>
                  <input className="form-input" placeholder="e.g. Aadhaar Front" value={docUpload.name} onChange={e => setDocUpload(d => ({ ...d, name: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <button className="btn btn-primary btn-sm" onClick={() => docRef.current?.click()} disabled={uploading}>
                  {uploading ? '⟳ Uploading…' : '📁 Choose File'}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setDocUpload({ show: false, type: 'aadhaar', name: '' })}>Cancel</button>
              </div>
              <input ref={docRef} type="file" accept="image/*,.pdf,.doc,.docx" hidden onChange={handleDocUpload} />
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '8px' }}>
                Max 5MB · Accepted: JPEG, PNG, PDF, DOC
              </div>
            </div>
          )}

          {/* Document Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
            {(profile.documents || []).map(doc => {
              const docType = DOC_TYPES.find(d => d.value === doc.type) || DOC_TYPES[3];
              const fileUrl = `${window.location.protocol}//${window.location.hostname}:5000${doc.url}`;
              const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(doc.url);
              return (
                <div key={doc._id} className="card" style={{ borderTop: `3px solid ${docType.color}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '13px' }}>{docType.label}</div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{doc.name}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-xs" title="View">👁</a>
                      <button className="btn btn-ghost btn-xs" style={{ color: 'var(--color-danger)' }} onClick={() => handleDocDelete(doc._id)} title="Delete">🗑</button>
                    </div>
                  </div>
                  {isImage && (
                    <div style={{ borderRadius: '8px', overflow: 'hidden', height: '120px', background: 'var(--color-bg-secondary)' }}>
                      <img src={fileUrl} alt={doc.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                  )}
                  {!isImage && (
                    <div style={{ height: '80px', borderRadius: '8px', background: 'var(--color-bg-secondary)', display: 'grid', placeItems: 'center', fontSize: '32px' }}>
                      📄
                    </div>
                  )}
                  <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '6px' }}>
                    Uploaded: {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString('en-IN') : '—'}
                  </div>
                </div>
              );
            })}
            {(!profile.documents || profile.documents.length === 0) && (
              <div className="card" style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)' }}>
                <div style={{ fontSize: '48px', marginBottom: '8px' }}>📎</div>
                <div style={{ fontWeight: 600 }}>No documents uploaded yet</div>
                <div style={{ fontSize: '12px', marginTop: '4px' }}>Upload Aadhaar, PAN, certificates and more</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════ ADMIN TAB ══════ */}
      {activeTab === 'admin' && isAdmin && (
        <div className="card" style={{ maxWidth: '640px' }}>
          <div className="card-title">🔐 Admin Controls</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="form-group"><label className="form-label">Department</label>
              <select className="form-select" value={profile.department || ''} onChange={e => setProfile(p => ({ ...p, department: e.target.value }))}>
                {['Sales','Operations','Finance','Marketing','HR','IT'].map(d => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Designation</label><input className="form-input" value={profile.designation || ''} onChange={e => setProfile(p => ({ ...p, designation: e.target.value }))} /></div>
            <div className="form-group"><label className="form-label">Assigned Destination</label><input className="form-input" value={profile.destination || ''} onChange={e => setProfile(p => ({ ...p, destination: e.target.value }))} /></div>
            <div className="form-group"><label className="form-label">Join Date</label><input type="date" className="form-input" value={profile.joinDate ? profile.joinDate.substring(0, 10) : ''} onChange={e => setProfile(p => ({ ...p, joinDate: e.target.value }))} /></div>
            <div className="form-group"><label className="form-label">Monthly Salary (₹)</label><input type="number" className="form-input" value={profile.salary || ''} onChange={e => setProfile(p => ({ ...p, salary: parseInt(e.target.value) || 0 }))} /></div>
            <div className="form-group"><label className="form-label">Work Mode</label>
              <select className="form-select" value={profile.workMode || 'office'} onChange={e => setProfile(p => ({ ...p, workMode: e.target.value }))}>
                <option value="office">🏢 In-Office</option>
                <option value="wfh">🏠 Work from Home</option>
              </select>
            </div>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ alignSelf: 'flex-start' }}>
              {saving ? '⟳ Saving…' : '💾 Save Changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
