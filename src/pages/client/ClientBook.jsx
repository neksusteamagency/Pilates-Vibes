import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useClasses } from '../../hooks/useClasses';
import { useBookings } from '../../hooks/useBookings';
import { useClients } from '../../hooks/useClients';
import { ChevronLeft, ChevronRight, Check, MessageSquare, X } from 'lucide-react';
import { format, addDays, startOfWeek } from 'date-fns';
import toast from 'react-hot-toast';

const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const STEPS = ['Choose Class', 'Confirm', 'Done'];

function getWeekOf(weekStart) {
  return format(weekStart, 'yyyy-MM-dd');
}

// ── Package validation ──────────────────────────────────────────────────────
function getPackageBlockReason(clientDoc) {
  if (!clientDoc) return 'Client profile not found. Please contact the studio.';

  const today = new Date().toISOString().split('T')[0];

  if (!clientDoc.pkg || clientDoc.sessionsTotal === 0)
    return "You don't have an active package. Please contact the studio to get started.";

  if (clientDoc.expiry && clientDoc.expiry < today)
    return 'Your package has expired. Please renew to book sessions.';

  if (clientDoc.isFrozen)
    return 'Your package is currently frozen. Please contact the studio to unfreeze it.';

  if ((clientDoc.sessionsRemaining ?? 0) <= 0)
    return 'You have no sessions remaining. Please renew your package.';

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
        {/* Close button */}
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

        {/* Icon */}
        <div style={{ fontSize: '2.4rem', marginBottom: 12 }}>🚫</div>

        {/* Title */}
        <div style={{
          fontFamily: "'Cormorant Garant', serif",
          fontSize: '1.3rem', fontWeight: 600,
          color: '#3D2314', marginBottom: 10,
        }}>
          Booking Unavailable
        </div>

        {/* Message */}
        <div style={{
          fontSize: '0.88rem', color: '#6B5744',
          lineHeight: 1.6, marginBottom: 24,
        }}>
          {message}
        </div>

        {/* CTA */}
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

// ── Main Component ──────────────────────────────────────────────────────────
export default function ClientBook() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const { classes, loading: classesLoading } = useClasses();
  const { bookings, addClientBooking, addToWaitlist } = useBookings({ clientId: user?.uid });
  const { clients } = useClients();
  const clientDoc = clients.find(c => c.id === user?.uid);

  const [step, setStep]             = useState(1);
  const [selected, setSelected]     = useState(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [blockedMsg, setBlockedMsg] = useState(null); // ← drives the modal

  const weekStart = addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), weekOffset * 7);
  const weekOf    = getWeekOf(weekStart);

  const weekDates = Array.from({ length: 7 }, (_, i) =>
    format(addDays(weekStart, i), 'yyyy-MM-dd')
  );
  const weekClasses = classes.filter(c =>
    weekDates.includes(c.date) && c.status !== 'cancelled'
  );

  function alreadyBooked(classId) {
    return bookings.some(b => b.classId === classId && b.weekOf === weekOf && b.status === 'confirmed');
  }

  function pickClass(cls) {
    if (cls.status === 'full' && cls.booked >= (cls.capacity + 3)) return;
    if (alreadyBooked(cls.id)) { toast.error('You already have this class booked.'); return; }

    if (cls.status !== 'full') {
      const blockReason = getPackageBlockReason(clientDoc);
      if (blockReason) { setBlockedMsg(blockReason); return; }
    }

    setSelected(cls);
    setStep(2);
  }

  async function confirm() {
    if (!user?.uid || !selected) return;

    if (selected.status !== 'full') {
      const blockReason = getPackageBlockReason(clientDoc);
      if (blockReason) { setBlockedMsg(blockReason); return; }
    }

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
    ? `Hi! I'd like to confirm my booking at Pilates Vibes:\n${selected.name} with ${selected.trainer}\n${format(addDays(weekStart, selected.day), 'EEE, MMM d')} at ${selected.time}\n\nPlease note: any changes must be made at least 24 hours in advance, otherwise a session will be deducted. 🌿`
    : '';

  const isWaitlist = selected?.status === 'full';

  return (
    <div style={{ padding:'28px 32px 40px', maxWidth:720, margin:'0 auto' }}>

      {/* ── Blocked Modal ── */}
      <BlockedModal message={blockedMsg} onClose={() => setBlockedMsg(null)} />

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

      {/* ── STEP 1: Choose ── */}
      {step === 1 && (
        <div style={{ background:'#FAF7F2', borderRadius:14, border:'1px solid #E0D5C1', boxShadow:'0 2px 16px rgba(61,35,20,0.10)', padding:22 }}>
          <div style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'1.25rem', fontWeight:500, color:'#3D2314', marginBottom:16 }}>Select a Class</div>

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
            DAYS.map((_, di) => {
              const dayClasses = weekClasses.filter(c => c.day === di);
              if (!dayClasses.length) return null;
              const date = addDays(weekStart, di);
              return (
                <div key={di} style={{ marginBottom:12 }}>
                  <div style={{ fontSize:'0.72rem', textTransform:'uppercase', letterSpacing:'0.1em', color:'#9C8470', fontWeight:500, marginBottom:6, paddingBottom:4, borderBottom:'1px solid #E0D5C1' }}>
                    {format(date, 'EEEE, MMM d')}
                  </div>
                  {dayClasses.map(cls => {
                    const booked       = alreadyBooked(cls.id);
                    const isFull       = cls.status === 'full';
                    const waitlistFull = isFull && cls.booked >= cls.capacity + 3;
                    const disabled     = waitlistFull;
                    return (
                      <div key={cls.id} onClick={() => !disabled && pickClass(cls)} style={{
                        borderRadius:8, padding:'12px 14px', marginBottom:6,
                        border:`1.5px solid ${isFull ? '#DDB89E' : '#C8D9B0'}`,
                        background: disabled ? '#F0EAE3' : isFull ? '#F5EDE8' : '#EEF3E6',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        opacity: disabled ? 0.6 : 1,
                        display:'flex', alignItems:'center', justifyContent:'space-between',
                        transition:'all 0.18s',
                      }}
                        onMouseEnter={e => { if (!disabled) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 2px 10px rgba(61,35,20,0.10)'; }}}
                        onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}>
                        <div>
                          <div style={{ fontWeight:600, fontSize:'0.9rem', color:'#3D2314' }}>{cls.name}</div>
                          <div style={{ fontSize:'0.76rem', color:'#9C8470', marginTop:2 }}>{cls.trainer} · {cls.time}</div>
                        </div>
                        <div style={{ textAlign:'right' }}>
                          <span style={{ fontSize:'0.68rem', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color: disabled ? '#9C8470' : isFull ? '#8C4A2A' : '#4E6A2E' }}>
                            {booked ? '✓ Booked' : disabled ? 'Waitlist Full' : isFull ? 'Join Waitlist' : '✓ Available'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })
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
            📋 Any changes must be made via the studio's number at least <strong>24 hours in advance</strong>, otherwise a session will be automatically deducted.
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
              : '📋 Any changes must be made at least 24 hours in advance via the studio\'s number, otherwise a session will be deducted.'}
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