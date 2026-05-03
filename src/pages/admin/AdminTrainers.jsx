import { useState, useEffect } from 'react';
import { X, Plus, Star, Calendar, DollarSign, ChevronRight, TrendingUp, Clock, Eye, EyeOff, ChevronLeft } from 'lucide-react';
import { useTrainers } from '../../hooks/useTrainers';
import { useClasses, resolveClassesForMonth } from '../../hooks/useClasses';
import { useAuth } from '../../hooks/useAuth';
import { db } from '../../firebase/config';
import { collection, addDoc, serverTimestamp, query, where, getDocs, orderBy } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { format, addDays, startOfWeek, startOfMonth, addMonths, subMonths } from 'date-fns';

const PAYMENT_METHODS = ['Cash', 'Whish'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function Stars({ rating, size = 13 }) {
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} size={size} fill={i <= Math.round(rating) ? '#C4893A' : 'none'} color={i <= Math.round(rating) ? '#C4893A' : '#D4C4B0'} strokeWidth={1.5} />
      ))}
    </span>
  );
}

function RatingBar({ label, count, total }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
      <span style={{ fontSize: '0.72rem', color: '#9C8470', minWidth: 14, textAlign: 'right' }}>{label}</span>
      <Star size={10} fill='#C4893A' color='#C4893A' />
      <div style={{ flex: 1, background: '#E0D5C1', borderRadius: 10, height: 6 }}>
        <div style={{ background: '#C4893A', height: 6, borderRadius: 10, width: `${pct}%`, transition: 'width 0.4s' }} />
      </div>
      <span style={{ fontSize: '0.72rem', color: '#9C8470', minWidth: 20 }}>{count}</span>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 500, color: '#6B5744', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

const inp = { width: '100%', padding: '10px 13px', border: '1.5px solid #E0D5C1', borderRadius: 8, background: '#F5F0E8', fontFamily: "'DM Sans',sans-serif", fontSize: '0.88rem', color: '#2A1A0E', outline: 'none', boxSizing: 'border-box' };
const btnPrimary = { width: '100%', padding: '12px', background: '#3D2314', color: '#F5F0E8', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", fontSize: '0.9rem', fontWeight: 500 };

// ── Log Payment Modal ─────────────────────────────────────────
function LogPaymentModal({ trainer, onClose, onSaved }) {
  const [form, setForm] = useState({ amount: '', method: 'Cash', date: '', notes: '', sessions: '' });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  async function handleSave() {
    if (!form.amount || isNaN(form.amount)) return toast.error('Enter a valid amount.');
    if (!form.date) return toast.error('Payment date is required.');
    setSaving(true);
    try {
      await addDoc(collection(db, 'trainer_payments'), {
        trainerId:   trainer.id,
        trainerName: trainer.name,
        amount:      Number(form.amount),
        method:      form.method,
        date:        form.date,
        sessions:    Number(form.sessions) || 0,
        notes:       form.notes,
        createdAt:   serverTimestamp(),
      });

      await addDoc(collection(db, 'expenses'), {
        category:    'Trainer Payroll',
        description: `${trainer.name} — ${form.notes || form.date}`,
        amount:      Number(form.amount),
        method:      form.method,
        date:        form.date,
        month:       form.date.slice(0, 7),
        isIncome:    false,
        trainerId:   trainer.id,
        createdAt:   serverTimestamp(),
      });

      toast.success('Payment logged and added to Finance!');
      if (onSaved) onSaved();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Failed to log payment.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(42,26,14,0.45)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: '#FAF7F2', borderRadius: 18, width: '100%', maxWidth: 420, boxShadow: '0 8px 32px rgba(61,35,20,0.18)', border: '1px solid #E0D5C1' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #E0D5C1', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: "'Cormorant Garant',serif", fontSize: '1.3rem', fontWeight: 500, color: '#3D2314' }}>Log Payment</div>
            <div style={{ fontSize: '0.8rem', color: '#9C8470', marginTop: 2 }}>{trainer.name}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9C8470' }}><X size={18} /></button>
        </div>
        <div style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Amount (USD)"><input style={inp} type="number" placeholder="e.g. 400" value={form.amount} onChange={e => set('amount', e.target.value)} /></Field>
          <Field label="Payment Method">
            <div style={{ display: 'flex', gap: 8 }}>
              {PAYMENT_METHODS.map(m => (
                <button key={m} onClick={() => set('method', m)} style={{ flex: 1, padding: '9px 6px', borderRadius: 8, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", fontSize: '0.78rem', fontWeight: 500, background: form.method === m ? '#3D2314' : '#F5F0E8', color: form.method === m ? '#F5F0E8' : '#6B5744', border: `1.5px solid ${form.method === m ? '#3D2314' : '#E0D5C1'}`, transition: 'all 0.18s' }}>{m}</button>
              ))}
            </div>
          </Field>
          <Field label="Payment Date"><input style={inp} type="date" value={form.date} onChange={e => set('date', e.target.value)} /></Field>
          <Field label="Sessions Covered"><input style={inp} type="number" placeholder="e.g. 12" value={form.sessions} onChange={e => set('sessions', e.target.value)} /></Field>
          <Field label="Notes (optional)"><input style={inp} placeholder="e.g. March payroll" value={form.notes} onChange={e => set('notes', e.target.value)} /></Field>
          <div style={{ background: '#EEF3E6', border: '1px solid #C8D9B0', borderRadius: 8, padding: '10px 14px', fontSize: '0.8rem', color: '#4E6A2E' }}>
            This payment will also appear in Finance → Expenses automatically.
          </div>
          <button style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }} onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Payment'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Add Trainer Modal ─────────────────────────────────────────
function AddTrainerModal({ onClose }) {
  const { createTrainerAccount } = useAuth();
  const [form, setForm]     = useState({ name: '', specialty: '', phone: '', email: '', password: '', confirmPassword: '' });
  const [showPwd, setShowPwd] = useState(false);
  const [saving, setSaving]   = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  async function handleSave() {
    if (!form.name.trim())  return toast.error('Name is required.');
    if (!form.email.trim()) return toast.error('Email is required.');
    if (form.password.length < 6) return toast.error('Password must be at least 6 characters.');
    if (form.password !== form.confirmPassword) return toast.error('Passwords do not match.');
    setSaving(true);
    try {
      await createTrainerAccount(form.email, form.password, form.name, form.phone, form.specialty);
      toast.success(`${form.name} added with login credentials!`);
      onClose();
    } catch (err) {
      const msg =
        err.code === 'auth/email-already-in-use' ? 'This email is already registered.' :
        err.code === 'auth/invalid-email'         ? 'Invalid email address.' :
        err.message || 'Failed to create trainer account.';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(42,26,14,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: '#FAF7F2', borderRadius: 18, width: '100%', maxWidth: 440, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(61,35,20,0.18)', border: '1px solid #E0D5C1' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #E0D5C1', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: "'Cormorant Garant',serif", fontSize: '1.4rem', fontWeight: 500, color: '#3D2314' }}>Add Trainer</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9C8470' }}><X size={18} /></button>
        </div>
        <div style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Full Name"><input style={inp} placeholder="e.g. Sara Khoury" value={form.name} onChange={e => set('name', e.target.value)} /></Field>
          <Field label="Specialty"><input style={inp} placeholder="e.g. Mat & Reformer" value={form.specialty} onChange={e => set('specialty', e.target.value)} /></Field>
          <Field label="Phone"><input style={inp} placeholder="+961 70 000 000" value={form.phone} onChange={e => set('phone', e.target.value)} /></Field>

          <div style={{ borderTop: '1.5px solid #E0D5C1', paddingTop: 14 }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 500, color: '#3D2314', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Login Credentials</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Field label="Email"><input style={inp} type="email" placeholder="trainer@email.com" value={form.email} onChange={e => set('email', e.target.value)} /></Field>
              <Field label="Password">
                <div style={{ position: 'relative' }}>
                  <input style={{ ...inp, paddingRight: 40 }} type={showPwd ? 'text' : 'password'} placeholder="Min. 6 characters" value={form.password} onChange={e => set('password', e.target.value)} />
                  <button onClick={() => setShowPwd(p => !p)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9C8470' }}>
                    {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </Field>
              <Field label="Confirm Password"><input style={inp} type="password" placeholder="Repeat password" value={form.confirmPassword} onChange={e => set('confirmPassword', e.target.value)} /></Field>
            </div>
          </div>

          <div style={{ background: '#EEF3E6', border: '1px solid #C8D9B0', borderRadius: 8, padding: '10px 14px', fontSize: '0.8rem', color: '#4E6A2E' }}>
            A login account will be created. Share these credentials with the trainer.
          </div>
          <button style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }} onClick={handleSave} disabled={saving}>
            {saving ? 'Creating account…' : 'Add Trainer & Create Account'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Trainer Detail Modal ──────────────────────────────────────
function TrainerModal({ trainer, classes, onClose }) {
  const [tab,          setTab]          = useState('overview');
  const [showPayModal, setShowPayModal] = useState(false);
  const [payments,     setPayments]     = useState([]);
  const [loadingPay,   setLoadingPay]   = useState(false);

  // BUG FIX: Month navigation for the schedule tab (bounded, not infinite)
  const [scheduleMonth, setScheduleMonth] = useState(new Date());

  // BUG FIX: Accurate class counts computed from bookings, not from stale trainer doc fields.
  // A class "counts" for the trainer if it:
  //   1. Is assigned to this trainer
  //   2. Was not cancelled
  //   3. Has at least 1 confirmed booking (otherwise it was an empty class)
  // We count from the bookings collection grouped by (classId + weekOf).
  const [classCounts, setClassCounts] = useState({ thisMonth: 0, allTime: 0, loading: true });

  useEffect(() => {
    async function computeClassCounts() {
      try {
        // Get all class IDs for this trainer
        const trainerClassIds = classes
          .filter(c => c.trainer === trainer.name && c.status !== 'cancelled')
          .map(c => c.id);

        if (trainerClassIds.length === 0) {
          setClassCounts({ thisMonth: 0, allTime: 0, loading: false });
          return;
        }

        // Firestore 'in' queries support max 30 items — batch if needed
        const batchSize = 30;
        const batches   = [];
        for (let i = 0; i < trainerClassIds.length; i += batchSize) {
          batches.push(trainerClassIds.slice(i, i + batchSize));
        }

        let allBookings = [];
        for (const batch of batches) {
          const q    = query(collection(db, 'bookings'), where('classId', 'in', batch), where('status', '==', 'confirmed'));
          const snap = await getDocs(q);
          allBookings = allBookings.concat(snap.docs.map(d => d.data()));
        }

        // Deduplicate: each unique (classId + weekOf) pair = 1 class occurrence that ran
        const uniqueOccurrences = new Set(allBookings.map(b => `${b.classId}__${b.weekOf}`));

        const now       = new Date();
        const thisMonth = format(now, 'yyyy-MM');
        let thisMonthCount = 0;

        uniqueOccurrences.forEach(key => {
          const weekOf = key.split('__')[1]; // 'yyyy-MM-dd'
          if (weekOf && weekOf.startsWith(thisMonth)) {
            thisMonthCount++;
          }
        });

        setClassCounts({
          thisMonth: thisMonthCount,
          allTime:   uniqueOccurrences.size,
          loading:   false,
        });
      } catch (err) {
        console.error('Error computing class counts:', err);
        setClassCounts({ thisMonth: 0, allTime: 0, loading: false });
      }
    }

    computeClassCounts();
  }, [trainer.id, trainer.name, classes]);

  const totalRatings = Object.values(trainer.ratingBreakdown || {}).reduce((a, b) => a + b, 0);

  async function loadPayments() {
    setLoadingPay(true);
    try {
      const q    = query(collection(db, 'trainer_payments'), where('trainerId', '==', trainer.id), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setPayments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error(err); }
    finally { setLoadingPay(false); }
  }

  function handleTabChange(t) {
    setTab(t);
    if (t === 'payments' && payments.length === 0) loadPayments();
  }

  // BUG FIX: Resolve this trainer's classes for the selected month only.
  // This gives a bounded list (4–5 occurrences per recurring class per month)
  // instead of an infinite list.
  const monthClasses = resolveClassesForMonth(classes, scheduleMonth)
    .filter(c => c.trainer === trainer.name);

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(42,26,14,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
        <div style={{ background: '#FAF7F2', borderRadius: 18, width: '100%', maxWidth: 520, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(61,35,20,0.18)', border: '1px solid #E0D5C1' }} onClick={e => e.stopPropagation()}>

          {/* Header */}
          <div style={{ padding: '22px 24px 0', borderBottom: '1px solid #E0D5C1' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#C4AE8F', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Cormorant Garant',serif", fontSize: '1.2rem', color: '#3D2314', fontWeight: 600, flexShrink: 0 }}>
                  {trainer.avatar}
                </div>
                <div>
                  <div style={{ fontFamily: "'Cormorant Garant',serif", fontSize: '1.4rem', fontWeight: 500, color: '#3D2314' }}>{trainer.name}</div>
                  <div style={{ fontSize: '0.8rem', color: '#9C8470', marginTop: 2 }}>{trainer.specialty} · {trainer.phone}</div>
                  {trainer.email && <div style={{ fontSize: '0.75rem', color: '#9C8470', marginTop: 1 }}>{trainer.email}</div>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <Stars rating={trainer.avgRating || 0} />
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#3D2314' }}>{trainer.avgRating || 0}</span>
                    <span style={{ fontSize: '0.72rem', color: '#9C8470' }}>({trainer.totalRatings || 0} ratings)</span>
                  </div>
                </div>
              </div>
              <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9C8470', padding: 4 }}><X size={18} /></button>
            </div>
            <div style={{ display: 'flex' }}>
              {['overview', 'payments', 'schedule'].map(t => (
                <button key={t} onClick={() => handleTabChange(t)} style={{ padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: tab === t ? 500 : 400, color: tab === t ? '#3D2314' : '#9C8470', borderBottom: tab === t ? '2px solid #3D2314' : '2px solid transparent', fontFamily: "'DM Sans',sans-serif", textTransform: 'capitalize', transition: 'all 0.2s' }}>{t}</button>
              ))}
            </div>
          </div>

          <div style={{ padding: '20px 24px 24px' }}>

            {/* OVERVIEW */}
            {tab === 'overview' && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 20 }}>
                  {[
                    // BUG FIX: Use live-computed counts from bookings, not stale trainer doc fields
                    { icon: Calendar,   label: 'This Month', val: classCounts.loading ? '…' : classCounts.thisMonth, unit: 'classes' },
                    { icon: TrendingUp, label: 'All Time',   val: classCounts.loading ? '…' : classCounts.allTime,   unit: 'classes' },
                    { icon: Star,       label: 'Avg Rating', val: trainer.avgRating || '—', unit: '/ 5.0' },
                  ].map(({ icon: Icon, label, val, unit }) => (
                    <div key={label} style={{ background: '#F5F0E8', borderRadius: 10, padding: '12px 14px', border: '1px solid #E0D5C1', textAlign: 'center' }}>
                      <Icon size={14} color='#A0673A' style={{ marginBottom: 6 }} />
                      <div style={{ fontFamily: "'Cormorant Garant',serif", fontSize: '1.6rem', fontWeight: 500, color: '#3D2314', lineHeight: 1 }}>{val}</div>
                      <div style={{ fontSize: '0.65rem', color: '#9C8470', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 3 }}>{label}</div>
                      <div style={{ fontSize: '0.7rem', color: '#A0673A', marginTop: 1 }}>{unit}</div>
                    </div>
                  ))}
                </div>

                {/* Payroll note */}
                <div style={{ background: '#EEF3E6', border: '1px solid #C8D9B0', borderRadius: 8, padding: '10px 14px', fontSize: '0.8rem', color: '#4E6A2E', marginBottom: 16 }}>
                  <strong>Class counts</strong> are computed from confirmed bookings — only classes with at least 1 confirmed attendee are counted. This ensures payroll accuracy.
                </div>

                <div style={{ background: '#F5F0E8', borderRadius: 12, padding: '16px 18px', border: '1px solid #E0D5C1', marginBottom: 20 }}>
                  <div style={{ fontFamily: "'Cormorant Garant',serif", fontSize: '1rem', color: '#3D2314', marginBottom: 12 }}>Rating Breakdown</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontFamily: "'Cormorant Garant',serif", fontSize: '2.8rem', fontWeight: 500, color: '#3D2314', lineHeight: 1 }}>{trainer.avgRating || '—'}</div>
                      <Stars rating={trainer.avgRating || 0} size={14} />
                      <div style={{ fontSize: '0.72rem', color: '#9C8470', marginTop: 4 }}>{totalRatings} ratings</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      {[5, 4, 3, 2, 1].map(n => (
                        <RatingBar key={n} label={n} count={(trainer.ratingBreakdown || {})[n] || 0} total={totalRatings} />
                      ))}
                    </div>
                  </div>
                </div>
                <div style={{ background: '#F5F1E0', border: '1px solid #DDD0A0', borderRadius: 8, padding: '10px 14px', fontSize: '0.8rem', color: '#7A6020', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Star size={13} /> Individual client ratings are anonymous and not shown to trainers.
                </div>
              </div>
            )}

            {/* PAYMENTS */}
            {tab === 'payments' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <span style={{ fontFamily: "'Cormorant Garant',serif", fontSize: '1rem', color: '#3D2314' }}>Payment History</span>
                  <button onClick={() => setShowPayModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', background: '#3D2314', color: '#F5F0E8', border: 'none', borderRadius: 8, fontFamily: "'DM Sans',sans-serif", fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer' }}>
                    <Plus size={13} /> Log Payment
                  </button>
                </div>
                {loadingPay ? (
                  <div style={{ textAlign: 'center', padding: '24px 0', color: '#C4AE8F', fontSize: '0.85rem' }}>Loading payments…</div>
                ) : payments.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px 0', color: '#9C8470', fontSize: '0.85rem' }}>No payments logged yet.</div>
                ) : payments.map((p, i) => (
                  <div key={p.id} style={{ background: '#F5F0E8', borderRadius: 12, border: '1px solid #E0D5C1', padding: '14px 16px', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <div>
                        <div style={{ fontFamily: "'Cormorant Garant',serif", fontSize: '1.3rem', fontWeight: 500, color: '#3D2314' }}>${p.amount}</div>
                        <div style={{ fontSize: '0.78rem', color: '#9C8470', marginTop: 2 }}>{p.date} · {p.method} · {p.sessions} sessions</div>
                      </div>
                      <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 500, background: '#EEF3E6', color: '#4E6A2E' }}>Paid</span>
                    </div>
                    {p.notes && <div style={{ fontSize: '0.78rem', color: '#9C8470' }}>{p.notes}</div>}
                  </div>
                ))}
              </div>
            )}

            {/* SCHEDULE — BUG FIX: Shows only the selected month, with month navigation.
                Recurring classes expand into at most 4-5 occurrences per month,
                so the list is always bounded and accurate for payroll reference. */}
            {tab === 'schedule' && (
              <div>
                {/* Month navigator */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <button
                    onClick={() => setScheduleMonth(m => subMonths(m, 1))}
                    style={{ width: 30, height: 30, borderRadius: '50%', background: '#FAF7F2', border: '1.5px solid #E0D5C1', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6B5744' }}
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <span style={{ fontFamily: "'Cormorant Garant',serif", fontSize: '1.1rem', color: '#3D2314', fontWeight: 500 }}>
                    {format(scheduleMonth, 'MMMM yyyy')}
                  </span>
                  <button
                    onClick={() => setScheduleMonth(m => addMonths(m, 1))}
                    style={{ width: 30, height: 30, borderRadius: '50%', background: '#FAF7F2', border: '1.5px solid #E0D5C1', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6B5744' }}
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>

                {/* Class count summary for this month */}
                <div style={{ background: '#F5F0E8', borderRadius: 8, padding: '10px 14px', border: '1px solid #E0D5C1', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.82rem', color: '#6B5744' }}>Scheduled classes this month</span>
                  <span style={{ fontFamily: "'Cormorant Garant',serif", fontSize: '1.2rem', fontWeight: 500, color: '#3D2314' }}>{monthClasses.length}</span>
                </div>

                {monthClasses.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px 0', color: '#C4AE8F', fontSize: '0.85rem' }}>
                    No classes scheduled for {format(scheduleMonth, 'MMMM yyyy')}.
                  </div>
                ) : monthClasses.map((c, i) => {
                  const classDate = c.date ? new Date(c.date + 'T12:00:00') : null;
                  return (
                    <div key={c.id + (c._occurrenceDate || '') + i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: i < monthClasses.length - 1 ? '1px solid #E0D5C1' : 'none' }}>
                      <div style={{ textAlign: 'center', minWidth: 50 }}>
                        {classDate && (
                          <>
                            <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: '#9C8470' }}>{format(classDate, 'EEE')}</div>
                            <div style={{ fontFamily: "'Cormorant Garant',serif", fontSize: '1rem', fontWeight: 500, color: '#3D2314', lineHeight: 1 }}>
                              {format(classDate, 'MMM d')}
                            </div>
                          </>
                        )}
                      </div>
                      <div style={{ width: 1.5, height: 40, background: '#E0D5C1', flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, fontSize: '0.9rem', color: '#2A1A0E' }}>{c.name}</div>
                        <div style={{ fontSize: '0.76rem', color: '#9C8470', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Clock size={11} /> {c.time}
                          {c.isRecurring && <span style={{ marginLeft: 4, fontSize: '0.65rem', background: '#EEF3E6', color: '#4E6A2E', padding: '1px 6px', borderRadius: 10 }}>Recurring</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', color: '#6B5744' }}>
                        {c.isRecurring ? (
                          // Recurring rule's `booked` is a cumulative total across all weeks —
                          // it doesn't reflect any single occurrence. Show capacity only.
                          <span style={{ fontSize: '0.72rem', color: '#9C8470' }}>cap {c.capacity}</span>
                        ) : (
                          <>
                            <span style={{ fontFamily: "'Cormorant Garant',serif", fontSize: '1.1rem', color: '#3D2314' }}>{c.booked || 0}</span>
                            <span style={{ fontSize: '0.72rem', color: '#9C8470' }}>cap {c.capacity}</span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      {showPayModal && <LogPaymentModal trainer={trainer} onClose={() => setShowPayModal(false)} onSaved={loadPayments} />}
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function AdminTrainers() {
  const [selected,     setSelected]     = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  // Live booking-based counts keyed by trainer name: { [name]: { thisMonth, allTime } }
  const [liveCounts,   setLiveCounts]   = useState({});

  const { trainers, loading } = useTrainers();
  const { classes } = useClasses();

  // Compute accurate class counts from bookings for every trainer — same logic as TrainerModal.
  useEffect(() => {
    if (!trainers.length || !classes.length) return;

    async function computeAllCounts() {
      const thisMonth = format(new Date(), 'yyyy-MM');
      const result    = {};

      for (const trainer of trainers) {
        const trainerClassIds = classes
          .filter(c => c.trainer === trainer.name && c.status !== 'cancelled')
          .map(c => c.id);

        if (trainerClassIds.length === 0) {
          result[trainer.name] = { thisMonth: 0, allTime: 0 };
          continue;
        }

        // Firestore 'in' supports max 30 — batch if needed
        const batchSize  = 30;
        let allBookings  = [];
        for (let i = 0; i < trainerClassIds.length; i += batchSize) {
          const batch = trainerClassIds.slice(i, i + batchSize);
          const q     = query(collection(db, 'bookings'), where('classId', 'in', batch), where('status', '==', 'confirmed'));
          const snap  = await getDocs(q);
          allBookings = allBookings.concat(snap.docs.map(d => d.data()));
        }

        // Each unique classId+weekOf pair = one class occurrence that actually ran
        const uniqueOccurrences = new Set(allBookings.map(b => `${b.classId}__${b.weekOf}`));
        let thisMonthCount = 0;
        uniqueOccurrences.forEach(key => {
          const weekOf = key.split('__')[1];
          if (weekOf && weekOf.startsWith(thisMonth)) thisMonthCount++;
        });

        result[trainer.name] = { thisMonth: thisMonthCount, allTime: uniqueOccurrences.size };
      }

      setLiveCounts(result);
    }

    computeAllCounts();
  }, [trainers, classes]);

  return (
    <div style={{ padding: '28px 32px 40px' }}>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
        <button onClick={() => setShowAddModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#3D2314', color: '#F5F0E8', border: 'none', borderRadius: 8, fontFamily: "'DM Sans',sans-serif", fontSize: '0.84rem', fontWeight: 500, cursor: 'pointer' }}>
          <Plus size={15} /> Add Trainer
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#C4AE8F', fontSize: '0.88rem' }}>Loading trainers…</div>
      ) : trainers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#9C8470', fontSize: '0.88rem' }}>No trainers yet. Add your first trainer!</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 28 }} className="trainers-resp">
          {trainers.map(t => (
            <div key={t.id} onClick={() => setSelected(t)}
              style={{ background: '#FAF7F2', borderRadius: 14, border: '1px solid #E0D5C1', boxShadow: '0 2px 16px rgba(61,35,20,0.10)', padding: 22, cursor: 'pointer', transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 24px rgba(61,35,20,0.14)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 2px 16px rgba(61,35,20,0.10)'; e.currentTarget.style.transform = ''; }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#C4AE8F', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Cormorant Garant',serif", fontSize: '1.1rem', color: '#3D2314', fontWeight: 600, flexShrink: 0 }}>{t.avatar}</div>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.95rem', color: '#2A1A0E' }}>{t.name}</div>
                  <div style={{ fontSize: '0.75rem', color: '#9C8470', marginTop: 1 }}>{t.specialty}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <Stars rating={t.avgRating || 0} />
                <span style={{ fontFamily: "'Cormorant Garant',serif", fontSize: '1.1rem', fontWeight: 500, color: '#3D2314' }}>{t.avgRating || '—'}</span>
                <span style={{ fontSize: '0.72rem', color: '#9C8470' }}>({t.totalRatings || 0})</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                {[
                  { icon: Calendar,   label: 'This month', val: liveCounts[t.name] != null ? `${liveCounts[t.name].thisMonth} classes` : '… classes' },
                  { icon: TrendingUp, label: 'All time',    val: liveCounts[t.name] != null ? `${liveCounts[t.name].allTime} classes`   : '… classes' },
                ].map(({ icon: Icon, label, val }) => (
                  <div key={label} style={{ background: '#F5F0E8', borderRadius: 8, padding: '8px 10px', border: '1px solid #E0D5C1' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.68rem', color: '#9C8470', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}><Icon size={11} />{label}</div>
                    <div style={{ fontSize: '0.84rem', fontWeight: 500, color: '#2A1A0E' }}>{val}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid #E0D5C1' }}>
                <span style={{ fontSize: '0.8rem', color: '#A0673A', fontWeight: 500 }}>View Profile</span>
                <ChevronRight size={15} color='#A0673A' />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* BUG FIX: Pass classes to TrainerModal instead of pre-resolving for one week */}
      {selected     && <TrainerModal trainer={selected} classes={classes} onClose={() => setSelected(null)} />}
      {showAddModal && <AddTrainerModal onClose={() => setShowAddModal(false)} />}

      <style>{`@media (max-width:700px) { .trainers-resp { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}