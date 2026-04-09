import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClasses } from '../../hooks/useClasses';
import { ChevronLeft, ChevronRight, Check, MessageSquare } from 'lucide-react';
import { format, addDays, startOfWeek } from 'date-fns';
import toast from 'react-hot-toast';
import { db } from '../../firebase/config';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

const DAYS    = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const STEPS   = ['Choose Class', 'Your Details', 'Done'];
const PACKAGES = [
  { label: 'Single Session — $25',    sessions: 1,  price: 25  },
  { label: '5-Session Pack — $110',   sessions: 5,  price: 110 },
  { label: '10-Session Pack — $200',  sessions: 10, price: 200 },
];

export default function GuestBookingPage() {
  const navigate  = useNavigate();
  const [step, setStep]           = useState(1);
  const [selected, setSelected]   = useState(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [method, setMethod]       = useState('Cash');
  const [saving, setSaving]       = useState(false);
  const [form, setForm] = useState({
    name: '', phone: '', pkg: PACKAGES[0].label,
  });

  const weekStart = addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), weekOffset * 7);
  const weekOf    = format(weekStart, 'yyyy-MM-dd');

  const { classes, loading } = useClasses();

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  function pickClass(cls) {
    if (cls.status === 'full') return;
    setSelected(cls);
    setStep(2);
  }

  async function confirm() {
    if (!form.name.trim() || !form.phone.trim()) {
      toast.error('Please fill in your name and phone number.');
      return;
    }
    setSaving(true);
    try {
      const pkgObj = PACKAGES.find(p => p.label === form.pkg) || PACKAGES[0];

      // 1. Create a guest client record
      const clientRef = await addDoc(collection(db, 'clients'), {
        name:              form.name.trim(),
        phone:             form.phone.trim(),
        email:             '',
        avatar:            form.name.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2),
        pkg:               pkgObj.label,
        sessionsTotal:     pkgObj.sessions,
        sessionsRemaining: pkgObj.sessions,
        sessionsUsed:      0,
        cancelledSessions: 0,
        purchaseDate:      format(new Date(), 'MMM d, yyyy'),
        expiry:            format(addDays(new Date(), 90), 'MMM d, yyyy'),
        paymentMethod:     method,
        status:            'active',
        isFrozen:          false,
        frozenUntil:       null,
        isGuest:           true,
        notes:             'Walk-in / Guest booking',
        createdAt:         serverTimestamp(),
      });

      // 2. Create a booking for this class
      await addDoc(collection(db, 'bookings'), {
        classId:   selected.id,
        clientId:  clientRef.id,
        weekOf,
        status:    'confirmed',
        createdAt: serverTimestamp(),
      });

      toast.success('Booking confirmed!');
      setStep(3);
    } catch (err) {
      console.error(err);
      toast.error('Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const waMsg = selected
    ? `Hi ${form.name}! Your booking at Pilates Vibes is confirmed ✅\n\n📍 ${selected.name} with ${selected.trainer}\n📅 ${format(addDays(weekStart, selected.day), 'EEE, MMM d')} at ${selected.time}\n📦 Package: ${form.pkg}\n💳 Payment: ${method}\n\nPlease note: any changes must be made via the studio's number at least 24 hours in advance, otherwise a session will be deducted. 🌿`
    : '';

  return (
    <div style={{ minHeight: '100vh', background: '#F5F0E8', position: 'relative', overflow: 'hidden' }}>
      {/* Background circles */}
      <div style={{ position: 'absolute', width: 500, height: 500, borderRadius: '50%', background: '#EDE6D6', opacity: 0.7, top: -120, right: -100, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', width: 300, height: 300, borderRadius: '50%', background: '#C4AE8F', opacity: 0.2, bottom: -80, left: -60, pointerEvents: 'none' }} />

      <div style={{ width: '100%', maxWidth: 560, margin: '0 auto', padding: '40px 16px 60px', position: 'relative', zIndex: 2 }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontFamily: "'Cormorant Garant',serif", fontSize: '1.8rem', color: '#3D2314', fontWeight: 500 }}>Book a Session</div>
          <div style={{ fontSize: '0.8rem', color: '#9C8470', marginTop: 4 }}>No membership required</div>
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 28 }}>
          {STEPS.map((s, i) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{
                  width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.78rem', fontWeight: 600,
                  background: i <= step - 1 ? '#3D2314' : '#E0D5C1',
                  color: i <= step - 1 ? '#F5F0E8' : '#9C8470',
                }}>
                  {i < step - 1 ? <Check size={13} /> : i + 1}
                </div>
                <div style={{ fontSize: '0.68rem', color: i === step - 1 ? '#3D2314' : '#9C8470', fontWeight: i === step - 1 ? 600 : 400, whiteSpace: 'nowrap' }}>{s}</div>
              </div>
              {i < STEPS.length - 1 && (
                <div style={{ width: 60, height: 1.5, background: i < step - 1 ? '#3D2314' : '#E0D5C1', margin: '0 4px 18px' }} />
              )}
            </div>
          ))}
        </div>

        {/* ── STEP 1: Choose Class ── */}
        {step === 1 && (
          <div style={{ background: '#FAF7F2', borderRadius: 14, border: '1px solid #E0D5C1', boxShadow: '0 4px 24px rgba(61,35,20,0.10)', padding: 22 }}>
            <div style={{ fontFamily: "'Cormorant Garant',serif", fontSize: '1.2rem', fontWeight: 500, color: '#3D2314', marginBottom: 16 }}>Select a Class</div>

            {/* Week nav */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <button onClick={() => setWeekOffset(w => w - 1)} style={navBtn}><ChevronLeft size={15} /></button>
              <span style={{ fontFamily: "'Cormorant Garant',serif", fontSize: '1rem', color: '#3D2314', flex: 1, textAlign: 'center' }}>
                {format(weekStart, 'MMM d')} – {format(addDays(weekStart, 6), 'MMM d')}
              </span>
              <button onClick={() => setWeekOffset(w => w + 1)} style={navBtn}><ChevronRight size={15} /></button>
            </div>

            {loading ? (
              <p style={{ color: '#9C8470', fontSize: '0.84rem' }}>Loading classes…</p>
            ) : (
              DAYS.map((_, di) => {
                const dayClasses = classes.filter(c => c.day === di);
                if (!dayClasses.length) return null;
                const date = addDays(weekStart, di);
                return (
                  <div key={di} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9C8470', fontWeight: 500, marginBottom: 6, paddingBottom: 4, borderBottom: '1px solid #E0D5C1' }}>
                      {format(date, 'EEEE, MMM d')}
                    </div>
                    {dayClasses.map(cls => (
                      <div key={cls.id} onClick={() => pickClass(cls)} style={{
                        borderRadius: 8, padding: '12px 14px', marginBottom: 6,
                        border: `1.5px solid ${cls.status === 'full' ? '#DDB89E' : '#C8D9B0'}`,
                        background: cls.status === 'full' ? '#F5EDE8' : '#EEF3E6',
                        cursor: cls.status === 'full' ? 'not-allowed' : 'pointer',
                        opacity: cls.status === 'full' ? 0.7 : 1,
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        transition: 'all 0.18s',
                      }}
                        onMouseEnter={e => { if (cls.status !== 'full') { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 2px 10px rgba(61,35,20,0.10)'; } }}
                        onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#3D2314' }}>{cls.name}</div>
                          <div style={{ fontSize: '0.76rem', color: '#9C8470', marginTop: 2 }}>{cls.trainer} · {cls.time}</div>
                        </div>
                        <span style={{ fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: cls.status === 'full' ? '#8C4A2A' : '#4E6A2E' }}>
                          {cls.status === 'full' ? 'Full' : '✓ Available'}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── STEP 2: Details & Payment ── */}
        {step === 2 && selected && (
          <div style={{ background: '#FAF7F2', borderRadius: 14, border: '1px solid #E0D5C1', boxShadow: '0 4px 24px rgba(61,35,20,0.10)', padding: 22 }}>
            <div style={{ fontFamily: "'Cormorant Garant',serif", fontSize: '1.2rem', fontWeight: 500, color: '#3D2314', marginBottom: 16 }}>Your Details &amp; Payment</div>

            {/* Selected class summary */}
            <div style={{ background: '#F5F0E8', borderRadius: 8, border: '1px solid #E0D5C1', padding: '10px 14px', marginBottom: 16, fontSize: '0.84rem', color: '#6B5744' }}>
              📅 {selected.name} · {format(addDays(weekStart, selected.day), 'EEE, MMM d')} · {selected.time} with {selected.trainer}
            </div>

            {/* Form fields */}
            <Field label="Full Name">
              <input style={inp} placeholder="e.g. Lara Nassar" value={form.name} onChange={e => set('name', e.target.value)} />
            </Field>
            <Field label="Phone (WhatsApp)">
              <input style={inp} placeholder="+961 70 000 000" value={form.phone} onChange={e => set('phone', e.target.value)} />
            </Field>
            <Field label="Package">
              <select style={inp} value={form.pkg} onChange={e => set('pkg', e.target.value)}>
                {PACKAGES.map(p => <option key={p.label}>{p.label}</option>)}
              </select>
            </Field>
            <Field label="Payment Method">
              <div style={{ display: 'flex', gap: 8 }}>
                {['Cash', 'Whish'].map(m => (
                  <button key={m} onClick={() => setMethod(m)} style={{
                    flex: 1, padding: '10px', borderRadius: 8, cursor: 'pointer',
                    fontFamily: "'DM Sans',sans-serif", fontSize: '0.86rem', fontWeight: 500,
                    background: method === m ? '#3D2314' : '#F5F0E8',
                    color: method === m ? '#F5F0E8' : '#6B5744',
                    border: `1.5px solid ${method === m ? '#3D2314' : '#E0D5C1'}`,
                    transition: 'all 0.18s',
                  }}>
                    {m === 'Whish' ? '📱 Whish' : '💵 Cash'}
                  </button>
                ))}
              </div>
            </Field>

            {/* Whish deep link */}
            {method === 'Whish' && (
              <a href="whish://" style={{ display: 'block', textAlign: 'center', marginTop: 4, marginBottom: 8, fontSize: '0.78rem', color: '#3A5A8C', textDecoration: 'none' }}>
                → Open Whish app to pay
              </a>
            )}

            <div style={{ background: '#EEF3E6', border: '1px solid #C8D9B0', borderRadius: 8, padding: '10px 14px', fontSize: '0.8rem', color: '#4E6A2E', marginTop: 8, marginBottom: 16 }}>
              📋 Any changes must be made via the studio's number at least <strong>24 hours in advance</strong>, otherwise a session will be deducted.
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setStep(1)} style={{ flex: 1, padding: '12px', background: 'transparent', border: '1.5px solid #E0D5C1', borderRadius: 8, color: '#6B5744', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <ChevronLeft size={15} /> Back
              </button>
              <button onClick={confirm} disabled={saving} style={{ flex: 2, padding: '12px', background: saving ? '#6B3D25' : '#3D2314', border: 'none', borderRadius: 8, color: '#F5F0E8', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: "'DM Sans',sans-serif", fontSize: '0.9rem', fontWeight: 500 }}>
                {saving ? 'Saving…' : 'Confirm →'}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Done ── */}
        {step === 3 && (
          <div style={{ background: '#FAF7F2', borderRadius: 14, border: '1px solid #E0D5C1', boxShadow: '0 4px 24px rgba(61,35,20,0.10)', padding: '32px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>🎉</div>
            <div style={{ fontFamily: "'Cormorant Garant',serif", fontSize: '1.6rem', fontWeight: 500, color: '#3D2314', marginBottom: 8 }}>You're booked!</div>
            <div style={{ fontSize: '0.88rem', color: '#6B5744', marginBottom: 20 }}>
              {selected?.name} with {selected?.trainer} · {selected && format(addDays(weekStart, selected.day), 'EEE, MMM d')} · {selected?.time}
            </div>

            <div style={{ background: '#EEF3E6', border: '1px solid #C8D9B0', borderRadius: 8, padding: '11px 14px', fontSize: '0.82rem', color: '#4E6A2E', textAlign: 'left', marginBottom: 20 }}>
              📋 Any changes must be made at least 24 hours in advance via the studio's number, otherwise a session will be deducted.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <a href={`https://wa.me/?text=${encodeURIComponent(waMsg)}`} target="_blank" rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px', background: '#25D366', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: '0.9rem', fontWeight: 500, fontFamily: "'DM Sans',sans-serif" }}>
                <MessageSquare size={16} /> Open WhatsApp Confirmation
              </a>
              <button onClick={() => navigate('/login')} style={{ padding: '11px', background: 'transparent', border: 'none', color: '#9C8470', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", fontSize: '0.88rem' }}>
                ← Back to Login
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Shared helpers ────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 500, color: '#6B5744', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

const inp = {
  width: '100%', padding: '10px 13px', border: '1.5px solid #E0D5C1', borderRadius: 8,
  background: '#F5F0E8', fontFamily: "'DM Sans',sans-serif", fontSize: '0.88rem', color: '#2A1A0E', outline: 'none',
};
const navBtn = {
  width: 30, height: 30, borderRadius: '50%', background: '#FAF7F2', border: '1.5px solid #E0D5C1',
  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6B5744',
};