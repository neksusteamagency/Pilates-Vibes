import { useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, X, Users, Clock, User, Trash2, AlertTriangle, Edit2, Check } from 'lucide-react';
import { format, addDays, startOfWeek } from 'date-fns';
import { useClasses, generateTimeSlots } from '../../hooks/Useclasses';
import { useClients } from '../../hooks/useClients';
import { useBookings } from '../../hooks/useBookings';
import { useTrainers } from '../../hooks/useTrainers';
import { db } from '../../firebase/config';
import { doc, writeBatch } from 'firebase/firestore';
import toast from 'react-hot-toast';

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const ALL_TIME_SLOTS = generateTimeSlots();

function fmt12(time24) {
  if (!time24) return '';
  const [h, m] = time24.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

const inputStyle = { width: '100%', padding: '10px 13px', border: '1.5px solid #E0D5C1', borderRadius: 8, background: '#F5F0E8', fontFamily: "'DM Sans',sans-serif", fontSize: '0.88rem', color: '#2A1A0E', outline: 'none', boxSizing: 'border-box' };
const labelStyle = { display: 'block', fontSize: '0.75rem', fontWeight: 500, color: '#6B5744', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 };
const btnPrimary = { width: '100%', padding: '12px', background: '#3D2314', color: '#F5F0E8', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", fontSize: '0.9rem', fontWeight: 500, transition: 'opacity 0.2s' };
const navBtn     = { width: 32, height: 32, borderRadius: '50%', background: '#FAF7F2', border: '1.5px solid #E0D5C1', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s', color: '#6B5744' };

// ── Class Form (shared by new + edit) ───────────────────────
function ClassForm({ initial, trainers, onSave, onCancel, saving, isEdit }) {
  const [form, setForm] = useState(initial);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Class Name</label>
        <input type="text" value={form.name} onChange={e => set('name', e.target.value)} style={inputStyle} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <div>
          <label style={labelStyle}>Trainer</label>
          <select value={form.trainer} onChange={e => set('trainer', e.target.value)} style={inputStyle}>
            {trainers.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Day</label>
          <select value={form.day} onChange={e => set('day', Number(e.target.value))} style={inputStyle}>
            {DAYS_OF_WEEK.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Time</label>
          <select value={form.time} onChange={e => set('time', e.target.value)} style={inputStyle}>
            {ALL_TIME_SLOTS.map(t => <option key={t} value={t}>{fmt12(t)}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Capacity</label>
          <input type="number" min={1} max={30} value={form.capacity} onChange={e => set('capacity', +e.target.value)} style={inputStyle} />
        </div>
      </div>
      {!isEdit && (
        <>
          {/* BUG FIX: Date picker — lets admin choose any start date, not just current week */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Start Date {form.isRecurring ? '(first class)' : ''}</label>
            <input type="date" value={form.startDate || ''} onChange={e => set('startDate', e.target.value)} style={inputStyle} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.isRecurring}
                onChange={e => set('isRecurring', e.target.checked)}
                style={{ width: 18, height: 18, cursor: 'pointer' }}
              />
              <span style={{ fontSize: '0.85rem', color: '#3D2314' }}>Recurring weekly (creates class for next 8 weeks)</span>
            </label>
          </div>
        </>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        {onCancel && (
          <button onClick={onCancel} style={{ flex: 1, padding: '12px', background: '#F5F0E8', color: '#6B5744', border: '1.5px solid #E0D5C1', borderRadius: 8, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", fontSize: '0.9rem' }}>
            Cancel
          </button>
        )}
        <button style={{ flex: 2, ...btnPrimary, opacity: saving ? 0.6 : 1 }} onClick={() => onSave(form)} disabled={saving}>
          {saving ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save Changes' : 'Create Class')}
        </button>
      </div>
    </div>
  );
}

// ── Class Modal ──────────────────────────────────────────────
function ClassModal({ cls, weekStart, onClose, clients, trainers, classes, addClass, addRecurringClasses, updateClass, removeClass, addBooking, addToWaitlist, approveWaitlist, rejectWaitlist, onClassCancelled }) {
  const [tab, setTab] = useState('details');
  const [selectedClient, setSelectedClient] = useState('');
  const [saving, setSaving] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const { bookings } = useBookings({ classId: cls.id !== 'new' ? cls.id : undefined });
  const isNew = cls.id === 'new';

  const confirmedBookings = bookings.filter(b => b.status === 'confirmed');
  const waitlistBookings  = bookings
    .filter(b => ['waitlist', 'notified'].includes(b.status))
    .sort((a, b) => (a.position || 0) - (b.position || 0));

  const attendeeClients  = confirmedBookings.map(b => {
    const c = clients.find(cl => cl.id === b.clientId);
    return { bookingId: b.id, clientId: b.clientId, name: c?.name || 'Unknown', avatar: c?.avatar || '??' };
  });
  const waitlistClients  = waitlistBookings.map(b => {
    const c = clients.find(cl => cl.id === b.clientId);
    return { bookingId: b.id, classId: b.classId, name: c?.name || 'Unknown', status: b.status, position: b.position };
  });
  const bookedIds        = confirmedBookings.map(b => b.clientId);
  const waitlistIds      = waitlistBookings.map(b => b.clientId);
  const availableClients = clients.filter(c => !bookedIds.includes(c.id) && !waitlistIds.includes(c.id));

  async function handleAddBooking() {
    if (!selectedClient) return;
    setSaving(true);
    try {
      const weekOf     = format(weekStart, 'yyyy-MM-dd');
      const classData  = classes.find(c => c.id === cls.id) || cls;
      const clientData = clients.find(c => c.id === selectedClient);
      if (cls.booked >= cls.capacity) {
        await addToWaitlist(cls.id, selectedClient, weekOf, waitlistBookings.length + 1);
        toast.success('Added to waitlist.');
      } else {
        await addBooking(cls.id, selectedClient, weekOf, classData, clientData);
        toast.success('Booking confirmed!');
      }
      setSelectedClient('');
      onClose();
    } catch { toast.error('Failed to book. Try again.'); }
    finally   { setSaving(false); }
  }

  async function handleSaveEdit(form) {
    if (!form.name.trim()) return toast.error('Class name is required.');
    setSaving(true);
    try {
      await updateClass(cls.id, {
        name:     form.name.trim(),
        trainer:  form.trainer,
        time:     form.time,
        capacity: Number(form.capacity),
        day:      form.day,
      });
      toast.success('Class updated!');
      setEditMode(false);
      onClose();
    } catch { toast.error('Failed to update class.'); }
    finally   { setSaving(false); }
  }

  async function handleCreateClass(form) {
    if (!form.name.trim()) return toast.error('Class name is required.');
    if (!form.trainer)     return toast.error('Please select a trainer.');
    // BUG FIX: Use the admin-selected start date. Fall back to current week's
    // matching day only if no date was chosen (keeps backward compat).
    const baseDate = form.startDate
      ? new Date(form.startDate + 'T12:00:00') // noon avoids DST offset issues
      : addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), form.day);
    setSaving(true);
    try {
      if (form.isRecurring) {
        await addRecurringClasses(
          { name: form.name.trim(), trainer: form.trainer, time: form.time, capacity: Number(form.capacity), day: form.day },
          baseDate, form.day, 8
        );
        toast.success('Recurring class created! (8 weeks)');
      } else {
        await addClass({
          name: form.name.trim(), trainer: form.trainer, time: form.time,
          capacity: Number(form.capacity), day: form.day,
          date: format(baseDate, 'yyyy-MM-dd'),
        });
        toast.success('Class created!');
      }
      onClose();
    } catch { toast.error('Failed to create class.'); }
    finally   { setSaving(false); }
  }

  async function handleDeleteClass() {
    setCancelling(true);
    try {
      await removeClass(cls.id);
      toast.success('Class deleted.');
      if (onClassCancelled) onClassCancelled();
      onClose();
    } catch { toast.error('Failed to delete class.'); }
    finally   { setCancelling(false); setShowDeleteConfirm(false); }
  }

  async function handleCancelClass() {
    setCancelling(true);
    try {
      const batch = writeBatch(db);
      [...confirmedBookings, ...waitlistBookings].forEach(booking => {
        batch.update(doc(db, 'bookings', booking.id), { status: 'cancelled', updatedAt: new Date() });
      });
      batch.update(doc(db, 'classes', cls.id), { status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() });
      await batch.commit();
      toast.success(`Class "${cls.name}" cancelled.`);
      if (onClassCancelled) onClassCancelled();
      onClose();
    } catch { toast.error('Failed to cancel class.'); }
    finally   { setCancelling(false); setShowCancelConfirm(false); }
  }

  async function handleApprove(entry) {
    const classData = classes.find(c => c.id === entry.classId) || cls;
    try {
      await approveWaitlist(entry.bookingId, entry.classId, classData);
      toast.success(`${entry.name} approved and moved to confirmed!`);
    } catch { toast.error('Failed to approve.'); }
  }

  async function handleReject(entry) {
    try {
      await rejectWaitlist(entry.bookingId);
      toast.success(`${entry.name} removed from waitlist.`);
    } catch { toast.error('Failed to reject.'); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(42,26,14,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: '#FAF7F2', borderRadius: 18, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(61,35,20,0.18)', border: '1px solid #E0D5C1' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '22px 24px 16px', borderBottom: '1px solid #E0D5C1', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: "'Cormorant Garant',serif", fontSize: '1.4rem', fontWeight: 500, color: '#3D2314' }}>{isNew ? 'New Class' : cls.name}</div>
            {!isNew && (
              <div style={{ fontSize: '0.8rem', color: '#9C8470', marginTop: 3 }}>
                {format(addDays(weekStart, cls.day), 'EEE, MMM d')} · {fmt12(cls.time)} · {cls.trainer}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {!isNew && !editMode && (
              <button onClick={() => { setEditMode(true); setTab('edit'); }} style={{ background: '#F5F0E8', border: '1.5px solid #E0D5C1', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', color: '#6B5744', fontFamily: "'DM Sans',sans-serif" }}>
                <Edit2 size={13} /> Edit
              </button>
            )}
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#9C8470' }}><X size={18} /></button>
          </div>
        </div>

        {/* Tabs */}
        {!isNew && !editMode && (
          <div style={{ display: 'flex', borderBottom: '1px solid #E0D5C1', padding: '0 24px' }}>
            {['details', 'book', 'waitlist'].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '0.82rem', fontWeight: tab === t ? 500 : 400,
                color: tab === t ? '#3D2314' : '#9C8470',
                borderBottom: tab === t ? '2px solid #3D2314' : '2px solid transparent',
                fontFamily: "'DM Sans',sans-serif", textTransform: 'capitalize',
              }}>
                {t === 'book' ? 'Add Booking' : t === 'waitlist' ? `Waitlist (${waitlistClients.length})` : 'Details'}
              </button>
            ))}
          </div>
        )}

        <div style={{ padding: '20px 24px 24px' }}>
          {/* NEW CLASS */}
          {isNew && (
            <ClassForm
              initial={{ name: '', trainer: trainers[0]?.name || '', time: '08:00', capacity: 8, day: 0, isRecurring: false, startDate: '' }}
              trainers={trainers}
              onSave={handleCreateClass}
              saving={saving}
              isEdit={false}
            />
          )}

          {/* EDIT MODE */}
          {!isNew && editMode && (
            <ClassForm
              initial={{ name: cls.name, trainer: cls.trainer, time: cls.time, capacity: cls.capacity, day: cls.day, isRecurring: false }}
              trainers={trainers}
              onSave={handleSaveEdit}
              onCancel={() => { setEditMode(false); setTab('details'); }}
              saving={saving}
              isEdit={true}
            />
          )}

          {/* DETAILS */}
          {!isNew && !editMode && tab === 'details' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
                {[
                  { icon: Clock, label: 'Time',     val: fmt12(cls.time) },
                  { icon: User,  label: 'Trainer',  val: cls.trainer || 'Not assigned' },
                  { icon: Users, label: 'Capacity', val: `${cls.booked || 0} / ${cls.capacity || 0}` },
                  { icon: Users, label: 'Status',   val: cls.status || 'available' },
                ].map(({ icon: Icon, label, val }) => (
                  <div key={label} style={{ background: '#F5F0E8', borderRadius: 8, padding: '10px 14px', border: '1px solid #E0D5C1' }}>
                    <div style={{ fontSize: '0.7rem', color: '#9C8470', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Icon size={11} /> {label}
                    </div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 500, color: '#2A1A0E' }}>{val}</div>
                  </div>
                ))}
              </div>

              <div style={{ fontFamily: "'Cormorant Garant',serif", fontSize: '1rem', color: '#3D2314', marginBottom: 10 }}>Attendees</div>
              {attendeeClients.length === 0 && <p style={{ fontSize: '0.82rem', color: '#9C8470' }}>No bookings yet.</p>}
              {attendeeClients.map((a, i) => (
                <div key={a.bookingId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < attendeeClients.length - 1 ? '1px solid #E0D5C1' : 'none' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#C4AE8F', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 600, color: '#3D2314' }}>{a.avatar}</div>
                  <span style={{ fontSize: '0.88rem', color: '#2A1A0E', flex: 1 }}>{a.name}</span>
                  <span style={{ fontSize: '0.72rem', color: '#4E6A2E', background: '#EEF3E6', padding: '2px 8px', borderRadius: 20 }}>Confirmed</span>
                </div>
              ))}

              {(cls.booked <= 2 && cls.booked > 0) && (
                <div style={{ marginTop: 16, marginBottom: 12, padding: '10px 14px', background: '#F5F1E0', border: '1px solid #DDD0A0', borderRadius: 8, fontSize: '0.75rem', color: '#7A6020', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertTriangle size={14} /> This class has only {cls.booked} participant(s). Consider cancelling.
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button onClick={() => setShowCancelConfirm(true)} style={{ flex: 1, padding: '10px', background: '#F5F0E8', color: '#8C3A3A', border: '1.5px solid #DDB0B0', borderRadius: 8, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", fontSize: '0.85rem', fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  Cancel Class
                </button>
                <button onClick={() => setShowDeleteConfirm(true)} style={{ flex: 1, padding: '10px', background: '#8C3A3A', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", fontSize: '0.85rem', fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Trash2 size={14} /> Delete Class
                </button>
              </div>
            </div>
          )}

          {/* BOOK */}
          {!isNew && !editMode && tab === 'book' && (
            <div>
              <p style={{ fontSize: '0.82rem', color: '#6B5744', marginBottom: 16 }}>{cls.booked >= cls.capacity ? 'Class is full — client will be added to waitlist.' : 'Select a client and add them directly to this class.'}</p>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Select Client</label>
                <select value={selectedClient} onChange={e => setSelectedClient(e.target.value)} style={inputStyle}>
                  <option value="">Choose a client…</option>
                  {availableClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <button style={{ ...btnPrimary, opacity: selectedClient && !saving ? 1 : 0.5 }} disabled={!selectedClient || saving} onClick={handleAddBooking}>
                {saving ? 'Booking…' : cls.booked >= cls.capacity ? 'Add to Waitlist' : 'Confirm Booking'}
              </button>
            </div>
          )}

          {/* WAITLIST — admin choose approve/reject */}
          {!isNew && !editMode && tab === 'waitlist' && (
            <div>
              {waitlistClients.length === 0 ? (
                <p style={{ fontSize: '0.82rem', color: '#9C8470' }}>No one on the waitlist for this class.</p>
              ) : (
                <>
                  <p style={{ fontSize: '0.82rem', color: '#6B5744', marginBottom: 14 }}>Choose which clients to approve or reject from the waitlist.</p>
                  {waitlistClients.map((w, i) => (
                    <div key={w.bookingId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < waitlistClients.length - 1 ? '1px solid #E0D5C1' : 'none' }}>
                      <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#3D2314', color: '#F5F0E8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 600 }}>{w.position}</div>
                      <span style={{ flex: 1, fontSize: '0.88rem', color: '#2A1A0E' }}>{w.name}</span>
                      <button onClick={() => handleApprove(w)} style={{ padding: '5px 10px', background: '#EEF3E6', color: '#4E6A2E', border: '1.5px solid #C8D9B0', borderRadius: 7, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", fontSize: '0.78rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Check size={12} /> Approve
                      </button>
                      <button onClick={() => handleReject(w)} style={{ padding: '5px 10px', background: '#F7EDED', color: '#8C3A3A', border: '1.5px solid #DDB0B0', borderRadius: 7, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", fontSize: '0.78rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <X size={12} /> Reject
                      </button>
                    </div>
                  ))}
                </>
              )}
              {/* Add to waitlist */}
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1.5px solid #E0D5C1' }}>
                <label style={labelStyle}>Add client to waitlist</label>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <select value={selectedClient} onChange={e => setSelectedClient(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
                    <option value="">Choose a client…</option>
                    {availableClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button onClick={async () => {
                    if (!selectedClient) return;
                    setSaving(true);
                    try {
                      const weekOf = format(weekStart, 'yyyy-MM-dd');
                      await addToWaitlist(cls.id, selectedClient, weekOf, waitlistBookings.length + 1);
                      toast.success('Added to waitlist.');
                      setSelectedClient('');
                    } catch { toast.error('Failed.'); }
                    finally   { setSaving(false); }
                  }} disabled={!selectedClient || saving} style={{ ...btnPrimary, width: 'auto', padding: '10px 16px', opacity: selectedClient && !saving ? 1 : 0.5 }}>
                    {saving ? '…' : 'Add'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Cancel Confirmation */}
      {showCancelConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(42,26,14,0.7)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#FAF7F2', borderRadius: 18, maxWidth: 380, width: '100%', padding: 24, border: '1px solid #E0D5C1' }}>
            <div style={{ fontFamily: "'Cormorant Garant',serif", fontSize: '1.3rem', fontWeight: 500, color: '#3D2314', marginBottom: 12 }}>Cancel Class?</div>
            <div style={{ fontSize: '0.88rem', color: '#6B5744', marginBottom: 20 }}>
              This will cancel {confirmedBookings.length} booking(s) and remove {waitlistBookings.length} waitlist entries. No sessions will be deducted.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowCancelConfirm(false)} style={{ flex: 1, padding: '10px', background: '#F5F0E8', border: '1.5px solid #E0D5C1', borderRadius: 8, cursor: 'pointer' }}>Go Back</button>
              <button onClick={handleCancelClass} disabled={cancelling} style={{ flex: 1, padding: '10px', background: '#8C3A3A', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 500, opacity: cancelling ? 0.6 : 1 }}>{cancelling ? 'Cancelling…' : 'Yes, Cancel'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(42,26,14,0.7)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#FAF7F2', borderRadius: 18, maxWidth: 380, width: '100%', padding: 24, border: '1px solid #E0D5C1' }}>
            <div style={{ fontFamily: "'Cormorant Garant',serif", fontSize: '1.3rem', fontWeight: 500, color: '#3D2314', marginBottom: 12 }}>Delete Class?</div>
            <div style={{ fontSize: '0.88rem', color: '#6B5744', marginBottom: 20 }}>
              This permanently deletes the class. This action cannot be undone.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowDeleteConfirm(false)} style={{ flex: 1, padding: '10px', background: '#F5F0E8', border: '1.5px solid #E0D5C1', borderRadius: 8, cursor: 'pointer' }}>Go Back</button>
              <button onClick={handleDeleteClass} disabled={cancelling} style={{ flex: 1, padding: '10px', background: '#8C3A3A', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 500, opacity: cancelling ? 0.6 : 1 }}>{cancelling ? 'Deleting…' : 'Yes, Delete'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────
export default function AdminSchedule() {
  const [weekOffset,    setWeekOffset]    = useState(0);
  const [trainerFilter, setTrainerFilter] = useState('All');
  const [selectedClass, setSelectedClass] = useState(null);
  const [showNewModal,  setShowNewModal]  = useState(false);
  const [refreshKey,    setRefreshKey]    = useState(0);

  const { classes, loading, addClass, addRecurringClasses, updateClass, removeClass } = useClasses();
  const { clients }   = useClients();
  const { trainers }  = useTrainers();
  const { addBooking, addToWaitlist, approveWaitlist, rejectWaitlist } = useBookings();

  const weekStart    = addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), weekOffset * 7);
  const trainerNames = ['All', ...trainers.map(t => t.name)];
  const filtered     = classes.filter(c => trainerFilter === 'All' || c.trainer === trainerFilter);

  // Get all unique times in the current filtered set + always show a reasonable set
  const timesInUse = [...new Set(filtered.map(c => c.time))].sort();
  // Display time slots: union of classes in use + full slot list limited to 5AM-11PM
  const displaySlots = ALL_TIME_SLOTS;

  function getClass(day, time) {
    // BUG FIX: Also match by the actual date for this week's column so that recurring
    // classes on the same day-of-week in different weeks don't ALL appear in the same cell.
    const dateForCell = format(addDays(weekStart, day), 'yyyy-MM-dd');
    return filtered.find(c =>
      c.day === day &&
      c.time === time &&
      c.status !== 'cancelled' &&
      c.date === dateForCell
    ) || null;
  }

  // Only show rows that have at least one class OR are in a reasonable AM/PM range
  const activeSlots = displaySlots.filter(time => {
    return DAYS_OF_WEEK.some((_, di) => getClass(di, time));
  });
  // Show all slots from 6AM to 10PM for browsing, plus any classes outside that
  const browseSlots = displaySlots.filter(t => {
    const h = parseInt(t.split(':')[0]);
    return h >= 9 && h <= 21;
  });
  // Final: union of browseSlots + activeSlots
  const finalSlots = [...new Set([...browseSlots, ...timesInUse])].sort();

  const handleClassCancelled = () => setRefreshKey(prev => prev + 1);

  return (
    <div key={refreshKey} style={{ padding: '28px 32px 40px' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setWeekOffset(w => w - 1)} style={navBtn}><ChevronLeft size={16} /></button>
          <span style={{ fontFamily: "'Cormorant Garant',serif", fontSize: '1.1rem', color: '#3D2314', minWidth: 180, textAlign: 'center' }}>
            {format(weekStart, 'MMM d')} – {format(addDays(weekStart, 6), 'MMM d, yyyy')}
          </span>
          <button onClick={() => setWeekOffset(w => w + 1)} style={navBtn}><ChevronRight size={16} /></button>
          <button onClick={() => setWeekOffset(0)} style={{ ...navBtn, fontSize: '0.78rem', padding: '6px 12px', width: 'auto', borderRadius: 8 }}>Today</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <select value={trainerFilter} onChange={e => setTrainerFilter(e.target.value)} style={{ padding: '8px 12px', border: '1.5px solid #E0D5C1', borderRadius: 8, background: '#FAF7F2', fontFamily: "'DM Sans',sans-serif", fontSize: '0.84rem', cursor: 'pointer' }}>
            {trainerNames.map(t => <option key={t}>{t}</option>)}
          </select>
          <button onClick={() => setShowNewModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#3D2314', color: '#F5F0E8', border: 'none', borderRadius: 8, fontFamily: "'DM Sans',sans-serif", fontSize: '0.84rem', fontWeight: 500, cursor: 'pointer' }}>
            <Plus size={15} /> Add Class
          </button>
        </div>
      </div>

      {/* Schedule Grid */}
      <div style={{ background: '#FAF7F2', borderRadius: 14, border: '1px solid #E0D5C1', boxShadow: '0 2px 16px rgba(61,35,20,0.10)', overflowX: 'auto' }}>
        <div style={{ minWidth: 700 }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '72px repeat(7,1fr)', borderBottom: '1.5px solid #E0D5C1' }}>
            <div style={{ padding: '12px 8px' }} />
            {DAYS_OF_WEEK.map((d, i) => {
              const date    = addDays(weekStart, i);
              const isToday = format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
              return (
                <div key={d} style={{ padding: '10px 6px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9C8470', fontWeight: 500 }}>{d}</div>
                  <div style={{ fontFamily: "'Cormorant Garant',serif", fontSize: '1.2rem', fontWeight: 500, color: isToday ? '#FAF7F2' : '#3D2314', background: isToday ? '#3D2314' : 'transparent', width: 30, height: 30, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
                    {format(date, 'd')}
                  </div>
                </div>
              );
            })}
          </div>

          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#C4AE8F' }}>Loading schedule…</div>
          ) : finalSlots.map((time, ti) => (
            <div key={time} style={{ display: 'grid', gridTemplateColumns: '72px repeat(7,1fr)', borderBottom: ti < finalSlots.length - 1 ? '1px solid #E0D5C1' : 'none' }}>
              <div style={{ padding: '10px 8px', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', paddingTop: 12 }}>
                <span style={{ fontSize: '0.72rem', color: '#9C8470', fontWeight: 500 }}>{fmt12(time)}</span>
              </div>
              {DAYS_OF_WEEK.map((_, di) => {
                const cls = getClass(di, time);
                return (
                  <div key={di} style={{ padding: '5px 4px', minHeight: 58 }}>
                    {cls ? (
                      <div onClick={() => setSelectedClass(cls)} style={{ borderRadius: 8, padding: '7px 9px', cursor: 'pointer', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3, border: `1.5px solid ${cls.status === 'full' ? '#DDB89E' : '#C8D9B0'}`, background: cls.status === 'full' ? '#F5EDE8' : '#EEF3E6' }}>
                        <div style={{ fontSize: '0.76rem', fontWeight: 600, color: '#3D2314' }}>{cls.name}</div>
                        <div style={{ fontSize: '0.66rem', color: '#9C8470' }}>{cls.trainer}</div>
                        <div style={{ fontSize: '0.63rem', fontWeight: 600, textTransform: 'uppercase', color: cls.status === 'full' ? '#8C4A2A' : '#4E6A2E' }}>{cls.status === 'full' ? 'Full' : 'Available'}</div>
                      </div>
                    ) : <div style={{ height: '100%', minHeight: 58 }} />}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Mobile list */}
      <div className="mobile-schedule-list" style={{ display: 'none', marginTop: 16 }}>
        {filtered.filter(c => c.status !== 'cancelled').sort((a, b) => a.day - b.day || a.time.localeCompare(b.time)).map(cls => {
          const date = addDays(weekStart, cls.day);
          return (
            <div key={cls.id} onClick={() => setSelectedClass(cls)} style={{ background: '#FAF7F2', borderRadius: 12, border: '1px solid #E0D5C1', padding: '14px 16px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}>
              <div style={{ textAlign: 'center', minWidth: 42 }}>
                <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: '#9C8470' }}>{format(date, 'EEE')}</div>
                <div style={{ fontFamily: "'Cormorant Garant',serif", fontSize: '1.5rem', fontWeight: 500, color: '#3D2314', lineHeight: 1 }}>{format(date, 'd')}</div>
              </div>
              <div style={{ width: 1.5, height: 36, background: '#E0D5C1' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, fontSize: '0.92rem', color: '#2A1A0E' }}>{cls.name}</div>
                <div style={{ fontSize: '0.78rem', color: '#9C8470', marginTop: 2 }}>{fmt12(cls.time)} · {cls.trainer}</div>
              </div>
              <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 500, background: cls.status === 'full' ? '#F5EDE8' : '#EEF3E6', color: cls.status === 'full' ? '#8C4A2A' : '#4E6A2E' }}>{cls.status === 'full' ? 'Full' : 'Available'}</span>
            </div>
          );
        })}
      </div>

      {/* Modals */}
      {selectedClass && (
        <ClassModal
          cls={selectedClass}
          weekStart={weekStart}
          onClose={() => setSelectedClass(null)}
          clients={clients}
          trainers={trainers}
          classes={classes}
          addClass={addClass}
          addRecurringClasses={addRecurringClasses}
          updateClass={updateClass}
          removeClass={removeClass}
          addBooking={addBooking}
          addToWaitlist={addToWaitlist}
          approveWaitlist={approveWaitlist}
          rejectWaitlist={rejectWaitlist}
          onClassCancelled={handleClassCancelled}
        />
      )}
      {showNewModal && (
        <ClassModal
          cls={{ id: 'new', day: 0, time: '08:00', name: '', trainer: '', capacity: 8, booked: 0, status: 'available', startDate: '' }}
          weekStart={weekStart}
          onClose={() => setShowNewModal(false)}
          clients={clients}
          trainers={trainers}
          classes={classes}
          addClass={addClass}
          addRecurringClasses={addRecurringClasses}
          updateClass={updateClass}
          removeClass={removeClass}
          addBooking={addBooking}
          addToWaitlist={addToWaitlist}
          approveWaitlist={approveWaitlist}
          rejectWaitlist={rejectWaitlist}
        />
      )}

      <style>{`@media (max-width:700px) { .mobile-schedule-list { display:block !important; } }`}</style>
    </div>
  );
}