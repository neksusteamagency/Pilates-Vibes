import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useClients } from '../../hooks/useClients';
import { useBookings } from '../../hooks/useBookings';
import { useClasses } from '../../hooks/useClasses';
import { Calendar, Clock, ChevronRight, AlertTriangle, Snowflake, Star, X, Package, CheckCircle, Clock3 } from 'lucide-react';
import { format, parseISO, isAfter, isBefore, addHours } from 'date-fns';
import { db } from '../../firebase/config';
import { doc, setDoc, getDoc, updateDoc, increment, serverTimestamp, collection, addDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';

function fmt12(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function statusStyle(s) {
  if (s === 'confirmed') return { bg:'#EEF3E6', color:'#4E6A2E' };
  if (s === 'attended')  return { bg:'#EEF3E6', color:'#4E6A2E' };
  if (s === 'cancelled') return { bg:'#F5F1E0', color:'#7A6020' };
  if (s === 'no-show')   return { bg:'#F7EDED', color:'#8C3A3A' };
  return { bg:'#F0EAE3', color:'#3D2314' };
}

// ── Star Rating Widget ─────────────────────────────────────────
function StarRatingModal({ booking, cls, clientId, onClose }) {
  const [rating, setRating]   = useState(0);
  const [hovered, setHovered] = useState(0);
  const [saving, setSaving]   = useState(false);
  const [done, setDone]       = useState(false);

  async function submitRating() {
    if (!rating) return toast.error('Please select a rating.');
    setSaving(true);
    try {
      const ratingRef = doc(db, 'ratings', `${booking.classId}_${clientId}_${booking.weekOf || booking.id}`);
      await setDoc(ratingRef, {
        classId:   booking.classId,
        trainerId: cls.trainerId || null,
        trainerName: cls.trainer,
        rating,
        weekOf:    booking.weekOf,
        createdAt: serverTimestamp(),
      }, { merge: true });

      const { getDocs, query, where, collection: col } = await import('firebase/firestore');
      const trainersSnap = await getDocs(query(col(db, 'trainers'), where('name', '==', cls.trainer)));
      if (!trainersSnap.empty) {
        const trainerDoc = trainersSnap.docs[0];
        const trainerData = trainerDoc.data();
        const currentTotal    = trainerData.totalRatings || 0;
        const currentAvg      = trainerData.avgRating    || 0;
        const newTotal        = currentTotal + 1;
        const newAvg          = ((currentAvg * currentTotal) + rating) / newTotal;
        const breakdown       = trainerData.ratingBreakdown || {};
        breakdown[rating]     = (breakdown[rating] || 0) + 1;

        await updateDoc(doc(db, 'trainers', trainerDoc.id), {
          totalRatings:    newTotal,
          avgRating:       Math.round(newAvg * 10) / 10,
          ratingBreakdown: breakdown,
          updatedAt:       serverTimestamp(),
        });
      }

      await updateDoc(doc(db, 'bookings', booking.id), { rated: true });
      setDone(true);
    } catch (err) {
      console.error(err);
      toast.error('Failed to submit rating.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(42,26,14,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }} onClick={onClose}>
      <div style={{ background:'#FAF7F2', borderRadius:18, width:'100%', maxWidth:380, padding:28, border:'1px solid #E0D5C1', boxShadow:'0 8px 32px rgba(61,35,20,0.18)' }} onClick={e => e.stopPropagation()}>
        {done ? (
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:'3rem', marginBottom:12 }}>⭐</div>
            <div style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'1.4rem', fontWeight:500, color:'#3D2314', marginBottom:8 }}>Thanks for your feedback!</div>
            <div style={{ fontSize:'0.88rem', color:'#9C8470', marginBottom:20 }}>Your rating helps us improve your experience.</div>
            <button onClick={onClose} style={{ padding:'11px 24px', background:'#3D2314', color:'#F5F0E8', border:'none', borderRadius:8, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", fontSize:'0.9rem', fontWeight:500 }}>Done</button>
          </div>
        ) : (
          <>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:16 }}>
              <div>
                <div style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'1.3rem', fontWeight:500, color:'#3D2314' }}>Rate your class</div>
                <div style={{ fontSize:'0.82rem', color:'#9C8470', marginTop:3 }}>{cls?.name} with {cls?.trainer}</div>
              </div>
              <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#9C8470' }}><X size={18}/></button>
            </div>
            <p style={{ fontSize:'0.84rem', color:'#6B5744', marginBottom:20 }}>How was your experience with <strong>{cls?.trainer}</strong>?</p>
            <div style={{ display:'flex', justifyContent:'center', gap:10, marginBottom:24 }}>
              {[1,2,3,4,5].map(n => (
                <button key={n}
                  onClick={() => setRating(n)}
                  onMouseEnter={() => setHovered(n)}
                  onMouseLeave={() => setHovered(0)}
                  style={{ background:'none', border:'none', cursor:'pointer', padding:4, transform: (hovered || rating) >= n ? 'scale(1.2)' : 'scale(1)', transition:'transform 0.15s' }}>
                  <Star size={36} fill={(hovered || rating) >= n ? '#C4893A' : 'none'} color={(hovered || rating) >= n ? '#C4893A' : '#D4C4B0'} strokeWidth={1.5}/>
                </button>
              ))}
            </div>
            {rating > 0 && (
              <div style={{ textAlign:'center', marginBottom:16, fontSize:'0.88rem', color:'#9C8470' }}>
                {['','Needs improvement','Below average','Good','Very good','Excellent!'][rating]}
              </div>
            )}
            <button onClick={submitRating} disabled={!rating || saving} style={{ width:'100%', padding:'12px', background: rating ? '#3D2314' : '#C4AE8F', color:'#F5F0E8', border:'none', borderRadius:8, cursor: rating ? 'pointer' : 'not-allowed', fontFamily:"'DM Sans',sans-serif", fontSize:'0.9rem', fontWeight:500, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Submitting…' : 'Submit Rating'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Cancel Confirm Dialog ──────────────────────────────────────
function CancelConfirmDialog({ booking, cls, onConfirm, onCancel, cancelling }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(42,26,14,0.6)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'#FAF7F2', borderRadius:16, maxWidth:360, width:'100%', padding:24, border:'1px solid #E0D5C1', boxShadow:'0 8px 32px rgba(61,35,20,0.18)' }}>
        <div style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'1.25rem', fontWeight:500, color:'#3D2314', marginBottom:10 }}>Cancel Booking?</div>
        <div style={{ fontSize:'0.88rem', color:'#6B5744', marginBottom:6, lineHeight:1.5 }}>
          Are you sure you want to cancel your booking for <strong>{cls?.name}</strong>?
        </div>
        <div style={{ background:'#EEF3E6', border:'1px solid #C8D9B0', borderRadius:8, padding:'9px 13px', fontSize:'0.8rem', color:'#4E6A2E', marginBottom:20 }}>
          ℹ️ Note: Cancellations are not allowed within 12 hours of the class start time.
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={onCancel} style={{ flex:1, padding:'11px', background:'#F5F0E8', border:'1.5px solid #E0D5C1', borderRadius:8, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", fontSize:'0.88rem', color:'#6B5744' }}>Keep Booking</button>
          <button onClick={onConfirm} disabled={cancelling} style={{ flex:1, padding:'11px', background:'#8C3A3A', color:'#F5F0E8', border:'none', borderRadius:8, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", fontSize:'0.88rem', fontWeight:500, opacity: cancelling ? 0.6 : 1 }}>
            {cancelling ? 'Cancelling…' : 'Yes, Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SessionRow({ booking, cls, last, onCancel, onRate }) {
  const st = statusStyle(booking.status);
  const dateLabel = booking.classDate ? format(parseISO(booking.classDate), 'MMM d') : booking.weekOf || '';
  const month = dateLabel.split(' ')[0];
  const day   = dateLabel.split(' ')[1];

  const canCancel  = booking.status === 'confirmed';
  const canRate    = booking.status === 'attended' && !booking.rated;

  return (
    <div style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 0', borderBottom: last?'none':'1px solid #E0D5C1' }}>
      <div style={{ textAlign:'center', minWidth:42, flexShrink:0 }}>
        <div style={{ fontSize:'0.65rem', textTransform:'uppercase', color:'#9C8470', letterSpacing:'0.08em' }}>{month}</div>
        <div style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'1.8rem', fontWeight:500, color:'#3D2314', lineHeight:1 }}>{day}</div>
      </div>
      <div style={{ width:1.5, height:40, background:'#E0D5C1', flexShrink:0 }} />
      <div style={{ flex:1 }}>
        <div style={{ fontWeight:500, fontSize:'0.92rem', color:'#2A1A0E' }}>{cls?.name || '—'}</div>
        <div style={{ fontSize:'0.78rem', color:'#9C8470', marginTop:2 }}>{cls?.trainer || ''} · {cls ? fmt12(cls.time) : ''}</div>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
        {canRate && (
          <button onClick={() => onRate(booking)} style={{ padding:'3px 10px', borderRadius:20, fontSize:'0.72rem', fontWeight:500, background:'#F5F1E0', color:'#7A6020', border:'1px solid #DDD0A0', cursor:'pointer', display:'flex', alignItems:'center', gap:4, fontFamily:"'DM Sans',sans-serif" }}>
            <Star size={11}/> Rate
          </button>
        )}
        {canCancel && (
          <button onClick={() => onCancel(booking)} style={{ padding:'3px 10px', borderRadius:20, fontSize:'0.72rem', fontWeight:500, background:'#F7EDED', color:'#8C3A3A', border:'1px solid #DDB0B0', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            Cancel
          </button>
        )}
        <span style={{ padding:'3px 10px', borderRadius:20, fontSize:'0.72rem', fontWeight:500, background:st.bg, color:st.color, textTransform:'capitalize' }}>
          {booking.status}
        </span>
      </div>
    </div>
  );
}

function LoadingCard() {
  return (
    <div style={{ background:'#FAF7F2', borderRadius:14, border:'1px solid #E0D5C1', padding:22, display:'flex', alignItems:'center', justifyContent:'center', minHeight:120 }}>
      <span style={{ color:'#9C8470', fontSize:'0.84rem' }}>Loading…</span>
    </div>
  );
}

// ── Payment Status Badge ───────────────────────────────────────
function PaymentBadge({ verified }) {
  if (verified) {
    return (
      <div style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'4px 12px', borderRadius:20, background:'rgba(78,106,46,0.18)', border:'1px solid rgba(200,217,176,0.5)' }}>
        <CheckCircle size={12} color='#7BBF52'/>
        <span style={{ fontSize:'0.68rem', fontWeight:600, color:'#C8F0A0', textTransform:'uppercase', letterSpacing:'0.08em' }}>
          Payment Verified
        </span>
      </div>
    );
  }
  return (
    <div style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'4px 12px', borderRadius:20, background:'rgba(196,142,58,0.18)', border:'1px solid rgba(196,142,58,0.35)' }}>
      <Clock3 size={12} color='#E8C06A'/>
      <span style={{ fontSize:'0.68rem', fontWeight:600, color:'#E8C06A', textTransform:'uppercase', letterSpacing:'0.08em' }}>
        Payment Pending
      </span>
    </div>
  );
}

export default function ClientDashboard() {
  const { user }    = useAuth();
  const navigate    = useNavigate();

  const { clients, loading: clientsLoading } = useClients();
  const clientDoc = clients.find(c => c.id === user?.uid || c.uid === user?.uid);

  const { bookings, confirmedBookings, loading: bookingsLoading, clientCancelBooking } = useBookings({ clientId: clientDoc?.id ?? user?.uid });
  const { classes, loading: classesLoading } = useClasses();

  const [cancelTarget,  setCancelTarget]  = useState(null);
  const [cancelling,    setCancelling]    = useState(false);
  const [ratingTarget,  setRatingTarget]  = useState(null);

  const loading = clientsLoading || bookingsLoading || classesLoading;

  const upcoming = bookings.filter(b => b.status === 'confirmed').slice(0, 3);
  const recent   = bookings.filter(b => ['attended','cancelled','no-show'].includes(b.status)).slice(0, 3);
  const pendingRatings = bookings.filter(b => b.status === 'attended' && !b.rated).slice(0, 1);

  function getClass(classId) { return classes.find(c => c.id === classId); }

  const sessionsRemaining = clientDoc?.sessionsRemaining ?? 0;
  const sessionsTotal     = clientDoc?.sessionsTotal     ?? 0;
  const barPct    = sessionsTotal > 0 ? Math.round((sessionsRemaining / sessionsTotal) * 100) : 0;
  const lowSessions = sessionsRemaining <= 2 && sessionsTotal > 0;
  const hasPackage = !!clientDoc?.pkg && sessionsTotal > 0;
  const isPaid     = clientDoc?.paymentVerified === true;

  // Count active confirmed bookings for unpaid limit display
  const activeBookingsCount = (confirmedBookings || []).filter(b => b.status === 'confirmed').length;
  const unpaidAtLimit = hasPackage && !isPaid && activeBookingsCount >= 1;

  async function handleCancel() {
    if (!cancelTarget) return;
    const cls = getClass(cancelTarget.classId);
    if (!cls) { toast.error('Class not found.'); return; }

    // Enforce 12-hour cancellation window client-side
    if (cls.date && cls.time) {
      const classDateTime = new Date(`${cls.date}T${cls.time}:00`);
      const cutoffMs = classDateTime.getTime() - 12 * 60 * 60 * 1000;
      if (Date.now() >= cutoffMs) {
        toast.error('Cannot cancel within 12 hours of the class. Please contact the studio.');
        setCancelTarget(null);
        return;
      }
    }

    setCancelling(true);
    try {
      await clientCancelBooking(cancelTarget.id, cancelTarget.classId, cls.date, cls.time, cls, clientDoc);
      toast.success('Booking cancelled.');
      setCancelTarget(null);
    } catch (err) {
      if (err.message === 'WITHIN_24H') {
        toast.error('Cannot cancel within 12 hours of the class. Please contact the studio.');
      } else {
        toast.error('Failed to cancel. Please try again.');
      }
      setCancelTarget(null);
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div style={{ padding:'28px 32px 40px' }}>

      {/* Welcome */}
      <div style={{ marginBottom:22 }}>
        <h2 style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'1.9rem', fontWeight:500, color:'#3D2314' }}>
          Welcome back, {user?.name?.split(' ')[0]} 🌿
        </h2>
        <p style={{ fontSize:'0.84rem', color:'#9C8470', marginTop:4 }}>Here's your Pilates Vibes overview.</p>
      </div>

      {/* No package banner */}
      {!loading && !hasPackage && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, padding:'13px 18px', borderRadius:10, marginBottom:18, background:'#F5F1E0', border:'1px solid #DDD0A0', color:'#7A6020' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <Package size={16} style={{ flexShrink:0 }}/>
            <div style={{ fontSize:'0.84rem' }}>You don't have an active package yet. Choose one to start booking sessions!</div>
          </div>
          <button
            onClick={() => navigate('/client/book')}
            style={{ padding:'7px 16px', background:'#3D2314', color:'#F5F0E8', border:'none', borderRadius:8, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", fontSize:'0.8rem', fontWeight:500, whiteSpace:'nowrap' }}
          >
            Choose Package
          </button>
        </div>
      )}

      {/* Unpaid limit warning */}
      {!loading && unpaidAtLimit && (
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 16px', borderRadius:8, fontSize:'0.82rem', marginBottom:18, background:'#F5F1E0', border:'1px solid #DDD0A0', color:'#7A6020' }}>
          <Clock3 size={15} style={{ flexShrink:0 }}/>
          You've used your 1 pre-payment booking. The studio will unlock full access once your payment is confirmed.
        </div>
      )}

      {/* Low sessions alert */}
      {!loading && lowSessions && isPaid && (
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 16px', borderRadius:8, fontSize:'0.82rem', marginBottom:18, background:'#F7EDED', border:'1px solid #DDB0B0', color:'#8C3A3A' }}>
          <AlertTriangle size={15} style={{ flexShrink:0 }}/>
          You only have <strong style={{ margin:'0 3px' }}>{sessionsRemaining} session{sessionsRemaining !== 1 ? 's' : ''}</strong> remaining. Contact the studio to renew your package.
        </div>
      )}

      {/* Pending rating prompt */}
      {!loading && pendingRatings.length > 0 && (() => {
        const b = pendingRatings[0];
        const cls = getClass(b.classId);
        return (
          <div style={{ display:'flex', alignItems:'center', gap:12, padding:'13px 18px', borderRadius:10, marginBottom:18, background:'#F5F1E0', border:'1px solid #DDD0A0', color:'#7A6020' }}>
            <Star size={16} fill='#C4893A' color='#C4893A'/>
            <div style={{ flex:1, fontSize:'0.84rem' }}>How was <strong>{cls?.name}</strong>? Rate your experience.</div>
            <button onClick={() => setRatingTarget(b)} style={{ padding:'6px 14px', background:'#3D2314', color:'#F5F0E8', border:'none', borderRadius:7, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", fontSize:'0.8rem', fontWeight:500 }}>Rate Now</button>
          </div>
        );
      })()}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }} className="client-resp">

        {/* Package card */}
        {loading ? <LoadingCard /> : (
          <div style={{ background:'linear-gradient(135deg,#3D2314,#6B3D25)', borderRadius:14, padding:24, color:'#F5F0E8', position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', top:-30, right:-30, width:130, height:130, borderRadius:'50%', background:'rgba(245,240,232,0.07)' }}/>

            <div style={{ fontSize:'0.72rem', textTransform:'uppercase', letterSpacing:'0.12em', color:'#C4AE8F', marginBottom:4 }}>My Package</div>

            <div style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'1.4rem', fontWeight:500, marginBottom:10 }}>
              {clientDoc?.pkg || 'No active package'}
            </div>

            {/* Payment badge — shown when client has a package */}
            {hasPackage && (
              <div style={{ marginBottom:14 }}>
                <PaymentBadge verified={isPaid} />
              </div>
            )}

            {clientDoc?.isFrozen ? (
              <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:'0.84rem', color:'#A3C4F5', marginBottom:12 }}>
                <Snowflake size={15}/> Frozen until {clientDoc.frozenUntil}
              </div>
            ) : sessionsTotal > 0 ? (
              <>
                <div style={{ display:'flex', alignItems:'baseline', gap:6, marginBottom:6 }}>
                  <span style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'2.8rem', fontWeight:500, lineHeight:1 }}>{sessionsRemaining}</span>
                  <span style={{ fontSize:'0.82rem', color:'#C4AE8F' }}>sessions remaining</span>
                </div>
                <div style={{ background:'rgba(245,240,232,0.15)', borderRadius:20, height:6, marginBottom:12 }}>
                  <div style={{ background:'#C4AE8F', height:6, borderRadius:20, width:`${barPct}%`, transition:'width 0.4s' }}/>
                </div>
              </>
            ) : (
              <div style={{ fontSize:'0.84rem', color:'#C4AE8F', marginBottom:12 }}>Consider recharge</div>
            )}

            {/* Unpaid: show 1-session limit note */}
            {hasPackage && !isPaid && (
              <div style={{ fontSize:'0.74rem', color:'#E8C06A', marginBottom:6, display:'flex', alignItems:'center', gap:5 }}>
                <Clock3 size={11}/> 1 booking allowed until payment confirmed
              </div>
            )}

            {clientDoc?.expiry && (
              <div style={{ fontSize:'0.78rem', color:'#C4AE8F' }}>Expires {clientDoc.expiry}</div>
            )}
          </div>
        )}

        {/* Quick actions */}
        <div style={{ background:'#FAF7F2', borderRadius:14, border:'1px solid #E0D5C1', boxShadow:'0 2px 16px rgba(61,35,20,0.10)', padding:22 }}>
          <div style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'1.15rem', fontWeight:500, color:'#3D2314', marginBottom:14 }}>Quick Actions</div>
          {[
            { label:'Book a Class',         sub:'Reserve your next session', bg:'#3D2314', color:'#F5F0E8', path:'/client/book' },
            { label:'View Session History',  sub:'See all past sessions',     bg:'#FAF7F2', color:'#3D2314', border:'#E0D5C1',  path:'/client/history' },
          ].map((btn, i) => (
            <button key={i} onClick={() => navigate(btn.path)} style={{
              display:'flex', alignItems:'center', justifyContent:'space-between',
              width:'100%', padding:'13px 16px', marginBottom: i === 0 ? 10 : 0,
              background:btn.bg, color:btn.color,
              border: btn.border ? `1.5px solid ${btn.border}` : 'none',
              borderRadius:9, cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
              transition:'opacity 0.2s', textAlign:'left',
            }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
              <div>
                <div style={{ fontSize:'0.9rem', fontWeight:500 }}>{btn.label}</div>
                <div style={{ fontSize:'0.74rem', opacity:0.7, marginTop:2 }}>{btn.sub}</div>
              </div>
              <ChevronRight size={16}/>
            </button>
          ))}
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }} className="client-resp">

        {/* Upcoming */}
        <div style={{ background:'#FAF7F2', borderRadius:14, border:'1px solid #E0D5C1', boxShadow:'0 2px 16px rgba(61,35,20,0.10)', padding:22 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
            <span style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'1.15rem', fontWeight:500, color:'#3D2314', display:'flex', alignItems:'center', gap:8 }}>
              <Calendar size={16} color='#A0673A'/> Upcoming
            </span>
            <button onClick={() => navigate('/client/book')} style={{ fontSize:'0.78rem', color:'#A0673A', background:'none', border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:4, fontFamily:"'DM Sans',sans-serif" }}>
              Book more <ChevronRight size={13}/>
            </button>
          </div>
          {loading ? (
            <p style={{ fontSize:'0.84rem', color:'#9C8470' }}>Loading…</p>
          ) : upcoming.length === 0 ? (
            <p style={{ fontSize:'0.84rem', color:'#9C8470', padding:'8px 0' }}>No upcoming classes. Book one now!</p>
          ) : upcoming.map((b, i) => (
            <SessionRow key={b.id} booking={b} cls={getClass(b.classId)} last={i === upcoming.length - 1}
              onCancel={(bk) => setCancelTarget(bk)}
              onRate={(bk) => setRatingTarget(bk)}
            />
          ))}
        </div>

        {/* Recent */}
        <div style={{ background:'#FAF7F2', borderRadius:14, border:'1px solid #E0D5C1', boxShadow:'0 2px 16px rgba(61,35,20,0.10)', padding:22 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
            <span style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'1.15rem', fontWeight:500, color:'#3D2314', display:'flex', alignItems:'center', gap:8 }}>
              <Clock size={16} color='#A0673A'/> Recent
            </span>
            <button onClick={() => navigate('/client/history')} style={{ fontSize:'0.78rem', color:'#A0673A', background:'none', border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:4, fontFamily:"'DM Sans',sans-serif" }}>
              Full history <ChevronRight size={13}/>
            </button>
          </div>
          {loading ? (
            <p style={{ fontSize:'0.84rem', color:'#9C8470' }}>Loading…</p>
          ) : recent.length === 0 ? (
            <p style={{ fontSize:'0.84rem', color:'#9C8470', padding:'8px 0' }}>No session history yet.</p>
          ) : recent.map((b, i) => (
            <SessionRow key={b.id} booking={b} cls={getClass(b.classId)} last={i === recent.length - 1}
              onCancel={(bk) => setCancelTarget(bk)}
              onRate={(bk) => setRatingTarget(bk)}
            />
          ))}
        </div>
      </div>

      {/* Cancel Confirm */}
      {cancelTarget && (
        <CancelConfirmDialog
          booking={cancelTarget}
          cls={getClass(cancelTarget.classId)}
          onConfirm={handleCancel}
          onCancel={() => setCancelTarget(null)}
          cancelling={cancelling}
        />
      )}

      {/* Star Rating */}
      {ratingTarget && (
        <StarRatingModal
          booking={ratingTarget}
          cls={getClass(ratingTarget.classId)}
          clientId={user?.uid}
          onClose={() => setRatingTarget(null)}
        />
      )}

      <style>{`
        @media (max-width:700px) { .client-resp { grid-template-columns: 1fr !important; } }
      `}</style>
    </div>
  );
}