import React, { useState, useEffect, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import useAuthStore from '../../store/useAuthStore';
import api from '../../services/api';

/* ─── Constants ─────────────────────────────────────────────────────────── */
const STAGES = [
  'new_inquiry', 'negotiation', 'quote_sent', 'advance_pending', 'confirmed',
];
const ALL_STAGES = [...STAGES, 'contacted', 'completed', 'lost'];

const STAGE_META = {
  new_inquiry:     { label: 'New Inquiry',      color: '#60A5FA', bg: 'rgba(96,165,250,0.08)',  icon: '🌱' },
  contacted:       { label: 'Contacted',         color: '#818CF8', bg: 'rgba(129,140,248,0.08)', icon: '📞' },
  negotiation:     { label: 'Negotiation',       color: '#A78BFA', bg: 'rgba(167,139,250,0.08)', icon: '🤝' },
  quote_sent:      { label: 'Quote Sent',        color: '#FBBF24', bg: 'rgba(251,191,36,0.08)',  icon: '📄' },
  advance_pending: { label: 'Advance Pending',   color: '#FB923C', bg: 'rgba(251,146,60,0.08)',  icon: '💸' },
  confirmed:       { label: 'Confirmed',         color: '#34D399', bg: 'rgba(52,211,153,0.08)',  icon: '🎉' },
  completed:       { label: 'Completed',         color: '#10B981', bg: 'rgba(16,185,129,0.08)',  icon: '✅' },
  lost:            { label: 'Lost',              color: '#F87171', bg: 'rgba(248,113,113,0.08)', icon: '❌' },
};

const PRIORITY_STYLE = {
  urgent: { bg: '#FEF2F2', color: '#DC2626', border: '#FEE2E2', dot: '#DC2626' },
  high:   { bg: '#FFFBEB', color: '#D97706', border: '#FDE68A', dot: '#F59E0B' },
  medium: { bg: '#EFF6FF', color: '#2563EB', border: '#BFDBFE', dot: '#2563EB' },
  low:    { bg: '#F1F5F9', color: '#64748B', border: '#E2E8F0', dot: '#94A3B8' },
};

const SOURCE_ICON = {
  whatsapp: '💬', phone: '📞', website: '🌐', referral: '🤝',
  indiamart: '🛒', google: '🔍', social: '📱', walk_in: '🚶', other: '📧',
};

const ACTIVITY_ICONS = {
  lead_created: '🌱', assigned: '👤', reassigned: '🔄', call_made: '📞',
  followup_added: '⏰', quote_sent: '📄', advance_received: '💰',
  booking_confirmed: '🎉', stage_changed: '→', note_added: '✏️', lost: '❌',
};

/* ─── Smart Priority Badge ───────────────────────────────────────────────── */
function SmartPriorityBadge({ lead }) {
  if (!lead.highPriority) return null;
  const daysLeft = lead.daysUntilTravel != null ? Math.ceil(lead.daysUntilTravel) : null;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      background: 'linear-gradient(135deg,#DC2626,#B91C1C)',
      color: '#fff', fontSize: '9px', fontWeight: 800, letterSpacing: '0.06em',
      padding: '2px 7px', borderRadius: '99px',
      boxShadow: '0 2px 8px rgba(220,38,38,0.35)',
      animation: 'pulse-red 1.5s ease-in-out infinite',
    }}>
      🔥 HOT{daysLeft != null ? ` · ${daysLeft}d` : ''}
    </div>
  );
}

/* ─── Lead Card (Sortable via dnd-kit) ──────────────────────────────────── */
function LeadCard({ lead, onClick, isDragging = false }) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging: isSortableDragging,
  } = useSortable({ id: lead._id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSortableDragging ? 0.35 : 1,
    touchAction: 'none',
  };

  const pb      = PRIORITY_STYLE[lead.priority] || PRIORITY_STYLE.medium;
  const isOverdue = lead.followUpDate
    && new Date(lead.followUpDate) < new Date()
    && !['confirmed', 'completed', 'lost'].includes(lead.leadStatus);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="kanban-card"
      style={{
        ...style,
        cursor: isDragging ? 'grabbing' : 'grab',
        borderLeft: lead.highPriority ? '3px solid #DC2626' : `3px solid ${pb.dot}`,
        background: lead.highPriority
          ? 'linear-gradient(to right, rgba(220,38,38,0.04), var(--color-bg-elevated))'
          : 'var(--color-bg-elevated)',
        boxShadow: isSortableDragging
          ? '0 12px 32px rgba(0,0,0,0.15)'
          : '0 1px 4px rgba(0,0,0,0.06)',
        borderRadius: '12px',
        padding: '12px',
        marginBottom: '8px',
        border: `1px solid var(--color-border)`,
        borderLeft: lead.highPriority ? '3px solid #DC2626' : `3px solid ${pb.dot}`,
        transition: 'box-shadow 0.15s, opacity 0.15s',
        userSelect: 'none',
      }}
      onClick={(e) => {
        // Only open drawer on click — not after drag
        if (!isDragging) onClick(lead);
      }}
    >
      {/* Smart Priority + Priority badge row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px', gap: '4px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {lead.highPriority && (
            <div style={{ marginBottom: '4px' }}>
              <SmartPriorityBadge lead={lead} />
            </div>
          )}
          <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {lead.customerName}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '1px' }}>📍 {lead.destination}</div>
        </div>
        <span style={{
          fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '99px',
          flexShrink: 0, background: pb.bg, color: pb.color, border: `1px solid ${pb.border}`,
          whiteSpace: 'nowrap',
        }}>
          {(lead.priority || 'medium').toUpperCase()}
        </span>
      </div>

      {/* Smart score chip (if notable) */}
      {lead.smartScore != null && lead.smartScore >= 30 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '3px',
            background: 'var(--color-bg-secondary)', borderRadius: '6px',
            padding: '2px 7px', fontSize: '10px', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)',
          }}>
            ⚡ Score: <strong style={{ color: lead.smartScore >= 60 ? '#DC2626' : '#D97706' }}>{Math.round(lead.smartScore)}</strong>
          </div>
        </div>
      )}

      {/* Details grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px', fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '8px' }}>
        <span>🗓 {lead.travelDate ? new Date(lead.travelDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}</span>
        <span>👥 {lead.totalPax || (lead.adults || 0) + (lead.children || 0)} pax</span>
        <span>{SOURCE_ICON[lead.source] || '📧'} {lead.source || '—'}</span>
        <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>₹{lead.budget ? (lead.budget / 1000).toFixed(0) + 'K' : '—'}</span>
      </div>

      {/* Assigned employee */}
      {lead.assignedEmployee && (
        <div style={{ fontSize: '10px', marginBottom: '6px', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#E0E7FF', display: 'grid', placeItems: 'center', fontSize: '8px', fontWeight: 700, color: '#4F46E5' }}>
            {lead.assignedEmployee.name?.[0]?.toUpperCase()}
          </div>
          {lead.assignedEmployee.name}
        </div>
      )}

      {/* Follow-up */}
      {lead.followUpDate && (
        <div style={{ fontSize: '10px', background: isOverdue ? '#FEF2F2' : 'var(--color-bg-secondary)', padding: '4px 8px', borderRadius: '6px', marginBottom: '8px', color: isOverdue ? '#DC2626' : 'var(--color-text-muted)', border: isOverdue ? '1px solid #FCA5A5' : 'none' }}>
          {isOverdue ? '⚠️ Overdue: ' : '⏰ '}
          <strong style={{ color: isOverdue ? '#DC2626' : 'var(--color-text-primary)' }}>
            {new Date(lead.followUpDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
          </strong>
        </div>
      )}

      {/* Quick actions */}
      <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }} onPointerDown={e => e.stopPropagation()}>
        <a href={`https://wa.me/91${lead.mobileNumber}`} target="_blank" rel="noreferrer"
          onClick={e => e.stopPropagation()}>
          <button className="btn btn-ghost btn-xs" style={{ color: '#25D366' }} title="WhatsApp">💬</button>
        </a>
        <a href={`tel:${lead.mobileNumber}`} onClick={e => e.stopPropagation()}>
          <button className="btn btn-ghost btn-xs" title="Call">📞</button>
        </a>
      </div>
    </div>
  );
}

/* ─── Droppable Kanban Column ────────────────────────────────────────────── */
function KanbanColumn({ stage, leads, onCardClick, activeId }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const meta = STAGE_META[stage];
  const stageValue = leads.reduce((s, l) => s + (l.budget || 0), 0);
  const highPriorityCount = leads.filter(l => l.highPriority).length;

  return (
    <div style={{
      minWidth: '260px', width: '260px', flexShrink: 0,
      display: 'flex', flexDirection: 'column', height: '100%',
    }}>
      {/* Column Header */}
      <div style={{
        padding: '10px 12px',
        borderRadius: '12px 12px 0 0',
        background: isOver ? meta.color + '18' : meta.bg,
        borderBottom: `2px solid ${meta.color}`,
        transition: 'background 0.2s',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '14px' }}>{meta.icon}</span>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-primary)' }}>{meta.label}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {highPriorityCount > 0 && (
              <span style={{ fontSize: '9px', fontWeight: 800, padding: '1px 5px', borderRadius: '99px', background: '#DC2626', color: '#fff' }}>
                🔥 {highPriorityCount}
              </span>
            )}
            <span style={{
              minWidth: '22px', height: '22px', borderRadius: '99px',
              background: meta.color, color: '#fff',
              display: 'grid', placeItems: 'center', fontSize: '11px', fontWeight: 800,
            }}>{leads.length}</span>
          </div>
        </div>
        {stageValue > 0 && (
          <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>
            ₹{(stageValue / 1000).toFixed(0)}K pipeline
          </div>
        )}
      </div>

      {/* Cards drop zone */}
      <div
        ref={setNodeRef}
        style={{
          flex: 1, overflowY: 'auto', padding: '8px',
          background: isOver ? meta.color + '06' : 'var(--color-bg-secondary)',
          borderRadius: '0 0 12px 12px',
          border: `1px solid ${isOver ? meta.color : 'var(--color-border)'}`,
          borderTop: 'none',
          minHeight: '120px',
          transition: 'background 0.2s, border 0.2s',
        }}
      >
        <SortableContext items={leads.map(l => l._id)} strategy={verticalListSortingStrategy}>
          {leads.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '24px 8px', fontSize: '11px',
              color: isOver ? meta.color : 'var(--color-text-muted)',
              border: `1.5px dashed ${isOver ? meta.color : 'var(--color-border)'}`,
              borderRadius: '8px', transition: 'all 0.2s',
              fontWeight: isOver ? 600 : 400,
            }}>
              {isOver ? `Drop here → ${meta.label}` : 'No leads'}
            </div>
          ) : (
            leads.map(lead => (
              <LeadCard
                key={lead._id}
                lead={lead}
                onClick={onCardClick}
                isDragging={activeId === lead._id}
              />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
}

/* ─── Lead Detail Drawer ─────────────────────────────────────────────────── */
function LeadDetailDrawer({ lead, onClose, onUpdate, employees, isAdmin }) {
  const [tab, setTab]             = useState('details');
  const [editMode, setEditMode]   = useState(false);
  const [form, setForm]           = useState({ ...lead, adults: lead.adults || 1, children: lead.children || 0 });
  const [followUpForm, setFollowUpForm] = useState({ note: '', followUpDate: '' });
  const [activityForm, setActivityForm] = useState({ action: 'call_made', description: '' });
  const [assignId, setAssignId]   = useState(lead.assignedEmployee?._id || '');
  const [saving, setSaving]       = useState(false);

  const save = async () => {
    setSaving(true);
    try { await api.put(`/leads/${lead._id}`, form); onUpdate(); }
    catch (err) { console.error(err); }
    finally { setSaving(false); setEditMode(false); }
  };

  const addFollowUp = async () => {
    if (!followUpForm.note) return;
    try { await api.post(`/leads/${lead._id}/followup`, followUpForm); setFollowUpForm({ note: '', followUpDate: '' }); onUpdate(); }
    catch (err) { console.error(err); }
  };

  const addActivity = async () => {
    if (!activityForm.description) return;
    try { await api.post(`/leads/${lead._id}/activity`, activityForm); setActivityForm({ action: 'call_made', description: '' }); onUpdate(); }
    catch (err) { console.error(err); }
  };

  const assignLead = async () => {
    if (!assignId) return;
    try { await api.post(`/leads/${lead._id}/assign`, { employeeId: assignId }); onUpdate(); }
    catch (err) { console.error(err); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex' }} onClick={onClose}>
      <div style={{ flex: 1, background: 'rgba(0,0,0,0.45)' }} />
      <div style={{ width: '480px', background: 'var(--color-bg-elevated)', height: '100%', overflow: 'auto', boxShadow: '-8px 0 32px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '20px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <div style={{ fontWeight: 800, fontSize: '17px' }}>{lead.customerName}</div>
              {lead.highPriority && <SmartPriorityBadge lead={lead} />}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
              📍 {lead.destination} · {lead.mobileNumber}
            </div>
            {lead.smartScore != null && (
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                ⚡ Smart Score: <strong style={{ color: lead.smartScore >= 60 ? '#DC2626' : '#D97706' }}>{Math.round(lead.smartScore)}</strong>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            {!editMode && <button className="btn btn-secondary btn-sm" onClick={() => setEditMode(true)}>✏️ Edit</button>}
            {editMode && <button className="btn btn-success btn-sm" onClick={save} disabled={saving}>{saving ? '…' : '💾 Save'}</button>}
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--color-text-muted)', lineHeight: 1 }}>×</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
          {[{ k: 'details', l: '📋 Details' }, { k: 'timeline', l: '📜 Timeline' }, { k: 'followup', l: '⏰ Follow-up' }].map(t => (
            <button key={t.k} onClick={() => setTab(t.k)}
              style={{ flex: 1, padding: '10px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: tab === t.k ? 700 : 400, color: tab === t.k ? 'var(--color-accent)' : 'var(--color-text-muted)', borderBottom: tab === t.k ? '2px solid var(--color-accent)' : '2px solid transparent' }}>
              {t.l}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
          {/* Details Tab */}
          {tab === 'details' && (
            <div>
              <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <span style={{ padding: '4px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: 600, background: STAGE_META[lead.leadStatus]?.color + '20', color: STAGE_META[lead.leadStatus]?.color, border: `1px solid ${STAGE_META[lead.leadStatus]?.color}40` }}>
                  {STAGE_META[lead.leadStatus]?.label}
                </span>
                {lead.priority && (
                  <span style={{ padding: '4px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: 600, background: PRIORITY_STYLE[lead.priority]?.bg, color: PRIORITY_STYLE[lead.priority]?.color, border: `1px solid ${PRIORITY_STYLE[lead.priority]?.border}` }}>
                    {lead.priority.toUpperCase()} PRIORITY
                  </span>
                )}
              </div>

              {editMode ? (
                <div className="form-grid">
                  <div className="form-group"><label className="form-label">Customer Name *</label><input className="form-input" value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} /></div>
                  <div className="form-group"><label className="form-label">Mobile *</label><input className="form-input" value={form.mobileNumber} onChange={e => setForm(f => ({ ...f, mobileNumber: e.target.value }))} /></div>
                  <div className="form-group"><label className="form-label">Destination *</label><input className="form-input" value={form.destination} onChange={e => setForm(f => ({ ...f, destination: e.target.value }))} /></div>
                  <div className="form-group"><label className="form-label">Travel Date</label><input type="date" className="form-input" value={form.travelDate ? new Date(form.travelDate).toISOString().split('T')[0] : ''} onChange={e => setForm(f => ({ ...f, travelDate: e.target.value }))} /></div>
                  <div className="form-group"><label className="form-label">Adults</label><input type="number" className="form-input" min="0" value={form.adults} onChange={e => setForm(f => ({ ...f, adults: e.target.value }))} /></div>
                  <div className="form-group"><label className="form-label">Children</label><input type="number" className="form-input" min="0" value={form.children} onChange={e => setForm(f => ({ ...f, children: e.target.value }))} /></div>
                  <div className="form-group"><label className="form-label">Budget (₹)</label><input type="number" className="form-input" value={form.budget} onChange={e => setForm(f => ({ ...f, budget: e.target.value }))} /></div>
                  <div className="form-group"><label className="form-label">Priority</label>
                    <select className="form-select" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                      {['low','medium','high','urgent'].map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div className="form-group"><label className="form-label">Source</label>
                    <select className="form-select" value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))}>
                      {Object.keys(SOURCE_ICON).map(s => <option key={s} value={s}>{SOURCE_ICON[s]} {s}</option>)}
                    </select>
                  </div>
                  <div className="form-group"><label className="form-label">Follow-up Date</label><input type="date" className="form-input" value={form.followUpDate ? new Date(form.followUpDate).toISOString().split('T')[0] : ''} onChange={e => setForm(f => ({ ...f, followUpDate: e.target.value }))} /></div>
                  <div className="form-group full"><label className="form-label">Remarks</label><textarea className="form-textarea" rows={2} value={form.remarks || ''} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} /></div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {[
                    ['📱 Mobile', lead.mobileNumber],
                    ['✉️ Email', lead.email || '—'],
                    ['📍 Destination', lead.destination],
                    ['🗓 Travel Date', lead.travelDate ? new Date(lead.travelDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'],
                    ['👥 Pax', `${lead.adults || 0} adults, ${lead.children || 0} children (${lead.totalPax || 0} total)`],
                    ['💰 Budget', lead.budget ? `₹${Number(lead.budget).toLocaleString('en-IN')}` : '—'],
                    ['📢 Source', `${SOURCE_ICON[lead.source] || ''} ${lead.source || '—'}`],
                    ['⏰ Follow-up', lead.followUpDate ? new Date(lead.followUpDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'],
                    ['📝 Remarks', lead.remarks || '—'],
                    ['📅 Created', new Date(lead.createdAt).toLocaleDateString('en-IN')],
                  ].map(([label, val]) => (
                    <div key={label} style={{ display: 'flex', gap: '8px', fontSize: '13px', paddingBottom: '8px', borderBottom: '1px solid var(--color-border)' }}>
                      <span style={{ color: 'var(--color-text-muted)', minWidth: '110px', flexShrink: 0 }}>{label}</span>
                      <span style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{val}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Assignment */}
              {isAdmin && (
                <div style={{ marginTop: '16px', padding: '14px', background: 'var(--color-bg-secondary)', borderRadius: '12px', border: '1px solid var(--color-border)' }}>
                  <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '10px' }}>👤 Assign Lead</div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select className="form-select" style={{ flex: 1 }} value={assignId} onChange={e => setAssignId(e.target.value)}>
                      <option value="">Select employee…</option>
                      {employees.map(e => <option key={e._id} value={e._id}>{e.name}</option>)}
                    </select>
                    <button className="btn btn-primary btn-sm" onClick={assignLead} disabled={!assignId}>Assign</button>
                  </div>
                  {lead.assignedEmployee && (
                    <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                      Currently: <strong style={{ color: 'var(--color-text-primary)' }}>{lead.assignedEmployee.name}</strong>
                    </div>
                  )}
                </div>
              )}

              {/* Log Activity */}
              <div style={{ marginTop: '16px', padding: '14px', background: 'var(--color-bg-secondary)', borderRadius: '12px', border: '1px solid var(--color-border)' }}>
                <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '10px' }}>📝 Log Activity</div>
                <select className="form-select" style={{ marginBottom: '8px' }} value={activityForm.action} onChange={e => setActivityForm(f => ({ ...f, action: e.target.value }))}>
                  {[['call_made','📞 Call Made'],['note_added','✏️ Note Added'],['quote_sent','📄 Quote Sent'],['advance_received','💰 Advance Received'],['booking_confirmed','🎉 Booking Confirmed']].map(([v,l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input className="form-input" placeholder="Description…" style={{ flex: 1 }} value={activityForm.description} onChange={e => setActivityForm(f => ({ ...f, description: e.target.value }))} />
                  <button className="btn btn-primary btn-sm" onClick={addActivity} disabled={!activityForm.description}>Log</button>
                </div>
              </div>
            </div>
          )}

          {/* Timeline Tab */}
          {tab === 'timeline' && (
            <div>
              {(!lead.activityTimeline || lead.activityTimeline.length === 0) ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)', fontSize: '13px' }}>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>📜</div>No activity recorded yet
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                  {lead.activityTimeline.map((act, i) => (
                    <div key={i} style={{ display: 'flex', gap: '12px', paddingBottom: '16px', position: 'relative' }}>
                      {i < lead.activityTimeline.length - 1 && (
                        <div style={{ position: 'absolute', left: '15px', top: '32px', bottom: 0, width: '2px', background: 'var(--color-border)' }} />
                      )}
                      <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--color-bg-secondary)', border: '2px solid var(--color-border)', display: 'grid', placeItems: 'center', fontSize: '14px', flexShrink: 0, zIndex: 1 }}>
                        {ACTIVITY_ICONS[act.action] || '•'}
                      </div>
                      <div style={{ flex: 1, paddingTop: '4px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 600 }}>{act.description || act.action?.replace(/_/g, ' ')}</div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                          by {act.performedByName || 'System'} · {new Date(act.timestamp).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Follow-up Tab */}
          {tab === 'followup' && (
            <div>
              <div style={{ padding: '14px', background: 'var(--color-bg-secondary)', borderRadius: '12px', marginBottom: '16px', border: '1px solid var(--color-border)' }}>
                <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '10px' }}>+ Add Follow-up</div>
                <textarea className="form-textarea" placeholder="Notes…" rows={2} value={followUpForm.note} onChange={e => setFollowUpForm(f => ({ ...f, note: e.target.value }))} style={{ marginBottom: '8px' }} />
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input type="datetime-local" className="form-input" style={{ flex: 1 }} value={followUpForm.followUpDate} onChange={e => setFollowUpForm(f => ({ ...f, followUpDate: e.target.value }))} />
                  <button className="btn btn-primary btn-sm" onClick={addFollowUp} disabled={!followUpForm.note}>Save</button>
                </div>
              </div>
              {lead.followUps?.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {lead.followUps.slice().reverse().map((fu, i) => {
                    const isOD = fu.followUpDate && new Date(fu.followUpDate) < new Date() && fu.status !== 'done';
                    return (
                      <div key={i} style={{ padding: '12px', background: isOD ? '#FEF2F2' : 'var(--color-bg-secondary)', borderRadius: '10px', border: `1px solid ${isOD ? '#FCA5A5' : 'var(--color-border)'}` }}>
                        <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>{fu.note}</div>
                        <div style={{ fontSize: '11px', color: isOD ? '#DC2626' : 'var(--color-text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                          <span>{fu.byName} · {new Date(fu.createdAt).toLocaleDateString('en-IN')}</span>
                          {fu.followUpDate && <span style={{ fontWeight: 600 }}>{isOD ? '⚠️ OVERDUE: ' : '📅 '}{new Date(fu.followUpDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--color-text-muted)', fontSize: '13px' }}>No follow-ups yet</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Main LeadPipeline Component ─────────────────────────────────────────── */
export default function LeadPipeline() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  const [kanban, setKanban]             = useState({});
  const [loading, setLoading]           = useState(true);
  const [analytics, setAnalytics]       = useState(null);
  const [employees, setEmployees]       = useState([]);
  const [search, setSearch]             = useState('');
  const [filterPriority, setFilterPriority] = useState('all');
  const [showAdd, setShowAdd]           = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [activeId, setActiveId]         = useState(null);   // card being dragged
  const [activeLead, setActiveLead]     = useState(null);   // full lead data for overlay
  const [lostModal, setLostModal]       = useState(null);
  const [lostReason, setLostReason]     = useState('');
  const [addForm, setAddForm]           = useState({ customerName: '', mobileNumber: '', destination: '', travelDate: '', adults: 1, children: 0, budget: '', source: 'phone', priority: 'medium', remarks: '', followUpDate: '', assignedEmployee: '' });
  const [addLoading, setAddLoading]     = useState(false);
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [smartCount, setSmartCount]     = useState(0);       // # of highPriority leads

  // Displayed stages (5 main + toggleable others)
  const [showAllStages, setShowAllStages] = useState(false);
  const visibleStages = showAllStages ? ALL_STAGES : STAGES;

  // ── dnd-kit sensors ──
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const loadKanban = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/leads/kanban');
      setKanban(data.data || {});
      // Count all highPriority leads across all columns
      const allLeads = Object.values(data.data || {}).flat();
      setSmartCount(allLeads.filter(l => l.highPriority).length);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  const loadAnalytics = useCallback(async () => {
    if (!isAdmin) return;
    try { const { data } = await api.get('/leads/analytics'); setAnalytics(data.data); }
    catch (err) { console.error(err); }
  }, [isAdmin]);

  const loadEmployees = useCallback(async () => {
    if (!isAdmin) return;
    try { const { data } = await api.get('/auth/users'); setEmployees(data.data || []); }
    catch (err) { console.error(err); }
  }, [isAdmin]);

  useEffect(() => {
    loadKanban();
    loadAnalytics();
    loadEmployees();
  }, [loadKanban, loadAnalytics, loadEmployees]);

  /* ── Find which stage a lead is in ── */
  const findStageOfLead = (id) => {
    for (const [stage, leads] of Object.entries(kanban)) {
      if (leads.some(l => l._id === id)) return stage;
    }
    return null;
  };

  /* ── dnd-kit event handlers ── */
  const handleDragStart = ({ active }) => {
    setActiveId(active.id);
    // Find the full lead object for the overlay
    const lead = Object.values(kanban).flat().find(l => l._id === active.id);
    setActiveLead(lead || null);
  };

  const handleDragOver = ({ active, over }) => {
    if (!over) return;
    const sourceStage = findStageOfLead(active.id);
    // Determine target stage — could be a column (droppable) or a card within a column
    const targetStage = kanban[over.id] !== undefined ? over.id : findStageOfLead(over.id);
    if (!targetStage || sourceStage === targetStage) return;

    // Optimistic move while dragging
    setKanban(prev => {
      const next = { ...prev };
      const lead = (next[sourceStage] || []).find(l => l._id === active.id);
      if (!lead) return prev;
      next[sourceStage] = next[sourceStage].filter(l => l._id !== active.id);
      next[targetStage] = [{ ...lead, leadStatus: targetStage }, ...(next[targetStage] || [])];
      return next;
    });
  };

  const handleDragEnd = async ({ active, over }) => {
    setActiveId(null);
    setActiveLead(null);
    if (!over) return;

    const targetStage = kanban[over.id] !== undefined ? over.id : findStageOfLead(over.id);
    const sourceStage = findStageOfLead(active.id);

    if (!targetStage || sourceStage === targetStage) return;

    // Special case: moving to "lost"
    if (targetStage === 'lost') {
      setLostModal({ leadId: active.id, targetStage });
      loadKanban(); // Revert optimistic update until reason provided
      return;
    }

    // Commit to backend (UI already updated optimistically in handleDragOver)
    try {
      await api.patch(`/leads/${active.id}/stage`, { leadStatus: targetStage });
      // Re-fetch to get fresh smartScore/highPriority values
      loadKanban();
    } catch (err) {
      console.error('Stage update failed:', err);
      loadKanban(); // Revert on error
    }
  };

  const handleDragCancel = () => {
    setActiveId(null);
    setActiveLead(null);
    loadKanban();
  };

  const confirmLostMove = async () => {
    if (!lostModal) return;
    try {
      await api.patch(`/leads/${lostModal.leadId}/stage`, { leadStatus: 'lost', lostReason });
      setLostModal(null); setLostReason('');
      loadKanban();
    } catch (err) { console.error(err); }
  };

  /* ── Create Lead ── */
  const handleCreate = async () => {
    if (!addForm.customerName || !addForm.mobileNumber || !addForm.destination) return;
    setAddLoading(true);
    try {
      await api.post('/leads', { ...addForm, totalPax: parseInt(addForm.adults || 1) + parseInt(addForm.children || 0) });
      setShowAdd(false);
      setAddForm({ customerName: '', mobileNumber: '', destination: '', travelDate: '', adults: 1, children: 0, budget: '', source: 'phone', priority: 'medium', remarks: '', followUpDate: '', assignedEmployee: '' });
      loadKanban(); loadAnalytics();
    } catch (err) { console.error(err); }
    finally { setAddLoading(false); }
  };

  /* ── Auto Assign ── */
  const handleAutoAssign = async () => {
    setAutoAssigning(true);
    try { const { data } = await api.post('/leads/auto-assign'); alert(`✅ ${data.message}`); loadKanban(); }
    catch (err) { alert(err.response?.data?.message || 'Auto-assign failed'); }
    finally { setAutoAssigning(false); }
  };

  /* ── Filter ── */
  const filterLeads = (leads) => {
    if (!leads) return [];
    return leads.filter(l => {
      const matchSearch = !search || l.customerName?.toLowerCase().includes(search.toLowerCase()) || l.destination?.toLowerCase().includes(search.toLowerCase()) || l.mobileNumber?.includes(search);
      const matchPriority = filterPriority === 'all' || l.priority === filterPriority;
      return matchSearch && matchPriority;
    });
  };

  const totalLeads    = Object.values(kanban).flat().length;
  const totalPipeline = Object.values(kanban).flat().reduce((s, l) => s + (l.budget || 0), 0);

  return (
    <div className="page-content" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - var(--header-height, 60px) - 32px)' }}>
      {/* Keyframe */}
      <style>{`
        @keyframes pulse-red {
          0%, 100% { box-shadow: 0 2px 8px rgba(220,38,38,0.35); }
          50%       { box-shadow: 0 2px 16px rgba(220,38,38,0.65); }
        }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '12px', flexShrink: 0 }}>
        <div>
          <h1 className="page-title">Lead Pipeline</h1>
          <p className="page-sub" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {totalLeads} leads · ₹{(totalPipeline / 100000).toFixed(1)}L pipeline
            {analytics && <span>· Conversion: <strong style={{ color: 'var(--color-success)' }}>{analytics.conversionRate}%</strong></span>}
            {smartCount > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#FEF2F2', color: '#DC2626', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '99px', border: '1px solid #FEE2E2' }}>
                🔥 {smartCount} Hot Lead{smartCount > 1 ? 's' : ''} — Smart Sorted to Top
              </span>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="search-wrap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
            <input className="search-input" placeholder="Search leads…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="form-select" style={{ width: 'auto', padding: '7px 12px', fontSize: '13px' }} value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
            <option value="all">All Priority</option>
            <option value="urgent">🚨 Urgent</option>
            <option value="high">🔴 High</option>
            <option value="medium">🟡 Medium</option>
            <option value="low">⚪ Low</option>
          </select>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowAllStages(v => !v)}>
            {showAllStages ? '⬅ Less' : 'More ➡'}
          </button>
          {isAdmin && (
            <button className="btn btn-secondary btn-sm" onClick={handleAutoAssign} disabled={autoAssigning}>
              {autoAssigning ? '⟳ Assigning…' : '🔄 Auto Assign'}
            </button>
          )}
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ New Lead</button>
        </div>
      </div>

      {/* Analytics (Admin) */}
      {isAdmin && analytics && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px', marginBottom: '12px', flexShrink: 0 }}>
          {[
            { label: 'Total', value: analytics.total, color: '#64748B' },
            { label: 'Assigned', value: analytics.assigned, color: '#2563EB' },
            { label: 'Unassigned', value: analytics.unassigned, color: '#D97706' },
            { label: 'Converted', value: analytics.converted, color: '#059669' },
            { label: 'Lost', value: analytics.lost, color: '#DC2626' },
            { label: 'Conv. Rate', value: `${analytics.conversionRate}%`, color: '#7C3AED' },
          ].map(s => (
            <div key={s.label} className="card card-sm" style={{ textAlign: 'center', padding: '10px' }}>
              <div style={{ fontSize: '20px', fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', fontWeight: 600, marginTop: '1px' }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Smart Sort Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '10px', padding: '6px 12px', background: 'var(--color-bg-secondary)', borderRadius: '8px', fontSize: '11px', color: 'var(--color-text-muted)', flexShrink: 0, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>⚡ Smart Sort:</span>
        <span>🔥 <strong style={{ color: '#DC2626' }}>Hot</strong> = 6+ pax traveling within 10 days</span>
        <span>↑ High priority weight · ↑ Near travel date · ↑ Large group</span>
        <span style={{ marginLeft: 'auto', color: 'var(--color-accent)', fontWeight: 600' }}>Drag cards to update stage →</span>
      </div>

      {/* Kanban Board */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--color-text-muted)', flex: 1 }}>
          <div style={{ fontSize: '32px', marginBottom: '8px', display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</div>
          <div>Loading pipeline…</div>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', flex: 1, paddingBottom: '12px', alignItems: 'flex-start' }}>
            {visibleStages.map(stage => (
              <KanbanColumn
                key={stage}
                stage={stage}
                leads={filterLeads(kanban[stage] || [])}
                onCardClick={async (lead) => {
                  try { const { data } = await api.get(`/leads/${lead._id}`); setSelectedLead(data.data); }
                  catch { setSelectedLead(lead); }
                }}
                activeId={activeId}
              />
            ))}
          </div>

          {/* Drag Overlay — ghost card that follows cursor */}
          <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
            {activeLead ? (
              <div style={{
                padding: '12px', borderRadius: '12px', background: 'var(--color-bg-elevated)',
                boxShadow: '0 20px 60px rgba(0,0,0,0.25)', border: '1.5px solid var(--color-accent)',
                width: '240px', opacity: 0.95, cursor: 'grabbing',
                borderLeft: activeLead.highPriority ? '4px solid #DC2626' : '4px solid var(--color-accent)',
              }}>
                {activeLead.highPriority && <div style={{ marginBottom: '6px' }}><SmartPriorityBadge lead={activeLead} /></div>}
                <div style={{ fontWeight: 700, fontSize: '13px' }}>{activeLead.customerName}</div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>📍 {activeLead.destination}</div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>👥 {activeLead.totalPax} pax · ₹{activeLead.budget ? (activeLead.budget / 1000).toFixed(0) + 'K' : '—'}</div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Lead Detail Drawer */}
      {selectedLead && (
        <LeadDetailDrawer
          lead={selectedLead}
          employees={employees}
          isAdmin={isAdmin}
          onClose={() => setSelectedLead(null)}
          onUpdate={async () => {
            await loadKanban(); await loadAnalytics();
            try { const { data } = await api.get(`/leads/${selectedLead._id}`); setSelectedLead(data.data); } catch {}
          }}
        />
      )}

      {/* Add Lead Modal */}
      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <div className="modal-title">+ New Lead</div>
              <button className="modal-close" onClick={() => setShowAdd(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group"><label className="form-label">Customer Name *</label><input className="form-input" placeholder="Rajesh Kumar" value={addForm.customerName} onChange={e => setAddForm(f => ({ ...f, customerName: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Mobile Number *</label><input className="form-input" placeholder="9876543210" value={addForm.mobileNumber} onChange={e => setAddForm(f => ({ ...f, mobileNumber: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Destination *</label><input className="form-input" placeholder="Manali, HP" value={addForm.destination} onChange={e => setAddForm(f => ({ ...f, destination: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Travel Date</label><input type="date" className="form-input" value={addForm.travelDate} onChange={e => setAddForm(f => ({ ...f, travelDate: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Adults</label><input type="number" className="form-input" min="0" value={addForm.adults} onChange={e => setAddForm(f => ({ ...f, adults: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Children</label><input type="number" className="form-input" min="0" value={addForm.children} onChange={e => setAddForm(f => ({ ...f, children: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Budget (₹)</label><input type="number" className="form-input" placeholder="50000" value={addForm.budget} onChange={e => setAddForm(f => ({ ...f, budget: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Source</label>
                  <select className="form-select" value={addForm.source} onChange={e => setAddForm(f => ({ ...f, source: e.target.value }))}>
                    {Object.keys(SOURCE_ICON).map(s => <option key={s} value={s}>{SOURCE_ICON[s]} {s}</option>)}
                  </select>
                </div>
                <div className="form-group"><label className="form-label">Priority</label>
                  <select className="form-select" value={addForm.priority} onChange={e => setAddForm(f => ({ ...f, priority: e.target.value }))}>
                    <option value="low">Low</option><option value="medium">Medium</option>
                    <option value="high">High</option><option value="urgent">Urgent</option>
                  </select>
                </div>
                {isAdmin && (
                  <div className="form-group"><label className="form-label">Assign To</label>
                    <select className="form-select" value={addForm.assignedEmployee} onChange={e => setAddForm(f => ({ ...f, assignedEmployee: e.target.value }))}>
                      <option value="">Unassigned</option>
                      {employees.map(e => <option key={e._id} value={e._id}>{e.name}</option>)}
                    </select>
                  </div>
                )}
                <div className="form-group"><label className="form-label">Follow-up Date</label><input type="date" className="form-input" value={addForm.followUpDate} onChange={e => setAddForm(f => ({ ...f, followUpDate: e.target.value }))} /></div>
                <div className="form-group full"><label className="form-label">Remarks</label><textarea className="form-textarea" placeholder="Any special requirements…" value={addForm.remarks} onChange={e => setAddForm(f => ({ ...f, remarks: e.target.value }))} /></div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={addLoading || !addForm.customerName || !addForm.mobileNumber || !addForm.destination}>
                {addLoading ? '⟳ Saving…' : '💾 Create Lead'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lost Reason Modal */}
      {lostModal && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: '400px' }}>
            <div className="modal-header"><div className="modal-title">❌ Mark as Lost</div></div>
            <div className="modal-body">
              <label className="form-label">Reason for losing this lead *</label>
              <textarea className="form-textarea" placeholder="Budget issue, competitor won, no response…" rows={3} value={lostReason} onChange={e => setLostReason(e.target.value)} />
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => { setLostModal(null); setLostReason(''); loadKanban(); }}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmLostMove} disabled={!lostReason}>Mark Lost</button>
            </div>
          </div>
        </div>
      )}

      {/* FAB */}
      <button onClick={() => setShowAdd(true)}
        style={{ position: 'fixed', bottom: '28px', right: '28px', width: '52px', height: '52px', borderRadius: '50%', border: 'none', background: 'linear-gradient(135deg,#2563EB,#1D4ED8)', color: '#fff', fontSize: '24px', cursor: 'pointer', boxShadow: '0 8px 24px rgba(37,99,235,0.4)', display: 'grid', placeItems: 'center', zIndex: 100 }}
        title="Add New Lead">+
      </button>
    </div>
  );
}
