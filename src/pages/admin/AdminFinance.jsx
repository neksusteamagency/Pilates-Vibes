import { useState, useEffect } from 'react';
import { Plus, X, TrendingUp, TrendingDown, DollarSign, ChevronRight, AlertTriangle, ShoppingBag, Edit2, Trash2, Check } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useExpenses } from '../../hooks/useExpenses';
import { usePOSSales, usePOSProducts } from '../../hooks/usePOS';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

const EXPENSE_CATEGORIES = ['Trainer Payroll','Rent','Equipment','Utilities','Marketing','Other','POS Product'];
const CATEGORY_COLORS    = { 'Trainer Payroll':'#7C8C5E', 'Rent':'#A0673A', 'Equipment':'#C4AE8F', 'Utilities':'#3D2314', 'Marketing':'#9C8470', 'Other':'#6B5744', 'POS Product':'#4E6A2E' };

function methodBadge(method) {
  const map = { 'Cash':{ bg:'#EEF3E6', color:'#4E6A2E' }, 'Whish':{ bg:'#EDF0F6', color:'#3A5A8C' } };
  const s = map[method] || { bg:'#F0EAE3', color:'#3D2314' };
  return <span style={{ padding:'2px 8px', borderRadius:20, fontSize:'0.7rem', fontWeight:500, background:s.bg, color:s.color }}>{method}</span>;
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'#FAF7F2', border:'1px solid #E0D5C1', borderRadius:8, padding:'10px 14px', fontSize:'0.82rem', boxShadow:'0 2px 12px rgba(61,35,20,0.10)' }}>
      <div style={{ fontWeight:600, color:'#3D2314', marginBottom:5 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ display:'flex', alignItems:'center', gap:8, color: p.name==='income' ? '#7C8C5E' : '#A0673A' }}>
          <span style={{ width:8, height:8, borderRadius:'50%', background: p.name==='income' ? '#7C8C5E' : '#A0673A', display:'inline-block' }}/>
          {p.name.charAt(0).toUpperCase()+p.name.slice(1)}: ${p.value?.toLocaleString()}
        </div>
      ))}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ display:'block', fontSize:'0.75rem', fontWeight:500, color:'#6B5744', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>{label}</label>
      {children}
    </div>
  );
}
function Card({ title, children, action, onAction }) {
  return (
    <div style={{ background:'#FAF7F2', borderRadius:14, boxShadow:'0 2px 16px rgba(61,35,20,0.10)', border:'1px solid #E0D5C1', overflow:'hidden' }}>
      <div style={{ padding:'16px 20px', borderBottom:'1px solid #E0D5C1', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'1.15rem', fontWeight:500, color:'#3D2314' }}>{title}</span>
        {action && <button onClick={onAction} style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 12px', background:'#3D2314', color:'#F5F0E8', border:'none', borderRadius:7, fontFamily:"'DM Sans',sans-serif", fontSize:'0.78rem', fontWeight:500, cursor:'pointer' }}><Plus size={13}/>{action}</button>}
      </div>
      {children}
    </div>
  );
}
const inp = { width:'100%', padding:'10px 13px', border:'1.5px solid #E0D5C1', borderRadius:8, background:'#F5F0E8', fontFamily:"'DM Sans',sans-serif", fontSize:'0.88rem', color:'#2A1A0E', outline:'none', boxSizing:'border-box' };
const btnPrimary = { width:'100%', padding:'12px', background:'#3D2314', color:'#F5F0E8', border:'none', borderRadius:8, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", fontSize:'0.9rem', fontWeight:500 };

// ── Edit/Delete Row Actions ────────────────────────────────────
function RowActions({ item, onEdit, onDelete }) {
  const [confirm, setConfirm] = useState(false);
  if (confirm) {
    return (
      <div style={{ display:'flex', gap:6 }}>
        <button onClick={() => onDelete(item.id)} style={{ padding:'3px 10px', background:'#8C3A3A', color:'#fff', border:'none', borderRadius:6, fontSize:'0.72rem', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>Delete</button>
        <button onClick={() => setConfirm(false)} style={{ padding:'3px 8px', background:'#F5F0E8', color:'#6B5744', border:'1px solid #E0D5C1', borderRadius:6, fontSize:'0.72rem', cursor:'pointer' }}>×</button>
      </div>
    );
  }
  return (
    <div style={{ display:'flex', gap:6, opacity:0 }} className="row-actions">
      <button onClick={() => onEdit(item)} style={{ padding:'4px 8px', background:'#F5F0E8', color:'#6B5744', border:'1px solid #E0D5C1', borderRadius:6, fontSize:'0.72rem', cursor:'pointer', display:'flex', alignItems:'center', gap:3 }}><Edit2 size={11}/></button>
      <button onClick={() => setConfirm(true)} style={{ padding:'4px 8px', background:'#F7EDED', color:'#8C3A3A', border:'1px solid #DDB0B0', borderRadius:6, fontSize:'0.72rem', cursor:'pointer', display:'flex', alignItems:'center', gap:3 }}><Trash2 size={11}/></button>
    </div>
  );
}

// ── Edit Income/Expense Modal ──────────────────────────────────
function EditEntryModal({ entry, onClose, onSave, isIncome }) {
  const [form, setForm] = useState({
    description: entry.description || '',
    amount: String(Math.abs(entry.amount) || ''),
    method: entry.method || 'Cash',
    date: entry.date || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(p => ({...p,[k]:v}));

  async function handleSave() {
    if (!form.description.trim()) return toast.error('Description required.');
    if (!form.amount || isNaN(form.amount)) return toast.error('Enter a valid amount.');
    if (!form.date) return toast.error('Date required.');
    setSaving(true);
    try {
      await onSave(entry.id, {
        description: form.description,
        amount: isIncome ? -Math.abs(Number(form.amount)) : Number(form.amount),
        method: form.method,
        date: form.date,
      });
      toast.success('Updated!');
      onClose();
    } catch { toast.error('Failed to update.'); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(42,26,14,0.45)', zIndex:1100, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }} onClick={onClose}>
      <div style={{ background:'#FAF7F2', borderRadius:18, width:'100%', maxWidth:420, boxShadow:'0 8px 32px rgba(61,35,20,0.18)', border:'1px solid #E0D5C1' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding:'20px 24px 16px', borderBottom:'1px solid #E0D5C1', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'1.3rem', fontWeight:500, color:'#3D2314' }}>Edit {isIncome ? 'Income' : 'Expense'}</span>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#9C8470' }}><X size={18}/></button>
        </div>
        <div style={{ padding:'20px 24px 24px', display:'flex', flexDirection:'column', gap:14 }}>
          <Field label="Description"><input style={inp} value={form.description} onChange={e => set('description', e.target.value)}/></Field>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <Field label="Amount (USD)"><input style={inp} type="number" value={form.amount} onChange={e => set('amount', e.target.value)}/></Field>
            <Field label="Date"><input style={inp} type="date" value={form.date} onChange={e => set('date', e.target.value)}/></Field>
          </div>
          <Field label="Payment Method">
            <div style={{ display:'flex', gap:8 }}>
              {['Cash','Whish'].map(m => (
                <button key={m} onClick={() => set('method', m)} style={{ flex:1, padding:'8px 4px', borderRadius:8, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", fontSize:'0.76rem', fontWeight:500, background: form.method===m ? '#3D2314':'#F5F0E8', color: form.method===m ? '#F5F0E8':'#6B5744', border:`1.5px solid ${form.method===m ? '#3D2314':'#E0D5C1'}` }}>{m}</button>
              ))}
            </div>
          </Field>
          <button style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }} onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Log Expense Modal ──────────────────────────────────────────
function LogExpenseModal({ onClose, addExpense, products, addProduct, restockProduct }) {
  const [form, setForm] = useState({
    category:'Rent', description:'', amount:'', method:'Cash', date:'',
    isAdvance:false, advanceMonths:1,
    selectedProduct:'', quantity:'', unitCost:'', sellingPrice:'', lowStock:'5',
productName:'', productEmoji:'📦', productCategory:'Drinks', emojiOpen:false,
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const isPOS = form.category === 'POS Product';

  async function handleSave() {
    if (!form.date) return toast.error('Date is required.');
    setSaving(true);
    try {
      const entries = [];

      if (isPOS) {
        const productName = form.productName.trim() || form.selectedProduct;
        if (!productName) return toast.error('Select or enter a product name.');
        if (!form.quantity || !form.unitCost || !form.sellingPrice) return toast.error('Quantity, unit cost and selling price are required.');
        const qty = Number(form.quantity), cost = Number(form.unitCost), totalCost = qty * cost;
        entries.push({ category:'POS Product', description:`Purchased ${qty} × ${productName}`, amount:totalCost, method:form.method, date:form.date, isAdvance:false, isAllocated:false, isLumpSum:false, isPOSPurchase:true, originalPaymentDate:form.date, totalAdvanceAmount:totalCost });
        const existingProduct = products.find(p => p.name.toLowerCase() === productName.toLowerCase());
        if (existingProduct) await restockProduct(existingProduct.id, qty);
        else await addProduct({ name:productName, category:form.productCategory||'Drinks', price:Number(form.sellingPrice), stock:qty, lowStock:Number(form.lowStock)||5, emoji:form.productEmoji||'📦' });
      } else if (form.isAdvance && form.category === 'Rent') {
        const totalAmount = Number(form.amount) * form.advanceMonths;
        entries.push({ category:form.category, description:`${form.description} (Advance ${form.advanceMonths} months)`, amount:totalAmount, method:form.method, date:form.date, isAdvance:true, isLumpSum:true, isAllocated:false, originalPaymentDate:form.date, totalAdvanceAmount:totalAmount });
        for (let i = 0; i < form.advanceMonths; i++) {
          const d = new Date(form.date); d.setMonth(d.getMonth() + i);
          entries.push({ category:form.category, description:`${form.description} (Month ${i+1} of ${form.advanceMonths})`, amount:Number(form.amount), method:form.method, date:d.toISOString().split('T')[0], isAdvance:true, isLumpSum:false, isAllocated:true, originalPaymentDate:form.date, totalAdvanceAmount:totalAmount });
        }
      } else {
        if (!form.description.trim()) return toast.error('Description is required.');
        if (!form.amount || isNaN(form.amount)) return toast.error('Enter a valid amount.');
        entries.push({ category:form.category, description:form.description, amount:Number(form.amount), method:form.method, date:form.date, isAdvance:false, isLumpSum:false, isAllocated:false, originalPaymentDate:form.date, totalAdvanceAmount:Number(form.amount) });
      }

      for (const entry of entries) await addExpense(entry);
      toast.success(isPOS ? 'Product added to POS and expense logged!' : 'Expense saved!');
      onClose();
    } catch (err) { console.error(err); toast.error('Failed to save.'); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(42,26,14,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }} onClick={onClose}>
      <div style={{ background:'#FAF7F2', borderRadius:18, width:'100%', maxWidth:500, maxHeight:'92vh', overflowY:'auto', boxShadow:'0 8px 32px rgba(61,35,20,0.18)', border:'1px solid #E0D5C1' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding:'20px 24px 16px', borderBottom:'1px solid #E0D5C1', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'1.4rem', fontWeight:500, color:'#3D2314' }}>Log Expense</span>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#9C8470' }}><X size={18}/></button>
        </div>
        <div style={{ padding:'20px 24px 24px', display:'flex', flexDirection:'column', gap:14 }}>
          <Field label="Category">
            <select style={inp} value={form.category} onChange={e => set('category', e.target.value)}>
              {EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </Field>

          {!isPOS && form.category !== 'Rent' && (
            <>
              <Field label="Description"><input style={inp} placeholder="e.g. Office supplies" value={form.description} onChange={e => set('description', e.target.value)} /></Field>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <Field label="Amount (USD)"><input style={inp} type="number" placeholder="0.00" value={form.amount} onChange={e => set('amount', e.target.value)} /></Field>
                <Field label="Date"><input style={inp} type="date" value={form.date} onChange={e => set('date', e.target.value)} /></Field>
              </div>
            </>
          )}

          {!isPOS && form.category === 'Rent' && (
            <>
              <Field label="Description"><input style={inp} placeholder="e.g. Studio Rent" value={form.description} onChange={e => set('description', e.target.value)} /></Field>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <Field label="Monthly Amount (USD)"><input style={inp} type="number" placeholder="0.00" value={form.amount} onChange={e => set('amount', e.target.value)} /></Field>
                <Field label="Payment Date"><input style={inp} type="date" value={form.date} onChange={e => set('date', e.target.value)} /></Field>
              </div>
              <div style={{ background:'linear-gradient(135deg,#EAF0E0,#F5F8EE)', border:'1.5px solid #A3B07E', borderRadius:12, padding:14 }}>
                <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', marginBottom: form.isAdvance ? 12 : 0 }}>
                  <div onClick={() => set('isAdvance', !form.isAdvance)} style={{ width:36, height:20, borderRadius:10, position:'relative', cursor:'pointer', background: form.isAdvance ? '#7C8C5E':'#E0D5C1', transition:'background 0.2s' }}>
                    <div style={{ position:'absolute', top:2, left: form.isAdvance ? 18:2, width:16, height:16, borderRadius:'50%', background:'#FAF7F2', transition:'left 0.2s' }}/>
                  </div>
                  <span style={{ fontSize:'0.84rem', fontWeight:500, color:'#3D2314' }}>Advance Payment (multiple months)</span>
                </label>
                {form.isAdvance && (
                  <Field label="Covers how many months?">
                    <select style={inp} value={form.advanceMonths} onChange={e => set('advanceMonths', +e.target.value)}>
                      {[1,2,3,4,5,6,12].map(n => <option key={n} value={n}>{n} month{n>1?'s':''}</option>)}
                    </select>
                  </Field>
                )}
              </div>
            </>
          )}

          {isPOS && (
            <>
              <Field label="Existing Product (or leave blank to add new)">
                <select style={inp} value={form.selectedProduct} onChange={e => set('selectedProduct', e.target.value)}>
                  <option value="">-- Add new product --</option>
                  {products.map(p => <option key={p.id} value={p.name}>{p.emoji} {p.name}</option>)}
                </select>
              </Field>
              {!form.selectedProduct && (
                <>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 60px', gap:12 }}>
                    <Field label="New Product Name"><input style={inp} placeholder="e.g. Still Water" value={form.productName} onChange={e => set('productName', e.target.value)} /></Field>
<Field label="Emoji">
  <div style={{ position:'relative' }}>
    <button type="button" onClick={() => set('emojiOpen', !form.emojiOpen)}
      style={{ ...inp, display:'flex', alignItems:'center', gap:8, cursor:'pointer', textAlign:'left', background:'#F5F0E8' }}>
      <span style={{ fontSize:'1.2rem' }}>{form.productEmoji}</span>
      <span style={{ marginLeft:'auto', color:'#9C8470' }}>{form.emojiOpen ? '▲' : '▼'}</span>
    </button>
    {form.emojiOpen && (
      <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, zIndex:200, background:'#FAF7F2', border:'1.5px solid #E0D5C1', borderRadius:10, padding:12, boxShadow:'0 8px 24px rgba(61,35,20,0.14)', maxHeight:260, overflowY:'auto' }}>
        {[
          { group:'Drinks',    emojis:['💧','🧃','☕','🍵'] },
          { group:'Snacks',    emojis:['🍫','🍬','🍪','🧁'] },
          { group:'Socks',     emojis:['🧦','🩴','👟'] },
          { group:'Apparel',   emojis:['👗','👙','🎀','👒'] },
          { group:'Other',     emojis:['📦','🎁','💊','🌿'] },
        ].map(({ group, emojis }) => (
          <div key={group} style={{ marginBottom:10 }}>
            <div style={{ fontSize:'0.65rem', textTransform:'uppercase', letterSpacing:'0.08em', color:'#9C8470', marginBottom:5 }}>{group}</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
              {emojis.map(e => (
                <button key={e} type="button" onClick={() => { set('productEmoji', e); set('emojiOpen', false); }}
                  style={{ width:34, height:34, borderRadius:7, border: form.productEmoji===e ? '2px solid #3D2314' : '1.5px solid #E0D5C1', background: form.productEmoji===e ? '#E8DFCF' : '#FAF7F2', cursor:'pointer', fontSize:'1.1rem', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {e}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
</Field>
                  </div>
                  <Field label="Product Category">
                    <select style={inp} value={form.productCategory} onChange={e => set('productCategory', e.target.value)}>
                      {['Drinks','Snacks','Apparel','Equipment'].map(c => <option key={c}>{c}</option>)}
                    </select>
                  </Field>
                </>
              )}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <Field label="Quantity"><input style={inp} type="number" placeholder="0" value={form.quantity} onChange={e => set('quantity', e.target.value)} /></Field>
                <Field label="Unit Cost ($)"><input style={inp} type="number" placeholder="0.00" value={form.unitCost} onChange={e => set('unitCost', e.target.value)} /></Field>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <Field label="Selling Price ($)"><input style={inp} type="number" placeholder="0.00" value={form.sellingPrice} onChange={e => set('sellingPrice', e.target.value)} /></Field>
                <Field label="Low Stock Alert"><input style={inp} type="number" placeholder="5" value={form.lowStock} onChange={e => set('lowStock', e.target.value)} /></Field>
              </div>
              <Field label="Purchase Date"><input style={inp} type="date" value={form.date} onChange={e => set('date', e.target.value)} /></Field>
            </>
          )}

          <Field label="Payment Method">
            <div style={{ display:'flex', gap:8 }}>
              {['Cash','Whish'].map(m => (
                <button key={m} onClick={() => set('method', m)} style={{ flex:1, padding:'8px 4px', borderRadius:8, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", fontSize:'0.76rem', fontWeight:500, background: form.method===m ? '#3D2314':'#F5F0E8', color: form.method===m ? '#F5F0E8':'#6B5744', border:`1.5px solid ${form.method===m ? '#3D2314':'#E0D5C1'}` }}>{m}</button>
              ))}
            </div>
          </Field>
          <button style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }} onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Log Income Modal ───────────────────────────────────────────
function LogIncomeModal({ onClose, addExpense }) {
  const [form, setForm] = useState({ client:'', description:'', amount:'', method:'Cash', date:'' });
  const [saving, setSaving] = useState(false);
  const set = (k,v) => setForm(p => ({...p,[k]:v}));

  async function handleSave() {
    if (!form.description.trim()) return toast.error('Description is required.');
    if (!form.amount || isNaN(form.amount)) return toast.error('Enter a valid amount.');
    if (!form.date) return toast.error('Date is required.');
    setSaving(true);
    try {
      await addExpense({ category:'Income', description:`${form.client ? form.client + ' — ' : ''}${form.description}`, amount:-Number(form.amount), method:form.method, date:form.date, isIncome:true });
      toast.success('Income saved!'); onClose();
    } catch { toast.error('Failed to save income.'); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(42,26,14,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }} onClick={onClose}>
      <div style={{ background:'#FAF7F2', borderRadius:18, width:'100%', maxWidth:420, boxShadow:'0 8px 32px rgba(61,35,20,0.18)', border:'1px solid #E0D5C1' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding:'20px 24px 16px', borderBottom:'1px solid #E0D5C1', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'1.4rem', fontWeight:500, color:'#3D2314' }}>Log Income</span>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#9C8470' }}><X size={18}/></button>
        </div>
        <div style={{ padding:'20px 24px 24px', display:'flex', flexDirection:'column', gap:14 }}>
          <Field label="Client / Source"><input style={inp} placeholder="e.g. Nour Haddad" value={form.client} onChange={e=>set('client',e.target.value)}/></Field>
          <Field label="Description"><input style={inp} placeholder="e.g. 10-Session Pack" value={form.description} onChange={e=>set('description',e.target.value)}/></Field>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <Field label="Amount (USD)"><input style={inp} type="number" placeholder="0.00" value={form.amount} onChange={e=>set('amount',e.target.value)}/></Field>
            <Field label="Date"><input style={inp} type="date" value={form.date} onChange={e=>set('date',e.target.value)}/></Field>
          </div>
          <Field label="Payment Method">
            <div style={{ display:'flex', gap:8 }}>
              {['Cash','Whish'].map(m=>(
                <button key={m} onClick={()=>set('method',m)} style={{ flex:1, padding:'10px', borderRadius:8, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", fontSize:'0.84rem', fontWeight:500, background: form.method===m ? '#3D2314':'#F5F0E8', color: form.method===m ? '#F5F0E8':'#6B5744', border:`1.5px solid ${form.method===m ? '#3D2314':'#E0D5C1'}` }}>{m==='Whish'?'📱 Whish':'💵 Cash'}</button>
              ))}
            </div>
          </Field>
          <button style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }} onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Income'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────
export default function AdminFinance() {
  const [activeTab,    setActiveTab]    = useState('overview');
  const [showExpModal, setShowExpModal] = useState(false);
  const [showIncModal, setShowIncModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [editIsIncome, setEditIsIncome] = useState(false);

  const currentMonth = format(new Date(), 'yyyy-MM');
  const { expenses, loading, fetchByMonth, addExpense, updateExpense, removeExpense, getMonthlyExpensesForMonth, getActualExpensesForMonth } = useExpenses();
  const { products, addProduct, restockProduct } = usePOSProducts();
  const { fetchSalesByRange, totalRevenue: posIncomeValue } = usePOSSales();

  useEffect(() => {
    fetchByMonth(currentMonth);
    fetchSalesByRange(`${currentMonth}-01`, `${currentMonth}-31`);
  }, [currentMonth]);

  const incomeItems     = expenses.filter(e => e.isIncome);
  const totalIncome     = incomeItems.reduce((s, e) => s + Math.abs(e.amount || 0), 0);
  const monthlyExpenses = getMonthlyExpensesForMonth(expenses, currentMonth);
  const actualExpenses  = getActualExpensesForMonth(expenses, currentMonth);
  const profit          = totalIncome + posIncomeValue - actualExpenses;
  const expenseItems    = expenses.filter(e => !e.isIncome);

  const chartData = Array.from({ length: 6 }).map((_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() - (5 - i));
    return { month: format(d, 'MMM'), income: 0, expenses: 0 };
  });
  if (chartData.length > 0) {
    chartData[chartData.length-1].income   = totalIncome + posIncomeValue;
    chartData[chartData.length-1].expenses = actualExpenses;
  }

  async function handleDelete(id) {
    try { await removeExpense(id); toast.success('Deleted.'); fetchByMonth(currentMonth); }
    catch { toast.error('Failed to delete.'); }
  }

  function openEdit(item, isIncome) {
    setEditingEntry(item);
    setEditIsIncome(isIncome);
  }

  async function handleUpdate(id, data) {
    await updateExpense(id, data);
    fetchByMonth(currentMonth);
  }

  return (
    <div style={{ padding:'28px 32px 40px' }}>
      {/* Tab bar */}
      <div style={{ display:'flex', gap:0, marginBottom:22, background:'#FAF7F2', borderRadius:10, border:'1px solid #E0D5C1', overflow:'hidden', width:'fit-content' }}>
        {['overview','income','expenses'].map(t => (
          <button key={t} onClick={() => setActiveTab(t)} style={{ padding:'9px 20px', background: activeTab===t ? '#3D2314':'transparent', color: activeTab===t ? '#F5F0E8':'#6B5744', border:'none', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", fontSize:'0.84rem', fontWeight: activeTab===t?500:400, textTransform:'capitalize', transition:'all 0.18s' }}>{t}</button>
        ))}
      </div>

      {/* OVERVIEW */}
      {activeTab === 'overview' && (
        <div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:14, marginBottom:22 }} className="fin-resp">
            {[
              { label:'Service Income',   value:`$${totalIncome.toLocaleString()}`,      sub: format(new Date(),'MMMM yyyy'),    icon:TrendingUp,  color:'#7C8C5E', bg:'#EEF3E6' },
              { label:'POS Income',       value:`$${posIncomeValue.toLocaleString()}`,   sub:'Retail sales this month',          icon:ShoppingBag, color:'#A0673A', bg:'#F5F1E0' },
              { label:'Monthly Expenses', value:`$${monthlyExpenses.toLocaleString()}`,  sub:'Cash paid out this month',         icon:TrendingDown,color:'#8C3A3A', bg:'#F7EDED' },
              { label:'Actual Expenses',  value:`$${actualExpenses.toLocaleString()}`,   sub:'Operational costs only — excl. inventory & advances', icon:DollarSign,  color:'#3D2314', bg:'#F0EAE3' },
              { label:'Profit',           value:`$${profit.toLocaleString()}`,           sub:'Based on actual expenses',         icon:TrendingUp,  color: profit>=0?'#4E6A2E':'#8C3A3A', bg: profit>=0?'#EEF3E6':'#F7EDED' },
            ].map(k => (
              <div key={k.label} style={{ background:'#FAF7F2', borderRadius:14, padding:20, border:'1px solid #E0D5C1', boxShadow:'0 2px 16px rgba(61,35,20,0.10)' }}>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:12 }}>
                  <span style={{ fontSize:'0.72rem', textTransform:'uppercase', letterSpacing:'0.1em', color:'#9C8470' }}>{k.label}</span>
                  <div style={{ width:32, height:32, borderRadius:'50%', background:k.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <k.icon size={15} color={k.color}/>
                  </div>
                </div>
                <div style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'2rem', fontWeight:500, color:'#3D2314', lineHeight:1 }}>{k.value}</div>
                <div style={{ fontSize:'0.78rem', color:k.color, marginTop:5 }}>{k.sub}</div>
              </div>
            ))}
          </div>

          {expenses.some(e => e.isLumpSum) && (
            <div style={{ background:'#F5F1E0', border:'1px solid #DDD0A0', borderRadius:8, padding:'11px 16px', fontSize:'0.82rem', color:'#7A6020', display:'flex', alignItems:'flex-start', gap:10, marginBottom:22 }}>
              <AlertTriangle size={15} style={{ flexShrink:0, marginTop:1 }}/>
              <div><strong>Advance payment detected.</strong> Monthly Expenses show the full cash paid out. Actual Expenses show only the portion allocated to this month.</div>
            </div>
          )}

          <div style={{ background:'#FAF7F2', borderRadius:14, border:'1px solid #E0D5C1', boxShadow:'0 2px 16px rgba(61,35,20,0.10)', padding:'20px 22px', marginBottom:14 }}>
            <div style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'1.15rem', fontWeight:500, color:'#3D2314', marginBottom:18 }}>Income vs Actual Expenses — Last 6 Months</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} barCategoryGap="30%" barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E0D5C1" vertical={false}/>
                <XAxis dataKey="month" tick={{ fontSize:12, fill:'#9C8470', fontFamily:"'DM Sans',sans-serif" }} axisLine={false} tickLine={false}/>
                <YAxis tick={{ fontSize:11, fill:'#9C8470' }} axisLine={false} tickLine={false} tickFormatter={v=>`$${v}`}/>
                <Tooltip content={<CustomTooltip/>}/>
                <Bar dataKey="income" fill="#7C8C5E" radius={[4,4,0,0]}/>
                <Bar dataKey="expenses" fill="#C4AE8F" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* INCOME */}
      {activeTab === 'income' && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14 }}>
            {[
              { label:'Service Income', value:`$${totalIncome.toLocaleString()}`,                  color:'#7C8C5E', bg:'#EEF3E6' },
              { label:'POS Income',     value:`$${posIncomeValue.toLocaleString()}`,               color:'#A0673A', bg:'#F5F1E0' },
              { label:'Total Income',   value:`$${(totalIncome+posIncomeValue).toLocaleString()}`, color:'#3D2314', bg:'#F0EAE3' },
            ].map(k => (
              <div key={k.label} style={{ background:'#FAF7F2', borderRadius:12, padding:18, border:'1px solid #E0D5C1', boxShadow:'0 2px 12px rgba(61,35,20,0.08)' }}>
                <div style={{ fontSize:'0.72rem', textTransform:'uppercase', letterSpacing:'0.1em', color:'#9C8470', marginBottom:8 }}>{k.label}</div>
                <div style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'1.9rem', fontWeight:500, color:k.color }}>{k.value}</div>
              </div>
            ))}
          </div>

          <Card title="Service Income Log" action="Log Income" onAction={() => setShowIncModal(true)}>
            {loading ? (
              <div style={{ padding:'32px', textAlign:'center', color:'#C4AE8F', fontSize:'0.88rem' }}>Loading…</div>
            ) : incomeItems.length === 0 ? (
              <div style={{ padding:'32px', textAlign:'center', color:'#9C8470', fontSize:'0.88rem' }}>No income logged yet.</div>
            ) : (
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead><tr>{['Date','Description','Method','Amount',''].map(h=><th key={h} style={{ fontSize:'0.72rem', textTransform:'uppercase', letterSpacing:'0.1em', color:'#9C8470', padding:'10px 16px', textAlign:'left', borderBottom:'1.5px solid #E0D5C1', fontWeight:500 }}>{h}</th>)}</tr></thead>
                <tbody>
                  {incomeItems.map((inc, i) => (
                    <tr key={inc.id}
                      style={{ cursor:'default' }}
                      onMouseEnter={e => { e.currentTarget.style.background='#F5F0E8'; e.currentTarget.querySelector('.row-actions').style.opacity='1'; }}
                      onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.querySelector('.row-actions').style.opacity='0'; }}>
                      <td style={{ padding:'11px 16px', fontSize:'0.84rem', color:'#9C8470', borderBottom:i<incomeItems.length-1?'1px solid #E0D5C1':'none' }}>{inc.date}</td>
                      <td style={{ padding:'11px 16px', fontSize:'0.88rem', fontWeight:500, color:'#2A1A0E', borderBottom:i<incomeItems.length-1?'1px solid #E0D5C1':'none' }}>{inc.description}</td>
                      <td style={{ padding:'11px 16px', borderBottom:i<incomeItems.length-1?'1px solid #E0D5C1':'none' }}>{methodBadge(inc.method)}</td>
                      <td style={{ padding:'11px 16px', borderBottom:i<incomeItems.length-1?'1px solid #E0D5C1':'none' }}><span style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'1.05rem', fontWeight:500, color:'#4E6A2E' }}>+${Math.abs(inc.amount)}</span></td>
                      <td style={{ padding:'11px 16px', borderBottom:i<incomeItems.length-1?'1px solid #E0D5C1':'none' }}>
                        <RowActions item={inc} onEdit={item => openEdit(item, true)} onDelete={handleDelete} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={{ padding:'12px 16px', borderTop:'1.5px solid #E0D5C1', display:'flex', justifyContent:'flex-end', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:'0.78rem', color:'#9C8470', textTransform:'uppercase', letterSpacing:'0.08em' }}>Total Service Income</span>
              <span style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'1.4rem', fontWeight:500, color:'#3D2314' }}>${totalIncome.toLocaleString()}</span>
            </div>
          </Card>
        </div>
      )}

      {/* EXPENSES */}
      {activeTab === 'expenses' && (
        <div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:16 }}>
            <Card title="Monthly Expenses (Cash Basis)">
              <div style={{ padding:'20px', textAlign:'center' }}>
                <div style={{ fontSize:'0.78rem', color:'#9C8470', marginBottom:8 }}>What actually left your bank this month</div>
                <div style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'2.5rem', fontWeight:500, color:'#8C3A3A' }}>${monthlyExpenses.toLocaleString()}</div>
              </div>
            </Card>
            <Card title="Actual Expenses (Accrual)">
              <div style={{ padding:'20px', textAlign:'center' }}>
                <div style={{ fontSize:'0.78rem', color:'#9C8470', marginBottom:8 }}>Operational costs only — excludes inventory & advance payments</div>
                <div style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'2.5rem', fontWeight:500, color:'#3D2314' }}>${actualExpenses.toLocaleString()}</div>
              </div>
            </Card>
          </div>

          <Card title="Expense Log" action="Log Expense" onAction={() => setShowExpModal(true)}>
            {loading ? (
              <div style={{ padding:'32px', textAlign:'center', color:'#C4AE8F', fontSize:'0.88rem' }}>Loading…</div>
            ) : expenseItems.length === 0 ? (
              <div style={{ padding:'32px', textAlign:'center', color:'#9C8470', fontSize:'0.88rem' }}>No expenses logged yet.</div>
            ) : (
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr>{['Date','Category','Description','Method','Amount','Type',''].map(h=><th key={h} style={{ fontSize:'0.72rem', textTransform:'uppercase', letterSpacing:'0.1em', color:'#9C8470', padding:'10px 16px', textAlign:'left', borderBottom:'1.5px solid #E0D5C1', fontWeight:500 }}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {expenseItems.map((exp, i) => {
                    let typeLabel = 'Normal';
                    if (exp.isLumpSum)     typeLabel = '💰 Lump Sum';
                    else if (exp.isAllocated)  typeLabel = '📅 Allocated';
                    else if (exp.isPOSPurchase) typeLabel = '🏪 POS';
                    return (
                      <tr key={exp.id}
                        onMouseEnter={e => { e.currentTarget.style.background='#F5F0E8'; e.currentTarget.querySelector('.row-actions').style.opacity='1'; }}
                        onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.querySelector('.row-actions').style.opacity='0'; }}>
                        <td style={{ padding:'11px 16px', fontSize:'0.84rem', color:'#9C8470', borderBottom: i<expenseItems.length-1?'1px solid #E0D5C1':'none' }}>{exp.date}</td>
                        <td style={{ padding:'11px 16px', borderBottom: i<expenseItems.length-1?'1px solid #E0D5C1':'none' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                            <span style={{ width:9, height:9, borderRadius:'50%', background: CATEGORY_COLORS[exp.category] || '#9C8470', display:'inline-block', flexShrink:0 }}/>
                            <span style={{ fontSize:'0.84rem', fontWeight:500, color:'#2A1A0E' }}>{exp.category}</span>
                          </div>
                        </td>
                        <td style={{ padding:'11px 16px', fontSize:'0.84rem', color:'#6B5744', borderBottom: i<expenseItems.length-1?'1px solid #E0D5C1':'none' }}>{exp.description}</td>
                        <td style={{ padding:'11px 16px', borderBottom: i<expenseItems.length-1?'1px solid #E0D5C1':'none' }}>{methodBadge(exp.method)}</td>
                        <td style={{ padding:'11px 16px', borderBottom: i<expenseItems.length-1?'1px solid #E0D5C1':'none' }}>
                          <span style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'1.05rem', fontWeight:500, color: exp.isLumpSum ? '#8C3A3A' : '#A0673A' }}>${exp.amount}</span>
                        </td>
                        <td style={{ padding:'11px 16px', fontSize:'0.7rem', borderBottom: i<expenseItems.length-1?'1px solid #E0D5C1':'none' }}>{typeLabel}</td>
                        <td style={{ padding:'11px 16px', borderBottom: i<expenseItems.length-1?'1px solid #E0D5C1':'none' }}>
                          <RowActions item={exp} onEdit={item => openEdit(item, false)} onDelete={handleDelete} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      )}

      {showExpModal && <LogExpenseModal onClose={() => setShowExpModal(false)} addExpense={addExpense} products={products} addProduct={addProduct} restockProduct={restockProduct} />}
      {showIncModal && <LogIncomeModal  onClose={() => setShowIncModal(false)}  addExpense={addExpense} />}
      {editingEntry  && <EditEntryModal entry={editingEntry} isIncome={editIsIncome} onClose={() => setEditingEntry(null)} onSave={handleUpdate} />}

      <style>{`
        .row-actions { transition: opacity 0.15s; }
        @media (max-width:1100px) { .fin-resp { grid-template-columns: repeat(3,1fr) !important; } }
        @media (max-width:750px)  { .fin-resp { grid-template-columns: repeat(2,1fr) !important; } }
        @media (max-width:500px)  { .fin-resp { grid-template-columns: 1fr !important; } }
      `}</style>
    </div>
  );
}