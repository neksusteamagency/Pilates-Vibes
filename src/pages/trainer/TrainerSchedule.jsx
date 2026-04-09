import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useClasses } from '../../hooks/Useclasses';
import { useBookings } from '../../hooks/useBookings';
import { useClients } from '../../hooks/Useclients';
import { useAttendance } from '../../hooks/useAttendance';
import { ChevronLeft, ChevronRight, Users, Check, X } from 'lucide-react';
import { format, addDays, startOfWeek } from 'date-fns';
import toast from 'react-hot-toast';

export default function TrainerSchedule() {
  const { user } = useAuth();
  const [weekOffset, setWeekOffset]       = useState(0);
  const [selectedClass, setSelectedClass] = useState(null);
  const [saving, setSaving]               = useState(false);

  const weekStart = addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), weekOffset * 7);
  const weekOf    = format(weekStart, 'yyyy-MM-dd');

  // ── Data ────────────────────────────────────────────────
  const { classes, loading: classesLoading } = useClasses();

  // BUG FIX: Build the 7 date strings for the current week, then filter classes
  // to only those belonging to this trainer AND falling within this week.
  // Previously, all recurring instances (e.g. 8 weeks) were shown at once because
  // there was no date check — only a trainer match.
  const weekDates = Array.from({ length: 7 }, (_, i) =>
    format(addDays(weekStart, i), 'yyyy-MM-dd')
  );
  const myClasses = classes.filter(c =>
    (c.trainerId === user?.uid || c.trainer === user?.name) &&
    weekDates.includes(c.date)
  );

  // Fetch all bookings for this week
  const { bookings, loading: bookingsLoading } = useBookings({ weekOf });

  // Fetch all clients (to resolve names from clientIds)
  const { clients } = useClients();

  // Attendance hook — scoped to selected class when open
  const { logAttendance, saveClassAttendance } = useAttendance(
    selectedClass ? { classId: selectedClass.id } : {}
  );

  // Local attendance state while modal is open
  const [localAttendance, setLocalAttendance] = useState({});

  // ── Helpers ──────────────────────────────────────────────
  function getClientName(clientId) {
    const c = clients.find(cl => cl.id === clientId);
    return c?.name || 'Unknown';
  }

  function getBookingsForClass(classId) {
    return bookings.filter(b => b.classId === classId && b.status === 'confirmed');
  }

  function openModal(cls) {
    // Pre-populate local attendance state from Firestore (all pending by default)
    const classBookings = getBookingsForClass(cls.id);
    const init = {};
    classBookings.forEach(b => { init[b.clientId] = 'pending'; });
    setLocalAttendance(init);
    setSelectedClass(cls);
  }

  function toggleLocal(clientId) {
    setLocalAttendance(prev => ({
      ...prev,
      [clientId]: prev[clientId] === 'attended' ? 'no-show' : 'attended',
    }));
  }

  async function saveAttendance() {
    if (!selectedClass) return;
    setSaving(true);
    try {
      await saveClassAttendance(selectedClass.id, weekOf, localAttendance);
      toast.success('Attendance saved!');
      setSelectedClass(null);
    } catch (err) {
      console.error(err);
      toast.error('Failed to save attendance.');
    } finally {
      setSaving(false);
    }
  }

  const loading = classesLoading || bookingsLoading;

  return (
    <div style={{ padding: '28px 32px 40px' }}>

      {/* Week nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button onClick={() => setWeekOffset(w => w - 1)} style={navBtn}><ChevronLeft size={16} /></button>
        <span style={{ fontFamily: "'Cormorant Garant',serif", fontSize: '1.1rem', color: '#3D2314', flex: 1, textAlign: 'center' }}>
          {format(weekStart, 'MMM d')} – {format(addDays(weekStart, 6), 'MMM d, yyyy')}
        </span>
        <button onClick={() => setWeekOffset(w => w + 1)} style={navBtn}><ChevronRight size={16} /></button>
        <button onClick={() => setWeekOffset(0)} style={{ ...navBtn, width: 'auto', padding: '6px 12px', borderRadius: 8, fontSize: '0.78rem' }}>Today</button>
      </div>

      {/* Loading */}
      {loading && (
        <p style={{ color: '#9C8470', fontSize: '0.84rem', padding: '16px 0' }}>Loading your schedule…</p>
      )}

      {/* No classes */}
      {!loading && myClasses.length === 0 && (
        <div style={{ background: '#FAF7F2', borderRadius: 14, border: '1px solid #E0D5C1', padding: '32px', textAlign: 'center', color: '#9C8470', fontSize: '0.88rem' }}>
          No classes assigned to you this week.
        </div>
      )}

      {/* Class cards grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12 }} className="trainer-resp">
        {myClasses.map(cls => {
          const date         = addDays(weekStart, cls.day);
          const clsBookings  = getBookingsForClass(cls.id);
          const bookedCount  = clsBookings.length;
          const isFull       = bookedCount >= cls.capacity;

          return (
            <div key={cls.id} onClick={() => openModal(cls)}
              style={{ background: '#FAF7F2', borderRadius: 12, border: '1px solid #E0D5C1', padding: '16px 18px', cursor: 'pointer', transition: 'all 0.18s', boxShadow: '0 2px 10px rgba(61,35,20,0.07)' }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 18px rgba(61,35,20,0.12)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 2px 10px rgba(61,35,20,0.07)'; e.currentTarget.style.transform = ''; }}>

              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                <div>
                  <div style={{ fontFamily: "'Cormorant Garant',serif", fontSize: '1.2rem', fontWeight: 500, color: '#3D2314' }}>{cls.name}</div>
                  <div style={{ fontSize: '0.78rem', color: '#9C8470', marginTop: 2 }}>
                    {format(date, 'EEE, MMM d')} · {cls.time}
                  </div>
                </div>
                <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 500, background: isFull ? '#F5EDE8' : '#EEF3E6', color: isFull ? '#8C4A2A' : '#4E6A2E', flexShrink: 0 }}>
                  {isFull ? 'Full' : 'Available'}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: '#6B5744' }}>
                <Users size={13} color='#A0673A' />
                <span>
                  <strong style={{ color: '#3D2314', fontFamily: "'Cormorant Garant',serif", fontSize: '1rem' }}>{bookedCount}</strong>
                  {' / '}{cls.capacity} clients
                </span>
              </div>

              {/* Mini avatars — show first names only (no surnames for privacy) */}
              <div style={{ display: 'flex', marginTop: 10 }}>
                {clsBookings.slice(0, 5).map((b, i) => {
                  const name = getClientName(b.clientId);
                  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2);
                  return (
                    <div key={b.id} title={name.split(' ')[0]} style={{ width: 24, height: 24, borderRadius: '50%', background: '#C4AE8F', border: '2px solid #FAF7F2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.58rem', fontWeight: 600, color: '#3D2314', marginLeft: i > 0 ? -6 : 0, zIndex: 5 - i }}>
                      {initials}
                    </div>
                  );
                })}
                {bookedCount > 5 && (
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#E0D5C1', border: '2px solid #FAF7F2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.58rem', color: '#6B5744', marginLeft: -6 }}>
                    +{bookedCount - 5}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Attendance modal */}
      {selectedClass && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(42,26,14,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setSelectedClass(null)}>
          <div style={{ background: '#FAF7F2', borderRadius: 18, width: '100%', maxWidth: 440, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(61,35,20,0.18)', border: '1px solid #E0D5C1' }}
            onClick={e => e.stopPropagation()}>

            {/* Modal header */}
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #E0D5C1', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontFamily: "'Cormorant Garant',serif", fontSize: '1.3rem', fontWeight: 500, color: '#3D2314' }}>{selectedClass.name}</div>
                <div style={{ fontSize: '0.78rem', color: '#9C8470', marginTop: 2 }}>
                  {format(addDays(weekStart, selectedClass.day), 'EEE, MMM d')} · {selectedClass.time}
                </div>
              </div>
              <button onClick={() => setSelectedClass(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9C8470' }}><X size={18} /></button>
            </div>

            <div style={{ padding: '16px 24px 24px' }}>
              <div style={{ fontFamily: "'Cormorant Garant',serif", fontSize: '1rem', color: '#3D2314', marginBottom: 12 }}>
                Mark Attendance — tap to toggle
              </div>

              {/* Attendee rows */}
              {getBookingsForClass(selectedClass.id).map((b, i) => {
                const name   = getClientName(b.clientId);
                const status = localAttendance[b.clientId] || 'pending';
                const all    = getBookingsForClass(selectedClass.id);
                return (
                  <div key={b.id} onClick={() => toggleLocal(b.clientId)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < all.length - 1 ? '1px solid #E0D5C1' : 'none', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#F5F0E8'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#C4AE8F', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 600, color: '#3D2314', flexShrink: 0 }}>
                      {name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    {/* Show first name only to trainer */}
                    <span style={{ flex: 1, fontSize: '0.9rem', fontWeight: 500, color: '#2A1A0E' }}>{name.split(' ')[0]}</span>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: status === 'attended' ? '#EEF3E6' : status === 'no-show' ? '#F7EDED' : '#F5F0E8',
                      border: `1.5px solid ${status === 'attended' ? '#C8D9B0' : status === 'no-show' ? '#DDB0B0' : '#E0D5C1'}`,
                      transition: 'all 0.18s',
                    }}>
                      {status === 'attended' && <Check size={13} color='#4E6A2E' />}
                      {status === 'no-show'  && <X size={13} color='#8C3A3A' />}
                    </div>
                  </div>
                );
              })}

              {getBookingsForClass(selectedClass.id).length === 0 && (
                <p style={{ color: '#9C8470', fontSize: '0.84rem', padding: '8px 0' }}>No confirmed bookings for this class yet.</p>
              )}

              <button onClick={saveAttendance} disabled={saving}
                style={{ width: '100%', padding: '12px', marginTop: 16, background: saving ? '#6B3D25' : '#3D2314', color: '#F5F0E8', border: 'none', borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: "'DM Sans',sans-serif", fontSize: '0.9rem', fontWeight: 500 }}>
                {saving ? 'Saving…' : 'Save Attendance'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@media(max-width:700px){.trainer-resp{grid-template-columns:1fr!important;}}`}</style>
    </div>
  );
}

const navBtn = {
  width: 32, height: 32, borderRadius: '50%', background: '#FAF7F2', border: '1.5px solid #E0D5C1',
  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6B5744',
};