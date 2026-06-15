import React, { useState } from 'react';
import { downloadFile } from '../../services/api';

const EXPORT_TYPES = [
  { id: 'leads',      label: 'Lead Pipeline',      icon: '🎯', desc: 'All leads with stage, priority, source, follow-up dates',    count: 324, endpoint: '/exports/leads',      filename: 'PakkaTourism_Leads.xlsx' },
  { id: 'bookings',   label: 'Bookings',            icon: '📋', desc: 'Complete booking records with payments and status',           count: 1247, endpoint: '/exports/bookings', filename: 'PakkaTourism_Bookings.xlsx' },
  { id: 'revenue',    label: 'Revenue Report',       icon: '💰', desc: 'Income transactions with breakdown by category',            count: 856, endpoint: '/exports/revenue',   filename: 'PakkaTourism_Revenue.xlsx' },
  { id: 'vendors',    label: 'Vendor Payments',      icon: '🏢', desc: 'Vendor payable/paid/outstanding with service details',      count: 7,   endpoint: '/exports/vendors',   filename: 'PakkaTourism_Vendors.xlsx' },
  { id: 'attendance', label: 'Attendance Records',   icon: '📅', desc: 'Employee check-in/out, hours worked, work mode',            count: 480, endpoint: '/exports/attendance', filename: 'PakkaTourism_Attendance.xlsx' },
  { id: 'matrix',     label: 'Tariff Matrix',        icon: '📊', desc: '1–50 pax pricing matrix for selected duration',             count: 50,  endpoint: '/exports/matrix',    filename: 'PakkaTourism_TariffMatrix.xlsx' },
];

export default function ExcelExport() {
  const [selected, setSelected]     = useState([]);
  const [dateRange, setDateRange]   = useState({ from: '', to: '' });
  const [exporting, setExporting]   = useState(null);   // ID currently exporting
  const [completed, setCompleted]   = useState([]);     // IDs successfully exported
  const [errors, setErrors]         = useState({});     // { [id]: errorMessage }

  const toggleSelect = (id) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const selectAll = () => {
    setSelected(selected.length === EXPORT_TYPES.length ? [] : EXPORT_TYPES.map(e => e.id));
  };

  // ── Core export handler using the reusable downloadFile utility ──
  const handleExport = async (id) => {
    const exp = EXPORT_TYPES.find(e => e.id === id);
    if (!exp) return;

    setExporting(id);
    setErrors(prev => ({ ...prev, [id]: null }));

    try {
      // Pass optional date range as query params — backend filters by these
      const params = {};
      if (dateRange.from) params.from = dateRange.from;
      if (dateRange.to)   params.to   = dateRange.to;

      // downloadFile handles: responseType:'blob', createObjectURL, anchor click, cleanup
      await downloadFile(exp.endpoint, exp.filename, params);

      setCompleted(prev => [...new Set([...prev, id])]);
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Export failed. Please try again.';
      setErrors(prev => ({ ...prev, [id]: msg }));
    } finally {
      setExporting(null);
    }
  };

  const handleBulkExport = async () => {
    for (const id of selected) {
      await handleExport(id);
    }
  };

  return (
    <div className="page-content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="page-title">Excel Export</h1>
          <p className="page-sub">Export business data as formatted Excel spreadsheets</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary btn-sm" onClick={selectAll}>
            {selected.length === EXPORT_TYPES.length ? '☐ Deselect All' : '☑ Select All'}
          </button>
          <button className="btn btn-primary" onClick={handleBulkExport} disabled={selected.length === 0 || !!exporting}>
            📥 Export Selected ({selected.length})
          </button>
        </div>
      </div>

      {/* Date Range Filter */}
      <div className="card card-sm" style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, fontSize: '13px' }}>📅 Date Range:</span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input type="date" className="form-input" style={{ width: '160px', padding: '6px 10px' }}
            value={dateRange.from} onChange={e => setDateRange(p => ({ ...p, from: e.target.value }))} />
          <span style={{ color: 'var(--color-text-muted)' }}>to</span>
          <input type="date" className="form-input" style={{ width: '160px', padding: '6px 10px' }}
            value={dateRange.to} onChange={e => setDateRange(p => ({ ...p, to: e.target.value }))} />
        </div>
        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Leave empty for all-time data</span>
      </div>

      {/* Export Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: '12px' }}>
        {EXPORT_TYPES.map(exp => {
          const isSelected  = selected.includes(exp.id);
          const isExporting = exporting === exp.id;
          const isDone      = completed.includes(exp.id);
          const hasError    = !!errors[exp.id];

          return (
            <div key={exp.id} className="card" style={{
              cursor: 'pointer',
              border: `1.5px solid ${hasError ? 'var(--color-danger)' : isSelected ? 'var(--color-accent)' : isDone ? 'var(--color-success-border)' : 'var(--color-border)'}`,
              background: hasError ? 'rgba(220,38,38,0.04)' : isDone ? 'var(--color-success-bg)' : isSelected ? 'var(--color-accent-subtle)' : undefined,
              transition: 'all 0.2s',
            }} onClick={() => toggleSelect(exp.id)}>

              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: '12px', display: 'grid', placeItems: 'center',
                    fontSize: '22px', background: 'var(--color-bg-secondary)', flexShrink: 0
                  }}>{exp.icon}</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '14px' }}>{exp.label}</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{exp.count.toLocaleString()} records</div>
                  </div>
                </div>
                {/* Checkbox */}
                <div style={{
                  width: 20, height: 20, borderRadius: '4px',
                  border: `2px solid ${isSelected ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  background: isSelected ? 'var(--color-accent)' : 'transparent',
                  display: 'grid', placeItems: 'center', flexShrink: 0
                }}>
                  {isSelected && <span style={{ color: '#fff', fontSize: '12px', fontWeight: 700 }}>✓</span>}
                </div>
              </div>

              {/* Description */}
              <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', lineHeight: 1.5, marginBottom: '14px' }}>
                {exp.desc}
              </div>

              {/* Error message */}
              {hasError && (
                <div style={{ fontSize: '11px', color: 'var(--color-danger)', marginBottom: '10px', padding: '6px 10px', background: 'rgba(220,38,38,0.08)', borderRadius: '6px' }}>
                  ❌ {errors[exp.id]}
                </div>
              )}

              {/* Action button */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className={`btn btn-sm ${hasError ? 'btn-danger' : isDone ? 'btn-success' : 'btn-secondary'}`}
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={(e) => { e.stopPropagation(); handleExport(exp.id); }}
                  disabled={isExporting}
                >
                  {isExporting ? (
                    <><div style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Exporting…</>
                  ) : isDone ? (
                    '✅ Downloaded'
                  ) : hasError ? (
                    '🔄 Retry'
                  ) : (
                    '📥 Export .xlsx'
                  )}
                </button>
                {isDone && (
                  <button
                    className="btn btn-ghost btn-sm"
                    title="Download again"
                    onClick={(e) => { e.stopPropagation(); handleExport(exp.id); }}
                    disabled={isExporting}
                  >
                    ↺
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Export History */}
      {completed.length > 0 && (
        <div className="card" style={{ marginTop: '20px' }}>
          <div className="card-title">✅ Recently Exported</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {completed.map(id => {
              const exp = EXPORT_TYPES.find(e => e.id === id);
              return (
                <div key={id} style={{
                  display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px',
                  background: 'var(--color-success-bg)', borderRadius: '8px',
                  border: '1px solid var(--color-success-border)', fontSize: '13px'
                }}>
                  <span>{exp.icon}</span>
                  <span style={{ fontWeight: 600 }}>{exp.label}</span>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '11px' }}>{exp.count.toLocaleString()} records</span>
                  <code style={{ marginLeft: '4px', fontSize: '10px', color: 'var(--color-text-muted)' }}>{exp.filename}</code>
                  <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--color-success)' }}>✓ Saved to Downloads</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Keyframe for spinner — injected once */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
