import { useState, useEffect } from 'react';
import { Search, Plus, X, Phone, Gift, Package, Clock, ChevronRight, AlertTriangle, Snowflake, MessageSquare, FileText, CheckCircle, AlertCircle, Edit2, Calendar } from 'lucide-react';
import { useClients } from '../../hooks/useClients';
import { useExpenses } from '../../hooks/useExpenses';
import { useAttendance } from '../../hooks/useAttendance';
import { db } from '../../firebase/config';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import toast from 'react-hot-toast';

const PACKAGES = [
  { label: 'No Package',               name: '',                  sessionsTotal: 0,    price: 0   },
  { label: 'first Session — $10',      name: 'first Session',     sessionsTotal: 1,    price: 10  },
  { label: 'Single Session — $15',     name: 'Single Session',    sessionsTotal: 1,    price: 15  },
  { label: '4-Session Pack — $55',     name: '4-Session Pack',    sessionsTotal: 4,    price: 55  },
  { label: '8-Session Pack — $95',     name: '8-Session Pack',    sessionsTotal: 8,    price: 95  },
  { label: '12-Session Pack — $130',   name: '12-Session Pack',   sessionsTotal: 12,   price: 130 },
  { label: 'Monthly Unlimited — $160', name: 'Monthly Unlimited', sessionsTotal: null, price: 160 },
  { label: 'Custom…',                  name: '__custom__',        sessionsTotal: null, price: 0   },
];

const STATUS_FILTERS = ['All', 'Active', 'Low Sessions', 'Expiring Soon', 'Frozen', 'Unpaid'];

function statusStyle(status) {
  if (status === 'active')   return { bg: '#EEF3E6', color: '#4E6A2E', label: 'Active' };
  if (status === 'low')      return { bg: '#F5F1E0', color: '#7A6020', label: 'Low Sessions' };
  if (status === 'expiring') return { bg: '#F7EDED', color: '#8C3A3A', label: 'Expiring Soon' };
  if (status === 'frozen')   return { bg: '#EDF0F6', color: '#3A5A8C', label: 'Frozen' };
  if (status === 'expired')  return { bg: '#F7EDED', color: '#8C3A3A', label: 'Expired' };
  return { bg: '#F0EAE3', color: '#3D2314', label: status };
}

function historyStatusStyle(s) {
  if (s === 'attended')  return { color: '#4E6A2E', bg: '#EEF3E6' };
  if (s === 'cancelled') return { color: '#7A6020', bg: '#F5F1E0' };
  if (s === 'no-show')   return { color: '#8C3A3A', bg: '#F7EDED' };
  return { color: '#9C8470', bg: '#F0EAE3' };
}

function calcExpiry(purchaseDate, pkgName) {
  if (!purchaseDate) return '';
  const d = new Date(purchaseDate);
  d.setMonth(d.getMonth() + (pkgName === 'Monthly Unlimited' ? 1 : 2));
  return d.toISOString().split('T')[0];
}

// ── Confirm Dialog ─────────────────────────────────────────────
function ConfirmDialog({ title, message, confirmLabel = 'Confirm', danger = false, onConfirm, onCancel }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(42,26,14,0.65)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#FAF7F2', borderRadius: 16, maxWidth: 360, width: '100%', padding: 24, border: '1px solid #E0D5C1', boxShadow: '0 8px 32px rgba(61,35,20,0.18)' }}>
        <div style={{ fontFamily: "'Cormorant Garant',serif", fontSize: '1.25rem', fontWeight: 500, color: '#3D2314', marginBottom: 10 }}>{title}</div>
        <div style={{ fontSize: '0.88rem', color: '#6B5744', marginBottom: 22, lineHeight: 1.5 }}>{message}</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: '11px', background: '#F5F0E8', border: '1.5px solid #E0D5C1', borderRadius: 8, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", fontSize: '0.88rem', color: '#6B5744' }}>Cancel</button>
          <button onClick={onConfirm} style={{ flex: 1, padding: '11px', background: danger ? '#8C3A3A' : '#3D2314', color: '#F5F0E8', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", fontSize: '0.88rem', fontWeight: 500 }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ── New Client Modal ──────────────────────────────────────────
function NewClientModal({ onClose, addClient }) {
  const [form, setForm]     = useState({ name:'', phone:'', email:'', dob:'', pkg: PACKAGES[0].label, method:'Cash', notes:'' });
  const [custom, setCustom] = useState({ name:'', sessions:'', price:'' });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const isNoPkg   = form.pkg === 'No Package';
  const isCustom  = form.pkg === 'Custom…';

  async function handleCreate() {
    if (!form.name.trim())  return toast.error('Name is required.');
    if (!form.phone.trim()) return toast.error('Phone is required.');

    // Resolve package
    let pkgName, sessionsTotal;
    if (isNoPkg) {
      pkgName = ''; sessionsTotal = 0;
    } else if (isCustom) {
      if (!custom.name.trim()) return toast.error('Custom package name is required.');
      pkgName      = custom.name.trim();
      sessionsTotal = custom.sessions === '' ? null : parseInt(custom.sessions, 10);
    } else {
      const selectedPkg = PACKAGES.find(p => p.label === form.pkg) || PACKAGES[1];
      pkgName      = selectedPkg.name;
      sessionsTotal = selectedPkg.sessionsTotal;
    }

    const purchaseDate = isNoPkg ? null : new Date().toISOString().split('T')[0];
    const expiry       = isNoPkg ? null : calcExpiry(purchaseDate, pkgName);
    const avatar       = form.name.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    setSaving(true);
    try {
      await addClient({
        name: form.name.trim(), phone: form.phone.trim(),
        dob: form.dob, birthday: form.dob,
        email: form.email.trim(), avatar,
        pkg: pkgName,
        sessionsTotal,
        sessionsRemaining: sessionsTotal,
        sessionsUsed: 0, cancelledSessions: 0,
        purchaseDate, expiry,
        paymentMethod: isNoPkg ? null : form.method,
        paymentVerified: isNoPkg ? true : (form.method === 'Cash' || form.method === 'Whish' ? false : true),
        status: 'active', isFrozen: false, frozenUntil: null, freezeStartDate: null,
        notes: form.notes.trim(), history: [],
      });
      toast.success(`${form.name} added!`);
      onClose();
    } catch (err) { toast.error('Failed to create client.'); console.error(err); }
    finally { setSaving(false); }
  }

  return (
    <Overlay onClose={onClose}>
      <ModalHeader title="New Client" onClose={onClose} />
      <div style={{ padding: '20px 24px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <Field label="Full Name" span={2}><input style={inp} placeholder="e.g. Lara Nassar" value={form.name} onChange={e => set('name', e.target.value)} /></Field>
          <Field label="Phone (WhatsApp)"><input style={inp} placeholder="+961 70 000 000" value={form.phone} onChange={e => set('phone', e.target.value)} /></Field>
          <Field label="Date of Birth">
            <input style={inp} type="date" min="1980-01-01" max="2020-12-31" value={form.dob} onChange={e => set('dob', e.target.value)} />
          </Field>
          <Field label="Email" span={2}><input style={inp} type="email" placeholder="optional" value={form.email} onChange={e => set('email', e.target.value)} /></Field>
          <Field label="Package" span={2}>
            <select style={inp} value={form.pkg} onChange={e => set('pkg', e.target.value)}>
              {PACKAGES.map(p => <option key={p.label}>{p.label}</option>)}
            </select>
          </Field>

          {/* Custom package fields */}
          {isCustom && (
            <>
              <Field label="Package Name" span={2}>
                <input style={inp} placeholder="e.g. 6-Session Pack" value={custom.name} onChange={e => setCustom(p => ({ ...p, name: e.target.value }))} />
              </Field>
              <Field label="Number of Sessions">
                <input style={inp} type="number" min="1" placeholder="e.g. 6 (leave blank for unlimited)" value={custom.sessions} onChange={e => setCustom(p => ({ ...p, sessions: e.target.value }))} />
              </Field>
              <Field label="Price ($)">
                <input style={inp} type="number" min="0" placeholder="e.g. 75" value={custom.price} onChange={e => setCustom(p => ({ ...p, price: e.target.value }))} />
              </Field>
            </>
          )}

          {/* Payment method — hide when no package */}
          {!isNoPkg && (
            <Field label="Payment Method" span={2}>
              <div style={{ display: 'flex', gap: 8 }}>
                {['Cash', 'Whish'].map(m => (
                  <button key={m} onClick={() => set('method', m)} style={{ flex:1, padding:'10px', borderRadius:8, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", fontSize:'0.84rem', fontWeight:500, background: form.method===m ? '#3D2314':'#F5F0E8', color: form.method===m ? '#F5F0E8':'#6B5744', border:`1.5px solid ${form.method===m ? '#3D2314':'#E0D5C1'}`, transition:'all 0.18s' }}>
                    {m === 'Whish' ? '📱 Whish' : '💵 Cash'}
                  </button>
                ))}
              </div>
            </Field>
          )}

          <Field label="Notes" span={2}><input style={inp} placeholder="e.g. Knee injury, prefers mornings…" value={form.notes} onChange={e => set('notes', e.target.value)} /></Field>
        </div>

        {!isNoPkg && (form.method === 'Cash' || form.method === 'Whish') && (
          <div style={{ background:'#F5F1E0', border:'1px solid #DDD0A0', borderRadius:8, padding:'10px 14px', fontSize:'0.8rem', color:'#7A6020', marginBottom:12, display:'flex', alignItems:'center', gap:8 }}>
            <AlertCircle size={13}/> Payment via {form.method} — admin must verify payment manually.
          </div>
        )}
        {isNoPkg && (
          <div style={{ background:'#F0EAE3', border:'1px solid #E0D5C1', borderRadius:8, padding:'10px 14px', fontSize:'0.8rem', color:'#6B5744', marginBottom:12 }}>
            ℹ️ Client will be created without a package. You can assign one later from their profile.
          </div>
        )}

        <button style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }} onClick={handleCreate} disabled={saving}>
          {saving ? 'Creating…' : 'Create Client'}
        </button>
      </div>
    </Overlay>
  );
}

// ── Client Detail Modal ───────────────────────────────────────
function ClientModal({ client, onClose, updateClient, freezeClient, unfreezeClient, renewPackage, verifyPayment, updatePackageExpiry, addExpense }) {
  const [tab,          setTab]          = useState('profile');
  const [freezeStart,  setFreezeStart]  = useState('');
  const [freezeEnd,    setFreezeEnd]    = useState('');
  const [renewPkg,     setRenewPkg]     = useState(PACKAGES[1].label); // default: first Session
  const [renewMethod,  setRenewMethod]  = useState('Cash');
  const [renewCustom,  setRenewCustom]  = useState({ name:'', sessions:'', price:'' });
  const [saving,       setSaving]       = useState(false);
  const [history,      setHistory]      = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showPaidConfirm, setShowPaidConfirm] = useState(false);

  const isRenewCustom = renewPkg === 'Custom…';

  // Edit fields
  const [editMode,     setEditMode]     = useState(false);
  const [editForm,     setEditForm]     = useState({ name: client.name, phone: client.phone, email: client.email || '', dob: client.dob || client.birthday || '', notes: client.notes || '' });

  // Expiry edit
  const [editingExpiry, setEditingExpiry] = useState(false);
  const [newExpiry,      setNewExpiry]    = useState(client.expiry || '');

  const st     = client.isFrozen ? statusStyle('frozen') : statusStyle(client.status);
  const barPct = client.sessionsTotal ? Math.round((client.sessionsRemaining / client.sessionsTotal) * 100) : null;
  const waLink = (msg) => `https://wa.me/${client.phone?.replace(/\D/g,'')}?text=${encodeURIComponent(msg)}`;

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const q    = query(collection(db, 'attendance'), where('clientId', '==', client.id), orderBy('date', 'desc'));
      const snap = await getDocs(q);
      const records = await Promise.all(snap.docs.map(async d => {
        const data = d.data();
        let className = '—';
        if (data.classId) {
          const clsSnap = await getDocs(query(collection(db, 'classes'), where('__name__', '==', data.classId)));
          if (!clsSnap.empty) className = clsSnap.docs[0].data().name;
        }
        return { ...data, className };
      }));
      setHistory(records);
    } catch (err) { console.error(err); }
    finally { setLoadingHistory(false); }
  }

  function handleTabChange(t) {
    setTab(t);
    if (t === 'history' && history.length === 0) loadHistory();
  }

  async function handleFreeze() {
    if (!freezeStart) return toast.error('Please select a start date.');
    if (!freezeEnd)   return toast.error('Please select an end date.');
    const start = new Date(freezeStart), end = new Date(freezeEnd);
    if (end <= start) return toast.error('End date must be after start date.');
    if ((end - start) / (1000 * 60 * 60 * 24) > 60) return toast.error('Freeze cannot exceed 2 months.');
    setSaving(true);
    try { await freezeClient(client.id, freezeStart, freezeEnd); toast.success('Subscription frozen.'); onClose(); }
    catch { toast.error('Failed to freeze.'); }
    finally { setSaving(false); }
  }

  async function handleUnfreeze() {
    setSaving(true);
    try { await unfreezeClient(client.id); toast.success('Subscription unfrozen.'); onClose(); }
    catch { toast.error('Failed to unfreeze.'); }
    finally { setSaving(false); }
  }

  async function handleRenew() {
    let pkgName, sessionsTotal;
    if (isRenewCustom) {
      if (!renewCustom.name.trim()) return toast.error('Custom package name is required.');
      pkgName      = renewCustom.name.trim();
      sessionsTotal = renewCustom.sessions === '' ? null : parseInt(renewCustom.sessions, 10);
    } else {
      const selectedPkg = PACKAGES.find(p => p.label === renewPkg) || PACKAGES[1];
      pkgName      = selectedPkg.name;
      sessionsTotal = selectedPkg.sessionsTotal;
    }
    const purchaseDate = new Date().toISOString().split('T')[0];
    const expiry       = calcExpiry(purchaseDate, pkgName);
    setSaving(true);
    try {
      await renewPackage(client.id, { name: pkgName, sessionsTotal, purchaseDate, expiry, paymentMethod: renewMethod });
      toast.success('Package renewed!'); onClose();
    } catch { toast.error('Failed to renew.'); }
    finally { setSaving(false); }
  }

  // BUG FIX: Mark as paid AND write a matching income entry to the expenses collection
  // so it shows up on the Finance page automatically.
  async function doVerifyPayment() {
    setSaving(true);
    try {
      await verifyPayment(client.id);

      // Look up the package price from the PACKAGES list
      const pkg    = PACKAGES.find(p => p.name === client.pkg);
      const amount = pkg?.price || 0;

      // Write income entry — negative amount matches AdminFinance convention
      if (amount > 0) {
        await addExpense({
          category:    'Income',
          description: `${client.name} — ${client.pkg}`,
          amount:      -amount,
          method:      client.paymentMethod || 'Cash',
          date:        new Date().toISOString().split('T')[0],
          isIncome:    true,
          clientId:    client.id,
        });
      }

      toast.success('Payment verified & income recorded!');
      setShowPaidConfirm(false);
    } catch {
      toast.error('Failed to verify payment.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit() {
    if (!editForm.name.trim()) return toast.error('Name is required.');
    setSaving(true);
    try {
      const avatar = editForm.name.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
      await updateClient(client.id, { ...editForm, avatar });
      toast.success('Client updated!');
      setEditMode(false);
      onClose();
    } catch { toast.error('Failed to update client.'); }
    finally { setSaving(false); }
  }

  async function handleSaveExpiry() {
    if (!newExpiry) return toast.error('Please select a date.');
    setSaving(true);
    try { await updatePackageExpiry(client.id, newExpiry); toast.success('Expiry date updated!'); setEditingExpiry(false); }
    catch { toast.error('Failed to update expiry.'); }
    finally { setSaving(false); }
  }

  return (
    <Overlay onClose={onClose}>
      {/* Header */}
      <div style={{ padding:'22px 24px 0', borderBottom:'1px solid #E0D5C1' }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:14 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:44, height:44, borderRadius:'50%', background:'#C4AE8F', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Cormorant Garant',serif", fontSize:'1.1rem', color:'#3D2314', fontWeight:600, flexShrink:0 }}>
              {client.avatar}
            </div>
            <div>
              <div style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'1.35rem', fontWeight:500, color:'#3D2314' }}>{client.name}</div>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:3, flexWrap:'wrap' }}>
                <span style={{ fontSize:'0.78rem', color:'#9C8470' }}>{client.phone}</span>
                <span style={{ padding:'2px 8px', borderRadius:20, fontSize:'0.7rem', fontWeight:500, background: st.bg, color: st.color }}>
                  {client.isFrozen ? '❄ Frozen' : st.label}
                </span>
                {!client.paymentVerified && client.pkg && (
                  <span style={{ padding:'2px 8px', borderRadius:20, fontSize:'0.7rem', fontWeight:500, background:'#F7EDED', color:'#8C3A3A' }}>⚠ Unpaid</span>
                )}
              </div>
            </div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => setEditMode(true)} style={{ background:'#F5F0E8', border:'1.5px solid #E0D5C1', borderRadius:8, padding:'5px 10px', cursor:'pointer', display:'flex', alignItems:'center', gap:4, fontSize:'0.76rem', color:'#6B5744', fontFamily:"'DM Sans',sans-serif" }}>
              <Edit2 size={12}/> Edit
            </button>
            <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#9C8470', padding:4 }}><X size={18}/></button>
          </div>
        </div>
        <div style={{ display:'flex' }}>
          {['profile','history','actions'].map(t => (
            <button key={t} onClick={() => handleTabChange(t)} style={{ padding:'10px 16px', background:'none', border:'none', cursor:'pointer', fontSize:'0.82rem', fontWeight: tab===t?500:400, color: tab===t?'#3D2314':'#9C8470', borderBottom: tab===t?'2px solid #3D2314':'2px solid transparent', fontFamily:"'DM Sans',sans-serif", textTransform:'capitalize', transition:'all 0.2s' }}>{t}</button>
          ))}
        </div>
      </div>

      <div style={{ padding:'20px 24px 24px', maxHeight:'60vh', overflowY:'auto' }}>

        {/* EDIT MODE */}
        {editMode && (
          <div>
            <div style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'1rem', color:'#3D2314', marginBottom:14 }}>Edit Client Info</div>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <Field label="Full Name"><input style={inp} value={editForm.name} onChange={e => setEditForm(p=>({...p,name:e.target.value}))}/></Field>
              <Field label="Phone"><input style={inp} value={editForm.phone} onChange={e => setEditForm(p=>({...p,phone:e.target.value}))}/></Field>
              <Field label="Email"><input style={inp} type="email" value={editForm.email} onChange={e => setEditForm(p=>({...p,email:e.target.value}))}/></Field>
              <Field label="Date of Birth">
                <input style={inp} type="date" min="1980-01-01" max="2020-12-31" value={editForm.dob} onChange={e => setEditForm(p=>({...p,dob:e.target.value}))}/>
              </Field>
              <Field label="Notes"><input style={inp} value={editForm.notes} onChange={e => setEditForm(p=>({...p,notes:e.target.value}))}/></Field>
            </div>
            <div style={{ display:'flex', gap:8, marginTop:16 }}>
              <button onClick={() => setEditMode(false)} style={{ flex:1, padding:'11px', background:'#F5F0E8', border:'1.5px solid #E0D5C1', borderRadius:8, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", fontSize:'0.88rem', color:'#6B5744' }}>Cancel</button>
              <button onClick={handleSaveEdit} disabled={saving} style={{ flex:2, ...btnPrimary, opacity:saving?0.6:1 }}>{saving?'Saving…':'Save Changes'}</button>
            </div>
          </div>
        )}

        {/* PROFILE */}
        {!editMode && tab === 'profile' && (
          <div>
            {/* Payment alert with CONFIRM DIALOG */}
            {!client.paymentVerified && client.pkg && (
              <div style={{ background:'#F7EDED', border:'1px solid #DDB0B0', borderRadius:8, padding:'10px 14px', fontSize:'0.84rem', color:'#8C3A3A', display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}><AlertCircle size={14}/> Payment pending verification</div>
                <button onClick={() => setShowPaidConfirm(true)} disabled={saving} style={{ padding:'4px 10px', background:'#3D2314', color:'#F5F0E8', border:'none', borderRadius:6, fontSize:'0.75rem', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                  Mark Paid
                </button>
              </div>
            )}
            {client.paymentVerified && (
              <div style={{ background:'#EEF3E6', border:'1px solid #C8D9B0', borderRadius:8, padding:'10px 14px', fontSize:'0.84rem', color:'#4E6A2E', display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
                <CheckCircle size={14}/> Payment verified
              </div>
            )}

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:18 }}>
              {[
                { icon: Phone, label:'Phone',    val: client.phone || '—' },
                { icon: Gift,  label:'Birthday', val: client.dob || client.birthday || '—' },
              ].map(({ icon:Icon, label, val }) => (
                <div key={label} style={{ background:'#F5F0E8', borderRadius:8, padding:'10px 14px', border:'1px solid #E0D5C1' }}>
                  <div style={{ fontSize:'0.7rem', color:'#9C8470', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4, display:'flex', alignItems:'center', gap:5 }}><Icon size={11}/> {label}</div>
                  <div style={{ fontSize:'0.88rem', fontWeight:500, color:'#2A1A0E' }}>{val}</div>
                </div>
              ))}
            </div>

            {/* Package card */}
            <div style={{ background:'linear-gradient(135deg,#3D2314,#6B3D25)', borderRadius:14, padding:20, color:'#F5F0E8', marginBottom:18, position:'relative', overflow:'hidden' }}>
              <div style={{ position:'absolute', top:-30, right:-30, width:120, height:120, borderRadius:'50%', background:'rgba(245,240,232,0.07)' }}/>
              <div style={{ fontSize:'0.72rem', textTransform:'uppercase', letterSpacing:'0.12em', color:'#C4AE8F', marginBottom:4 }}>Current Package</div>
              <div style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'1.35rem', fontWeight:500, marginBottom:12 }}>{client.pkg || 'No package'}</div>
              {client.sessionsRemaining != null && (
                <>
                  <div style={{ display:'flex', alignItems:'baseline', gap:6, marginBottom:6 }}>
                    <span style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'2.5rem', fontWeight:500, lineHeight:1 }}>{client.sessionsRemaining}</span>
                    <span style={{ fontSize:'0.82rem', color:'#C4AE8F' }}>sessions remaining</span>
                  </div>
                  <div style={{ background:'rgba(245,240,232,0.15)', borderRadius:20, height:6, marginBottom:10 }}>
                    <div style={{ background:'#C4AE8F', height:6, borderRadius:20, width:`${barPct || 0}%`, transition:'width 0.4s' }}/>
                  </div>
                </>
              )}
              {/* Expiry with edit */}
              <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:'0.78rem', color:'#C4AE8F' }}>
                {editingExpiry ? (
                  <>
                    <input type="date" value={newExpiry} onChange={e => setNewExpiry(e.target.value)}
                      style={{ background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', borderRadius:6, padding:'4px 8px', color:'#F5F0E8', fontSize:'0.78rem', outline:'none' }}/>
                    <button onClick={handleSaveExpiry} disabled={saving} style={{ padding:'3px 10px', background:'#C4AE8F', color:'#3D2314', border:'none', borderRadius:6, fontSize:'0.74rem', cursor:'pointer', fontWeight:500 }}>{saving?'…':'Save'}</button>
                    <button onClick={() => setEditingExpiry(false)} style={{ padding:'3px 8px', background:'transparent', border:'1px solid rgba(255,255,255,0.3)', borderRadius:6, fontSize:'0.74rem', cursor:'pointer', color:'#C4AE8F' }}>×</button>
                  </>
                ) : (
                  <>
                    Purchased {client.purchaseDate || '—'} · Expires {client.expiry || '—'}
                    <button onClick={() => setEditingExpiry(true)} style={{ background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.25)', borderRadius:5, padding:'2px 7px', cursor:'pointer', fontSize:'0.7rem', color:'#F5F0E8', display:'flex', alignItems:'center', gap:3 }}>
                      <Edit2 size={10}/> Edit expiry
                    </button>
                  </>
                )}
              </div>
              {client.isFrozen && (
                <div style={{ marginTop:10, display:'flex', alignItems:'center', gap:6, fontSize:'0.8rem', color:'#A3C4F5' }}>
                  <Snowflake size={13}/> Frozen {client.freezeStartDate} → {client.frozenUntil}
                </div>
              )}
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:18 }}>
              {[
                { label:'Sessions Used',     val: client.sessionsUsed      || 0 },
                { label:'Cancellations',     val: client.cancelledSessions || 0 },
                { label:'Deducted Sessions', val: client.cancelledSessions || 0 },
              ].map(s => (
                <div key={s.label} style={{ background:'#F5F0E8', borderRadius:8, padding:'10px 12px', border:'1px solid #E0D5C1', textAlign:'center' }}>
                  <div style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'1.6rem', fontWeight:500, color:'#3D2314', lineHeight:1 }}>{s.val}</div>
                  <div style={{ fontSize:'0.68rem', color:'#9C8470', textTransform:'uppercase', letterSpacing:'0.08em', marginTop:4 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {client.notes && (
              <div style={{ background:'#F5F1E0', border:'1px solid #DDD0A0', borderRadius:8, padding:'10px 14px', fontSize:'0.84rem', color:'#7A6020', display:'flex', gap:8 }}>
                <AlertTriangle size={14} style={{ flexShrink:0, marginTop:1 }}/> {client.notes}
              </div>
            )}
          </div>
        )}

        {/* HISTORY */}
        {!editMode && tab === 'history' && (
          <div>
            <div style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'1rem', color:'#3D2314', marginBottom:12 }}>Session History</div>
            {loadingHistory ? (
              <div style={{ textAlign:'center', padding:'24px 0', color:'#C4AE8F', fontSize:'0.85rem' }}>Loading history…</div>
            ) : history.length === 0 ? (
              <p style={{ fontSize:'0.84rem', color:'#9C8470' }}>No session history yet.</p>
            ) : history.map((h, i) => {
              const hs = historyStatusStyle(h.status);
              return (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:14, padding:'11px 0', borderBottom: i < history.length-1 ? '1px solid #E0D5C1':'none' }}>
                  <div style={{ textAlign:'center', minWidth:40 }}>
                    <div style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'1.2rem', fontWeight:500, color:'#3D2314', lineHeight:1 }}>{h.date?.split('-')[2]}</div>
                    <div style={{ fontSize:'0.65rem', color:'#9C8470' }}>{h.date?.slice(0,7)}</div>
                  </div>
                  <div style={{ width:1.5, height:32, background:'#E0D5C1', flexShrink:0 }}/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:500, fontSize:'0.9rem', color:'#2A1A0E' }}>{h.className || h.classId}</div>
                    {h.clientName && <div style={{ fontSize:'0.76rem', color:'#9C8470', marginTop:1 }}>{h.clientName}</div>}
                  </div>
                  <span style={{ padding:'3px 10px', borderRadius:20, fontSize:'0.7rem', fontWeight:500, background:hs.bg, color:hs.color, textTransform:'capitalize' }}>{h.status}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* ACTIONS */}
        {!editMode && tab === 'actions' && (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <div style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'1rem', color:'#3D2314', marginBottom:4 }}>WhatsApp</div>
            {[
              { label:'Send Booking Confirmation', msg:`Hi ${client.name}! Your booking at Pilates Vibes is confirmed. Any changes must be made at least 24hrs in advance, otherwise a session will be deducted. See you soon! 🌿` },
              { label:'Send Session Reminder',     msg:`Hi ${client.name}! Reminder: you have a class tomorrow at Pilates Vibes. See you there! 🌿` },
              { label:'Low Sessions Alert',        msg:`Hi ${client.name}! Just a heads up — you have ${client.sessionsRemaining} session(s) remaining. Renew your package to keep going! 🌿` },
              { label:'Expiry Reminder',           msg:`Hi ${client.name}! Your Pilates Vibes package expires on ${client.expiry}. Reach out to renew! 🌿` },
              { label:'Payment Reminder',          msg:`Hi ${client.name}! We noticed your payment hasn't been confirmed yet. Please send ${client.paymentMethod === 'Whish' ? 'your Whish payment' : 'the cash'} to settle your package. Thank you! 🌿` },
            ].map((w, i) => (
              <a key={i} href={waLink(w.msg)} target="_blank" rel="noreferrer"
                style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'11px 14px', borderRadius:8, textDecoration:'none', background:'#F0FAF4', border:'1.5px solid #B8DFC8', color:'#1A5C35', fontSize:'0.84rem', fontWeight:500, transition:'opacity 0.2s' }}
                onMouseEnter={e=>e.currentTarget.style.opacity='0.8'}
                onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
                <span style={{ display:'flex', alignItems:'center', gap:8 }}><MessageSquare size={14}/> {w.label}</span>
                <ChevronRight size={13}/>
              </a>
            ))}

            <div style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'1rem', color:'#3D2314', marginTop:8, marginBottom:4 }}>Subscription</div>
            {!client.isFrozen ? (
              <div style={{ background:'linear-gradient(135deg,#EAF0E0,#F5F8EE)', border:'1.5px solid #A3B07E', borderRadius:12, padding:16 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                  <Snowflake size={15} color='#7C8C5E'/>
                  <span style={{ fontWeight:500, fontSize:'0.9rem', color:'#3D2314' }}>Freeze Subscription</span>
                </div>
                <p style={{ fontSize:'0.8rem', color:'#6B5744', marginBottom:12 }}>One-time freeze. Duration must be less than 2 months.</p>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
                  <div>
                    <label style={{ display:'block', fontSize:'0.72rem', color:'#6B5744', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>Start Date</label>
                    <input type="date" value={freezeStart} onChange={e => setFreezeStart(e.target.value)} style={{ ...inp, width:'100%' }}/>
                  </div>
                  <div>
                    <label style={{ display:'block', fontSize:'0.72rem', color:'#6B5744', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>End Date</label>
                    <input type="date" value={freezeEnd} onChange={e => setFreezeEnd(e.target.value)} style={{ ...inp, width:'100%' }}/>
                  </div>
                </div>
                <button onClick={handleFreeze} disabled={saving} style={{ ...btnPrimary, background:'#7C8C5E', opacity: saving ? 0.6 : 1 }}>{saving ? '…' : 'Freeze'}</button>
              </div>
            ) : (
              <div style={{ background:'#EDF0F6', border:'1.5px solid #A3B4D4', borderRadius:12, padding:16, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:'0.88rem', color:'#3A5A8C' }}>
                  <Snowflake size={15}/> {client.freezeStartDate} → {client.frozenUntil}
                </div>
                <button onClick={handleUnfreeze} disabled={saving} style={{ fontSize:'0.8rem', color:'#3A5A8C', background:'none', border:'1px solid #A3B4D4', borderRadius:6, padding:'5px 10px', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                  {saving ? '…' : 'Unfreeze'}
                </button>
              </div>
            )}

            <div style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'1rem', color:'#3D2314', marginTop:8, marginBottom:4 }}>Renew Package</div>
            <select style={{ ...inp, marginBottom:8 }} value={renewPkg} onChange={e => setRenewPkg(e.target.value)}>
              {PACKAGES.filter(p => p.label !== 'No Package').map(p => <option key={p.label}>{p.label}</option>)}
            </select>
            {isRenewCustom && (
              <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:8 }}>
                <input style={inp} placeholder="Package name (e.g. 6-Session Pack)" value={renewCustom.name} onChange={e => setRenewCustom(p=>({...p,name:e.target.value}))}/>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  <input style={inp} type="number" min="1" placeholder="Sessions (blank = unlimited)" value={renewCustom.sessions} onChange={e => setRenewCustom(p=>({...p,sessions:e.target.value}))}/>
                  <input style={inp} type="number" min="0" placeholder="Price ($)" value={renewCustom.price} onChange={e => setRenewCustom(p=>({...p,price:e.target.value}))}/>
                </div>
              </div>
            )}
            <div style={{ display:'flex', gap:8, marginBottom:8 }}>
              {['Cash','Whish'].map(m => (
                <button key={m} onClick={() => setRenewMethod(m)} style={{ flex:1, padding:'9px', borderRadius:8, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", fontSize:'0.82rem', fontWeight:500, background: renewMethod===m ? '#3D2314':'#F5F0E8', color: renewMethod===m ? '#F5F0E8':'#6B5744', border:`1.5px solid ${renewMethod===m ? '#3D2314':'#E0D5C1'}` }}>
                  {m === 'Whish' ? '📱 Whish' : '💵 Cash'}
                </button>
              ))}
            </div>
            <button onClick={handleRenew} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>{saving ? '…' : 'Renew'}</button>
          </div>
        )}
      </div>

      {/* Confirm Paid Dialog */}
      {showPaidConfirm && (
        <ConfirmDialog
          title="Confirm Payment"
          message={`Mark ${client.name}'s payment as verified? This will confirm that payment has been received.`}
          confirmLabel="Yes, Mark Paid"
          onConfirm={doVerifyPayment}
          onCancel={() => setShowPaidConfirm(false)}
        />
      )}
    </Overlay>
  );
}

// ── Shared ────────────────────────────────────────────────────
function Overlay({ children, onClose }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(42,26,14,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }} onClick={onClose}>
      <div style={{ background:'#FAF7F2', borderRadius:18, width:'100%', maxWidth:500, maxHeight:'92vh', overflowY:'auto', boxShadow:'0 8px 32px rgba(61,35,20,0.18)', border:'1px solid #E0D5C1' }} onClick={e=>e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
function ModalHeader({ title, onClose }) {
  return (
    <div style={{ padding:'22px 24px 16px', borderBottom:'1px solid #E0D5C1', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
      <span style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'1.4rem', fontWeight:500, color:'#3D2314' }}>{title}</span>
      <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#9C8470', padding:4 }}><X size={18}/></button>
    </div>
  );
}
function Field({ label, children, span }) {
  return (
    <div style={{ gridColumn: span === 2 ? 'span 2' : 'span 1' }}>
      <label style={{ display:'block', fontSize:'0.75rem', fontWeight:500, color:'#6B5744', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>{label}</label>
      {children}
    </div>
  );
}
const inp = { width:'100%', padding:'10px 13px', border:'1.5px solid #E0D5C1', borderRadius:8, background:'#F5F0E8', fontFamily:"'DM Sans',sans-serif", fontSize:'0.88rem', color:'#2A1A0E', outline:'none', boxSizing:'border-box' };
const btnPrimary = { width:'100%', padding:'12px', background:'#3D2314', color:'#F5F0E8', border:'none', borderRadius:8, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", fontSize:'0.9rem', fontWeight:500 };

// ── Main Page ─────────────────────────────────────────────────
export default function AdminClients() {
  const { clients, loading, error, addClient, updateClient, freezeClient, unfreezeClient, renewPackage, verifyPayment, updatePackageExpiry } = useClients();
  const { addExpense } = useExpenses();
  const [search,         setSearch]         = useState('');
  const [statusFilter,   setStatusFilter]   = useState('All');
  const [selectedClient, setSelectedClient] = useState(null);
  const [showNewModal,   setShowNewModal]   = useState(false);

  const filtered = clients.filter(c => {
    const matchSearch = c.name?.toLowerCase().includes(search.toLowerCase()) || c.phone?.includes(search);
    const matchStatus =
      statusFilter === 'All'           ? true :
      statusFilter === 'Active'        ? c.status === 'active' && !c.isFrozen :
      statusFilter === 'Low Sessions'  ? c.status === 'low' :
      statusFilter === 'Expiring Soon' ? c.status === 'expiring' :
      statusFilter === 'Frozen'        ? c.isFrozen :
      statusFilter === 'Unpaid'        ? !c.paymentVerified && c.pkg : true;
    return matchSearch && matchStatus;
  });

  if (error) return <div style={{ padding:32, color:'#8C3A3A', fontSize:'0.9rem' }}>Failed to load clients: {error}</div>;

  return (
    <div style={{ padding:'28px 32px 40px' }}>
      {/* Toolbar */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16, flexWrap:'wrap' }}>
        <div style={{ position:'relative', flex:1, minWidth:200 }}>
          <Search size={15} style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'#9C8470' }}/>
          <input placeholder="Search by name or phone…" value={search} onChange={e=>setSearch(e.target.value)} style={{ ...inp, paddingLeft:36, width:'100%' }}/>
        </div>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          {STATUS_FILTERS.map(f => (
            <button key={f} onClick={() => setStatusFilter(f)} style={{ padding:'7px 13px', borderRadius:20, border:'1.5px solid', cursor:'pointer', fontSize:'0.78rem', fontWeight:500, fontFamily:"'DM Sans',sans-serif", background: statusFilter===f ? '#3D2314':'#FAF7F2', color: statusFilter===f ? '#F5F0E8':'#6B5744', borderColor: statusFilter===f ? '#3D2314':'#E0D5C1', transition:'all 0.18s' }}>{f}</button>
          ))}
        </div>
        <button onClick={() => setShowNewModal(true)} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 16px', background:'#3D2314', color:'#F5F0E8', border:'none', borderRadius:8, fontFamily:"'DM Sans',sans-serif", fontSize:'0.84rem', fontWeight:500, cursor:'pointer' }}>
          <Plus size={15}/> Add Client
        </button>
      </div>

      {/* Summary badges */}
      <div style={{ display:'flex', gap:8, marginBottom:18, flexWrap:'wrap' }}>
        {[
          { label:'Total',        val: clients.length,                                       bg:'#F0EAE3', color:'#3D2314' },
          { label:'Active',       val: clients.filter(c=>c.status==='active').length,         bg:'#EEF3E6', color:'#4E6A2E' },
          { label:'Low Sessions', val: clients.filter(c=>c.status==='low').length,            bg:'#F5F1E0', color:'#7A6020' },
          { label:'Expiring',     val: clients.filter(c=>c.status==='expiring').length,       bg:'#F7EDED', color:'#8C3A3A' },
          { label:'Frozen',       val: clients.filter(c=>c.isFrozen).length,                  bg:'#EDF0F6', color:'#3A5A8C' },
          { label:'Unpaid',       val: clients.filter(c=>!c.paymentVerified && c.pkg).length, bg:'#F7EDED', color:'#8C3A3A' },
        ].map(s => (
          <div key={s.label} style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 12px', borderRadius:20, background:s.bg, border:`1px solid ${s.color}22` }}>
            <span style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'1rem', fontWeight:500, color:s.color }}>{s.val}</span>
            <span style={{ fontSize:'0.72rem', color:s.color, textTransform:'uppercase', letterSpacing:'0.08em' }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ background:'#FAF7F2', borderRadius:14, border:'1px solid #E0D5C1', boxShadow:'0 2px 16px rgba(61,35,20,0.10)', overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr>
              {['Client','Package','Sessions','Expiry','Status','Payment',''].map(h => (
                <th key={h} style={{ fontSize:'0.72rem', textTransform:'uppercase', letterSpacing:'0.1em', color:'#9C8470', padding:'12px 16px', textAlign:'left', borderBottom:'1.5px solid #E0D5C1', fontWeight:500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding:'40px', textAlign:'center', color:'#C4AE8F', fontSize:'0.88rem' }}>Loading clients…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ padding:'32px', textAlign:'center', color:'#9C8470', fontSize:'0.88rem' }}>
                {clients.length === 0 ? 'No clients yet. Add your first client!' : 'No clients match your search.'}
              </td></tr>
            ) : filtered.map((c, i) => {
              const st = c.isFrozen ? statusStyle('frozen') : statusStyle(c.status);
              return (
                <tr key={c.id} onClick={() => setSelectedClient(c)} style={{ cursor:'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background='#F5F0E8'}
                  onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                  <td style={{ padding:'12px 16px', borderBottom: i<filtered.length-1?'1px solid #E0D5C1':'none' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <div style={{ width:34, height:34, borderRadius:'50%', background:'#C4AE8F', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Cormorant Garant',serif", fontSize:'0.9rem', color:'#3D2314', fontWeight:600, flexShrink:0 }}>{c.avatar}</div>
                      <div>
                        <div style={{ fontWeight:500, fontSize:'0.9rem', color:'#2A1A0E' }}>{c.name}</div>
                        <div style={{ fontSize:'0.75rem', color:'#9C8470' }}>{c.phone}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding:'12px 16px', fontSize:'0.84rem', color:'#6B5744', borderBottom: i<filtered.length-1?'1px solid #E0D5C1':'none' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}><Package size={13} color='#C4AE8F'/> {c.pkg || '—'}</div>
                  </td>
                  <td style={{ padding:'12px 16px', borderBottom: i<filtered.length-1?'1px solid #E0D5C1':'none' }}>
                    {c.sessionsRemaining != null ? (
                      <div>
                        <div style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'1.1rem', fontWeight:500, color:'#3D2314' }}>
                          {c.sessionsRemaining}<span style={{ fontSize:'0.75rem', color:'#9C8470', fontFamily:"'DM Sans',sans-serif" }}> / {c.sessionsTotal}</span>
                        </div>
                        <div style={{ background:'#E0D5C1', borderRadius:10, height:4, marginTop:4, width:60 }}>
                          <div style={{ background: c.sessionsRemaining <= 2 ? '#C0412A':'#7C8C5E', height:4, borderRadius:10, width:`${(c.sessionsRemaining/c.sessionsTotal)*100}%` }}/>
                        </div>
                      </div>
                    ) : (
                      <span style={{ fontSize:'0.82rem', color:'#7C8C5E', display:'flex', alignItems:'center', gap:4 }}><Clock size={12}/> Unlimited</span>
                    )}
                  </td>
                  <td style={{ padding:'12px 16px', fontSize:'0.84rem', color:'#6B5744', borderBottom: i<filtered.length-1?'1px solid #E0D5C1':'none' }}>{c.expiry || '—'}</td>
                  <td style={{ padding:'12px 16px', borderBottom: i<filtered.length-1?'1px solid #E0D5C1':'none' }}>
                    <span style={{ padding:'3px 10px', borderRadius:20, fontSize:'0.72rem', fontWeight:500, background:st.bg, color:st.color }}>
                      {c.isFrozen ? '❄ Frozen' : st.label}
                    </span>
                  </td>
                  <td style={{ padding:'12px 16px', borderBottom: i<filtered.length-1?'1px solid #E0D5C1':'none' }}>
                    {c.pkg ? (
                      c.paymentVerified
                        ? <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:'0.72rem', color:'#4E6A2E', background:'#EEF3E6', padding:'2px 8px', borderRadius:20 }}><CheckCircle size={10}/> Paid</span>
                        : <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:'0.72rem', color:'#8C3A3A', background:'#F7EDED', padding:'2px 8px', borderRadius:20 }}><AlertCircle size={10}/> Unpaid</span>
                    ) : '—'}
                  </td>
                  <td style={{ padding:'12px 16px', borderBottom: i<filtered.length-1?'1px solid #E0D5C1':'none' }}>
                    <ChevronRight size={15} color='#C4AE8F'/>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedClient && (
        <ClientModal
          client={selectedClient}
          onClose={() => setSelectedClient(null)}
          updateClient={updateClient}
          freezeClient={freezeClient}
          unfreezeClient={unfreezeClient}
          renewPackage={renewPackage}
          verifyPayment={verifyPayment}
          updatePackageExpiry={updatePackageExpiry}
          addExpense={addExpense}
        />
      )}
      {showNewModal && <NewClientModal onClose={() => setShowNewModal(false)} addClient={addClient} />}
    </div>
  );
}