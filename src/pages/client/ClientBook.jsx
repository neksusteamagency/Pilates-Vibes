import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useClasses, resolveClassesForWeek } from '../../hooks/useClasses';
import { useBookings } from '../../hooks/useBookings';
import { useClients } from '../../hooks/useClients';
import { ChevronLeft, ChevronRight, Check, MessageSquare, X, Package } from 'lucide-react';
import { format, addDays, startOfWeek } from 'date-fns';
import toast from 'react-hot-toast';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';

const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const STEPS = ['Choose Class', 'Confirm', 'Done'];

// ── Package options ─────────────────────────────────────────────────────────
// Prices & names must match the admin PACKAGES list (AdminClients.jsx).
// 'First Session — $10' is admin-only and intentionally excluded here.
export const PACKAGES = [
  { id: 'single',    name: 'Single Session',    sessions: 1,    price: 15  },
  { id: 'four',      name: '4-Session Pack',    sessions: 4,    price: 55  },
  { id: 'eight',     name: '8-Session Pack',    sessions: 8,    price: 95  },
  { id: 'twelve',    name: '12-Session Pack',   sessions: 12,   price: 130 },
  { id: 'unlimited', name: 'Monthly Unlimited', sessions: null, price: 160 },
];

function getWeekOf(weekStart) {
  return format(weekStart, 'yyyy-MM-dd');
}

// ── Package validation ──────────────────────────────────────────────────────
function getPackageBlockReason(clientDoc, confirmedBookings) {
  if (!clientDoc) return 'Client profile not found. Please contact the studio.';

  const today = new Date().toISOString().split('T')[0];

  // No package chosen yet
  if (!clientDoc.pkg || clientDoc.sessionsTotal === 0)
    return 'NO_PACKAGE';

  if (clientDoc.expiry && clientDoc.expiry < today)
    return 'Your package has expired. Please contact the studio to renew.';

  if (clientDoc.isFrozen)
    return 'Your package is currently frozen. Please contact the studio to unfreeze it.';

  if ((clientDoc.sessionsRemaining ?? 0) <= 0)
    return 'You have no sessions remaining. Please contact the studio to renew your package.';

  // Payment gate: unpaid clients can only have 1 confirmed booking total
  if (!clientDoc.paymentVerified) {
    const activeBookings = (confirmedBookings || []).filter(b => b.status === 'confirmed');
    if (activeBookings.length >= 1)
      return 'UNPAID_LIMIT';
  }

  return null;
}

// ── Blocked Modal ───────────────────────────────────────────────────────────
function BlockedModal({ message, onClose }) {
  if (!message) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(61,35,20,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px',
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#FAF7F2',
          borderRadius: 16,
          border: '1.5px solid #E0D5C1',
          boxShadow: '0 8px 40px rgba(61,35,20,0.18)',
          padding: '32px 28px 24px',
          maxWidth: 360,
          width: '100%',
          textAlign: 'center',
          position: 'relative',
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 14, right: 14,
            background: 'transparent', border: 'none',
            cursor: 'pointer', color: '#9C8470', padding: 4,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: '50%',
          }}
        >
          <X size={18} />
        </button>
        <div style={{ fontSize: '2.4rem', marginBottom: 12 }}>🚫</div>
        <div style={{
          fontFamily: "'Cormorant Garant', serif",
          fontSize: '1.3rem', fontWeight: 600,
          color: '#3D2314', marginBottom: 10,
        }}>
          Booking Unavailable
        </div>
        <div style={{
          fontSize: '0.88rem', color: '#6B5744',
          lineHeight: 1.6, marginBottom: 24,
        }}>
          {message}
        </div>
        <button
          onClick={onClose}
          style={{
            width: '100%', padding: '12px',
            background: '#3D2314', border: 'none',
            borderRadius: 8, color: '#F5F0E8',
            cursor: 'pointer',
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '0.9rem', fontWeight: 500,
          }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}

// ── Package Picker Modal ────────────────────────────────────────────────────
function PackagePickerModal({ clientId, onClose, onSelected }) {
  const [chosen,   setChosen]   = useState(null);
  const [saving,   setSaving]   = useState(false);

  async function confirmPackage() {
    if (!chosen) return;
    setSaving(true);
    try {
      const pkg = PACKAGES.find(p => p.id === chosen);
      const sessionsTotal     = pkg.sessions; // null = unlimited
      const sessionsRemaining = pkg.sessions; // null = unlimited
      await updateDoc(doc(db, 'clients', clientId), {
        pkg:               pkg.name,
        sessionsTotal,
        sessionsRemaining,
        sessionsUsed:      0,
        cancelledSessions: 0,
        purchaseDate:      new Date().toISOString().split('T')[0],
        paymentVerified:   false,
        paidAmount:        pkg.price,
        discount:          0,
        status:            'active',
        updatedAt:         serverTimestamp(),
      });
      toast.success(`Package "${pkg.name}" selected! The studio will confirm your payment.`);
      onSelected();
    } catch (err) {
      console.error(err);
      toast.error('Failed to select package. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(61,35,20,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#FAF7F2',
          borderRadius: 18,
          border: '1.5px solid #E0D5C1',
          boxShadow: '0 8px 40px rgba(61,35,20,0.20)',
          padding: '28px 24px',
          maxWidth: 400,
          width: '100%',
          position: 'relative',
        }}
      >
        <button
          onClick={onClose}
          style={{ position:'absolute', top:14, right:14, background:'transparent', border:'none', cursor:'pointer', color:'#9C8470' }}
        >
          <X size={18}/>
        </button>

        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
          <Package size={20} color='#A0673A'/>
          <div style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'1.4rem', fontWeight:600, color:'#3D2314' }}>
            Choose Your Package
          </div>
        </div>
        <p style={{ fontSize:'0.82rem', color:'#9C8470', marginBottom:20 }}>
          You can book 1 session right away. Full access unlocks once the studio confirms your payment.
        </p>

        <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:20 }}>
          {PACKAGES.map(pkg => {
            const isChosen = chosen === pkg.id;
            return (
              <div
                key={pkg.id}
                onClick={() => setChosen(pkg.id)}
                style={{
                  display:'flex', alignItems:'center', justifyContent:'space-between',
                  padding:'13px 16px',
                  borderRadius: 10,
                  border: `1.5px solid ${isChosen ? '#3D2314' : '#E0D5C1'}`,
                  background: isChosen ? '#F5EDE8' : '#FFFFFF',
                  cursor: 'pointer',
                  transition: 'all 0.18s',
                }}
              >
                <div>
                  <div style={{ fontWeight:600, fontSize:'0.92rem', color:'#2A1A0E' }}>{pkg.name}</div>
                  <div style={{ fontSize:'0.76rem', color:'#9C8470', marginTop:2 }}>
                    {pkg.sessions !== null ? `${pkg.sessions} session${pkg.sessions > 1 ? 's' : ''}` : 'Unlimited sessions'}
                  </div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'1.1rem', fontWeight:600, color:'#A0673A' }}>${pkg.price}</span>
                  <div style={{
                    width:18, height:18, borderRadius:'50%',
                    border: `2px solid ${isChosen ? '#3D2314' : '#C4AE8F'}`,
                    background: isChosen ? '#3D2314' : 'transparent',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    flexShrink: 0,
                  }}>
                    {isChosen && <Check size={10} color='#F5F0E8'/>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={confirmPackage}
          disabled={!chosen || saving}
          style={{
            width:'100%', padding:'13px',
            background: chosen ? '#3D2314' : '#C4AE8F',
            border:'none', borderRadius:9,
            color:'#F5F0E8', cursor: chosen ? 'pointer' : 'not-allowed',
            fontFamily:"'DM Sans',sans-serif", fontSize:'0.92rem', fontWeight:500,
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Confirm Package'}
        </button>
      </div>
    </div>
  );
}

// ── Schedule Grid ───────────────────────────────────────────────────────────
function ScheduleGrid({ weekClasses, weekStart, weekDates, alreadyBooked, onPickClass }) {
  // Collect unique sorted time slots
  const timeSlots = [...new Set(weekClasses.map(c => c.time))].sort();

  if (!timeSlots.length) {
    return (
      <p style={{ color:'#9C8470', fontSize:'0.84rem', padding:'24px 0', textAlign:'center' }}>
        No classes scheduled this week.
      </p>
    );
  }

  return (
    <div style={{ overflowX:'auto' }}>
      <table style={{ width:'100%', borderCollapse:'separate', borderSpacing:0, minWidth:560 }}>
        <thead>
          <tr>
            {/* Time column header */}
            <th style={{ width:60, padding:'6px 8px', textAlign:'left', fontSize:'0.66rem', textTransform:'uppercase', letterSpacing:'0.09em', color:'#9C8470', fontWeight:500, borderBottom:'1.5px solid #E0D5C1' }}>
              Time
            </th>
            {DAYS.map((day, di) => {
              const date = addDays(weekStart, di);
              const isToday = format(date,'yyyy-MM-dd') === format(new Date(),'yyyy-MM-dd');
              return (
                <th key={di} style={{
                  padding:'6px 4px', textAlign:'center', fontSize:'0.68rem',
                  textTransform:'uppercase', letterSpacing:'0.09em',
                  color: isToday ? '#A0673A' : '#9C8470',
                  fontWeight: isToday ? 700 : 500,
                  borderBottom:'1.5px solid #E0D5C1',
                  whiteSpace:'nowrap',
                }}>
                  <div>{day}</div>
                  <div style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'1rem', color: isToday ? '#3D2314' : '#6B5744', fontWeight: isToday ? 600 : 400 }}>
                    {format(date,'d')}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {timeSlots.map(time => (
            <tr key={time}>
              {/* Time label */}
              <td style={{ padding:'8px 8px', fontSize:'0.72rem', color:'#9C8470', fontWeight:500, verticalAlign:'middle', borderBottom:'1px solid #F0EAE3', whiteSpace:'nowrap' }}>
                {fmt12(time)}
              </td>
              {DAYS.map((_, di) => {
                const cls = weekClasses.find(c => c.day === di && c.time === time);
                if (!cls) {
                  return <td key={di} style={{ borderBottom:'1px solid #F0EAE3', padding:'6px 4px' }}></td>;
                }
                const booked       = alreadyBooked(cls.id);
                const isFull       = cls.status === 'full';
                const waitlistFull = isFull && cls.booked >= cls.capacity + 3;
                const disabled     = waitlistFull;
                return (
                  <td key={di} style={{ padding:'6px 4px', borderBottom:'1px solid #F0EAE3', verticalAlign:'middle' }}>
                    <div
                      onClick={() => !disabled && onPickClass(cls)}
                      style={{
                        borderRadius: 8,
                        padding: '8px 10px',
                        border: `1.5px solid ${booked ? '#A0673A' : isFull ? '#DDB89E' : '#C8D9B0'}`,
                        background: disabled ? '#F0EAE3' : booked ? '#F5EDE8' : isFull ? '#F5EDE8' : '#EEF3E6',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        opacity: disabled ? 0.55 : 1,
                        transition: 'all 0.16s',
                        minWidth: 80,
                      }}
                      onMouseEnter={e => { if (!disabled) { e.currentTarget.style.transform='translateY(-1px)'; e.currentTarget.style.boxShadow='0 2px 8px rgba(61,35,20,0.12)'; }}}
                      onMouseLeave={e => { e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow=''; }}
                    >
                      <div style={{ fontWeight:600, fontSize:'0.78rem', color:'#3D2314', lineHeight:1.3 }}>{cls.name}</div>
                      <div style={{ fontSize:'0.68rem', color:'#9C8470', marginTop:2 }}>{cls.trainer}</div>
                      <div style={{ marginTop:5 }}>
                        <span style={{
                          fontSize:'0.62rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em',
                          color: booked ? '#A0673A' : disabled ? '#9C8470' : isFull ? '#8C4A2A' : '#4E6A2E',
                        }}>
                          {booked ? '✓ Booked' : disabled ? 'Full' : isFull ? 'Waitlist' : '● Available'}
                        </span>
                      </div>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function fmt12(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

// ── Main Component ──────────────────────────────────────────────────────────
export default function ClientBook() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const { classes, loading: classesLoading } = useClasses();
  const { clients } = useClients();
  const clientDoc = clients.find(c => c.id === user?.uid || c.uid === user?.uid);
  const { bookings, confirmedBookings, addClientBooking, addToWaitlist } = useBookings({ clientId: clientDoc?.id ?? user?.uid });

  const [step,          setStep]          = useState(1);
  const [selected,      setSelected]      = useState(null);
  const [weekOffset,    setWeekOffset]    = useState(0);
  const [confirming,    setConfirming]    = useState(false);
  const [blockedMsg,    setBlockedMsg]    = useState(null);
  const [showPkgPicker, setShowPkgPicker] = useState(false);

  const weekStart = addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), weekOffset * 7);
  const weekOf    = getWeekOf(weekStart);

  const weekDates = Array.from({ length: 7 }, (_, i) =>
    format(addDays(weekStart, i), 'yyyy-MM-dd')
  );
  const weekClasses = resolveClassesForWeek(classes, weekStart);

  function alreadyBooked(classId) {
    return bookings.some(b => b.classId === classId && b.weekOf === weekOf && b.status === 'confirmed');
  }

  // Check if client can change package: only allowed if no sessions remain
  const canChangePackage = !clientDoc?.pkg ||
    clientDoc?.sessionsTotal === 0 ||
    (clientDoc?.sessionsRemaining ?? 0) <= 0;

  function pickClass(cls) {
    const classDateTime = new Date(`${cls.date}T${cls.time}:00`);
    const cutoff = new Date(classDateTime.getTime() - 30 * 60 * 1000);
    if (new Date() >= cutoff) {
      toast.error('Bookings close 30 minutes before the class starts.');
      return;
    }
    if (cls.status === 'full' && cls.booked >= (cls.capacity + 3)) return;
    if (alreadyBooked(cls.id)) { toast.error('You already have this class booked.'); return; }

    if (cls.status !== 'full') {
      const blockReason = getPackageBlockReason(clientDoc, confirmedBookings);

      if (blockReason === 'NO_PACKAGE') {
        setShowPkgPicker(true);
        return;
      }

      if (blockReason === 'UNPAID_LIMIT') {
        setBlockedMsg(
          'You can book 1 session before payment is confirmed. Once the studio marks you as paid, you\'ll have full access to your package.'
        );
        return;
      }

      if (blockReason) {
        setBlockedMsg(blockReason);
        return;
      }
    }

    setSelected(cls);
    setStep(2);
  }

  async function confirm() {
    if (!user?.uid || !selected) return;

    setConfirming(true);
    try {
      if (selected.status === 'full') {
        const waitlistCount = bookings.filter(b =>
          b.classId === selected.id && b.weekOf === weekOf && b.status === 'waitlist'
        ).length;
        if (waitlistCount >= 3) { toast.error('Waitlist is full for this class.'); setConfirming(false); return; }
        await addToWaitlist(selected.id, user.uid, weekOf, waitlistCount + 1);
        toast.success('Added to waitlist!');
      } else {
        await addClientBooking(selected.id, user.uid, weekOf, selected, clientDoc);
        toast.success('Booking confirmed!');
      }
      setStep(3);
    } catch (err) {
      console.error(err);
      toast.error('Something went wrong. Please try again.');
    } finally {
      setConfirming(false);
    }
  }

  const waMsg = selected
    ? `Hi! I'd like to confirm my booking at Pilates Vibes:\n${selected.name} with ${selected.trainer}\n${format(addDays(weekStart, selected.day), 'EEE, MMM d')} at ${selected.time}\n\nPlease note: any changes must be made at least 12 hours in advance, otherwise a session will be deducted. 🌿`
    : '';

  const isWaitlist = selected?.status === 'full';

  return (
    <div style={{ padding:'28px 32px 40px', maxWidth:760, margin:'0 auto' }}>

      {/* Modals */}
      <BlockedModal message={blockedMsg} onClose={() => setBlockedMsg(null)} />
      {showPkgPicker && (
        <PackagePickerModal
          clientId={user?.uid}
          onClose={() => setShowPkgPicker(false)}
          onSelected={() => { setShowPkgPicker(false); }}
        />
      )}

      {/* Step indicator */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', marginBottom:28 }}>
        {STEPS.map((s, i) => (
          <div key={s} style={{ display:'flex', alignItems:'center' }}>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
              <div style={{
                width:30, height:30, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:'0.78rem', fontWeight:600,
                background: i <= step - 1 ? '#3D2314' : '#E0D5C1',
                color:      i <= step - 1 ? '#F5F0E8' : '#9C8470',
              }}>
                {i < step - 1 ? <Check size={13}/> : i + 1}
              </div>
              <div style={{ fontSize:'0.68rem', color: i === step - 1 ? '#3D2314':'#9C8470', fontWeight: i === step - 1 ? 600:400, whiteSpace:'nowrap' }}>{s}</div>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ width:60, height:1.5, background: i < step - 1 ? '#3D2314':'#E0D5C1', margin:'0 4px 18px' }}/>
            )}
          </div>
        ))}
      </div>

      {/* ── STEP 1: Schedule ── */}
      {step === 1 && (
        <div style={{ background:'#FAF7F2', borderRadius:14, border:'1px solid #E0D5C1', boxShadow:'0 2px 16px rgba(61,35,20,0.10)', padding:22 }}>

          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
            <div style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'1.25rem', fontWeight:500, color:'#3D2314' }}>
              Weekly Schedule
            </div>
            {/* Package pill */}
            {clientDoc?.pkg ? (
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ padding:'4px 12px', borderRadius:20, fontSize:'0.72rem', fontWeight:600, background:'#EEF3E6', color:'#4E6A2E', border:'1px solid #C8D9B0' }}>
                  📦 {clientDoc.pkg}
                </span>
                {canChangePackage && (
                  <button
                    onClick={() => setShowPkgPicker(true)}
                    style={{ fontSize:'0.72rem', color:'#A0673A', background:'none', border:'none', cursor:'pointer', textDecoration:'underline', fontFamily:"'DM Sans',sans-serif" }}
                  >
                    Change
                  </button>
                )}
              </div>
            ) : (
              <button
                onClick={() => setShowPkgPicker(true)}
                style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 14px', borderRadius:20, background:'#3D2314', color:'#F5F0E8', border:'none', cursor:'pointer', fontSize:'0.78rem', fontWeight:500, fontFamily:"'DM Sans',sans-serif" }}
              >
                <Package size={13}/> Choose Package
              </button>
            )}
          </div>

          {/* Unpaid notice */}
          {clientDoc?.pkg && !clientDoc?.paymentVerified && (
            <div style={{ background:'#F5F1E0', border:'1px solid #DDD0A0', borderRadius:8, padding:'9px 14px', fontSize:'0.8rem', color:'#7A6020', marginBottom:14, display:'flex', alignItems:'center', gap:8 }}>
              ⏳ <span>Payment pending confirmation by studio — you can book <strong>1 session</strong> in the meantime.</span>
            </div>
          )}

          {/* Week nav */}
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
            <button onClick={() => setWeekOffset(w => w - 1)} style={navBtn}><ChevronLeft size={15}/></button>
            <span style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'1rem', color:'#3D2314', flex:1, textAlign:'center' }}>
              {format(weekStart, 'MMM d')} – {format(addDays(weekStart, 6), 'MMM d')}
            </span>
            <button onClick={() => setWeekOffset(w => w + 1)} style={navBtn}><ChevronRight size={15}/></button>
          </div>

          {classesLoading ? (
            <p style={{ color:'#9C8470', fontSize:'0.84rem', padding:'16px 0' }}>Loading classes…</p>
          ) : (
            <ScheduleGrid
              weekClasses={weekClasses}
              weekStart={weekStart}
              weekDates={weekDates}
              alreadyBooked={alreadyBooked}
              onPickClass={pickClass}
            />
          )}
        </div>
      )}

      {/* ── STEP 2: Confirm ── */}
      {step === 2 && selected && (
        <div style={{ background:'#FAF7F2', borderRadius:14, border:'1px solid #E0D5C1', boxShadow:'0 2px 16px rgba(61,35,20,0.10)', padding:22 }}>
          <div style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'1.25rem', fontWeight:500, color:'#3D2314', marginBottom:16 }}>
            {isWaitlist ? 'Join Waitlist' : 'Confirm Booking'}
          </div>

          {isWaitlist && (
            <div style={{ background:'#F5F1E0', border:'1px solid #DDD0A0', borderRadius:8, padding:'10px 14px', fontSize:'0.8rem', color:'#7A6020', marginBottom:14 }}>
              ⏳ This class is full. You'll be added to the waitlist and notified if a spot opens. You'll have <strong>1 hour</strong> to confirm.
            </div>
          )}

          {/* Summary */}
          <div style={{ background:'#F5F0E8', borderRadius:10, border:'1px solid #E0D5C1', padding:'16px 18px', marginBottom:18 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              {[
                { label:'Class',   val: selected.name },
                { label:'Trainer', val: selected.trainer },
                { label:'Date',    val: format(addDays(weekStart, selected.day), 'EEE, MMM d') },
                { label:'Time',    val: selected.time },
              ].map(r => (
                <div key={r.label}>
                  <div style={{ fontSize:'0.68rem', textTransform:'uppercase', letterSpacing:'0.08em', color:'#9C8470', marginBottom:2 }}>{r.label}</div>
                  <div style={{ fontWeight:500, fontSize:'0.9rem', color:'#2A1A0E' }}>{r.val}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Sessions remaining notice */}
          {clientDoc && clientDoc.sessionsTotal > 0 && (
            <div style={{ background:'#F5F0E8', border:'1px solid #E0D5C1', borderRadius:8, padding:'10px 14px', fontSize:'0.8rem', color:'#6B5744', marginBottom:14 }}>
              📦 You have <strong>{clientDoc.sessionsRemaining}</strong> session{clientDoc.sessionsRemaining !== 1 ? 's' : ''} remaining after this booking.
            </div>
          )}

          <div style={{ background:'#EEF3E6', border:'1px solid #C8D9B0', borderRadius:8, padding:'10px 14px', fontSize:'0.8rem', color:'#4E6A2E', marginBottom:18 }}>
            📋 Any changes must be made via the studio's number at least <strong>12 hours in advance</strong>, otherwise a session will be automatically deducted.
          </div>

          <div style={{ display:'flex', gap:10 }}>
            <button onClick={() => setStep(1)} style={{ flex:1, padding:'12px', background:'transparent', border:'1.5px solid #E0D5C1', borderRadius:8, color:'#6B5744', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", fontSize:'0.9rem', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
              <ChevronLeft size={15}/> Back
            </button>
            <button onClick={confirm} disabled={confirming} style={{ flex:2, padding:'12px', background: confirming ? '#6B3D25' : '#3D2314', border:'none', borderRadius:8, color:'#F5F0E8', cursor: confirming ? 'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif", fontSize:'0.9rem', fontWeight:500 }}>
              {confirming ? 'Saving…' : isWaitlist ? 'Join Waitlist →' : 'Confirm Booking →'}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Done ── */}
      {step === 3 && selected && (
        <div style={{ background:'#FAF7F2', borderRadius:14, border:'1px solid #E0D5C1', boxShadow:'0 2px 16px rgba(61,35,20,0.10)', padding:'32px 24px', textAlign:'center' }}>
          <div style={{ fontSize:'3rem', marginBottom:12 }}>{isWaitlist ? '⏳' : '🎉'}</div>
          <div style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'1.6rem', fontWeight:500, color:'#3D2314', marginBottom:8 }}>
            {isWaitlist ? "You're on the waitlist!" : "You're booked!"}
          </div>
          <div style={{ fontSize:'0.88rem', color:'#6B5744', marginBottom:20 }}>
            {selected.name} with {selected.trainer} · {format(addDays(weekStart, selected.day), 'EEE, MMM d')} · {selected.time}
          </div>

          <div style={{ background:'#EEF3E6', border:'1px solid #C8D9B0', borderRadius:8, padding:'11px 14px', fontSize:'0.82rem', color:'#4E6A2E', textAlign:'left', marginBottom:20 }}>
            {isWaitlist
              ? "⏳ We'll notify you if a spot opens. You'll have 1 hour to confirm before it moves to the next person."
              : '📋 Any changes must be made at least 12 hours in advance via the studio\'s number, otherwise a session will be deducted.'}
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {!isWaitlist && (
              <a href={`https://wa.me/?text=${encodeURIComponent(waMsg)}`} target="_blank" rel="noreferrer"
                style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'12px', background:'#25D366', color:'#fff', borderRadius:8, textDecoration:'none', fontSize:'0.9rem', fontWeight:500, fontFamily:"'DM Sans',sans-serif" }}>
                <MessageSquare size={16}/> Open WhatsApp Confirmation
              </a>
            )}
            <button onClick={() => { setStep(1); setSelected(null); }} style={{ padding:'11px', background:'transparent', border:'none', color:'#9C8470', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", fontSize:'0.88rem' }}>
              Book another class
            </button>
            <button onClick={() => navigate('/client')} style={{ padding:'11px', background:'transparent', border:'none', color:'#9C8470', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", fontSize:'0.88rem' }}>
              ← Back to Dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const navBtn = {
  width:30, height:30, borderRadius:'50%', background:'#FAF7F2', border:'1.5px solid #E0D5C1',
  display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'#6B5744',
};