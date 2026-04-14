import { useState, useEffect } from 'react';
import { ShoppingCart, Plus, Minus, Trash2, Package, TrendingUp, DollarSign, ChevronRight, X, Check, AlertTriangle, Edit2 } from 'lucide-react';
import { usePOSProducts, usePOSSales } from '../../hooks/usePOS';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

const CATEGORIES = ['All', 'Drinks', 'Snacks', 'Apparel', 'Equipment'];

function StatCard({ label, value, sub, icon: Icon, color }) {
  return (
    <div style={{ background: '#FAF7F2', borderRadius: 14, padding: 20, border: '1px solid #E0D5C1', boxShadow: '0 2px 16px rgba(61,35,20,0.10)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9C8470' }}>{label}</span>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={15} color={color} />
        </div>
      </div>
      <div style={{ fontFamily: "'Cormorant Garant', serif", fontSize: '2rem', fontWeight: 500, color: '#3D2314', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '0.78rem', color: '#7C8C5E', marginTop: 5 }}>{sub}</div>
    </div>
  );
}

function Card({ title, children, action, onAction }) {
  return (
    <div style={{ background: '#FAF7F2', borderRadius: 14, boxShadow: '0 2px 16px rgba(61,35,20,0.10)', padding: 22, border: '1px solid #E0D5C1' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ fontFamily: "'Cormorant Garant', serif", fontSize: '1.15rem', fontWeight: 500, color: '#3D2314' }}>{title}</span>
        {action && (
          <button onClick={onAction} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.78rem', color: '#A0673A', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
            {action} <ChevronRight size={13} />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

// ── Checkout Modal ────────────────────────────────────────────
function CheckoutModal({ cart, products, onClose, onConfirm }) {
  const [method, setMethod] = useState('cash');
  const total = cart.reduce((sum, item) => {
    const p = products.find(p => p.id === item.id);
    return sum + (p?.price || 0) * item.qty;
  }, 0);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(61,35,20,0.35)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#FAF7F2', borderRadius: 16, padding: 28, width: '100%', maxWidth: 420, boxShadow: '0 8px 40px rgba(61,35,20,0.18)', border: '1px solid #E0D5C1' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontFamily: "'Cormorant Garant', serif", fontSize: '1.3rem', fontWeight: 500, color: '#3D2314' }}>Checkout</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9C8470' }}><X size={18} /></button>
        </div>
        {cart.map(item => {
          const p = products.find(p => p.id === item.id);
          return (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #E0D5C1', fontSize: '0.88rem', color: '#2A1A0E' }}>
              <span>{p?.emoji} {p?.name} × {item.qty}</span>
              <span style={{ color: '#A0673A', fontWeight: 500 }}>${(p?.price * item.qty).toFixed(2)}</span>
            </div>
          );
        })}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 0', fontWeight: 600, fontSize: '1rem', color: '#3D2314' }}>
          <span>Total</span>
          <span style={{ fontFamily: "'Cormorant Garant', serif", fontSize: '1.3rem' }}>
            {method === 'free' ? '$0.00' : `$${total.toFixed(2)}`}
          </span>
        </div>
        <div style={{ marginBottom: 20, marginTop: 16 }}>
          <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9C8470', marginBottom: 10 }}>Payment Method</div>
          <div style={{ display: 'flex', gap: 10 }}>
            {['cash', 'free'].map(m => (
              <button key={m} onClick={() => setMethod(m)} style={{
                flex: 1, padding: '10px 0', borderRadius: 8, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                fontSize: '0.88rem', fontWeight: 500, transition: 'all 0.18s',
                background: method === m ? '#3D2314' : '#FAF7F2',
                color: method === m ? '#F5F0E8' : '#3D2314',
                border: method === m ? 'none' : '1.5px solid #E0D5C1',
              }}>
                {m === 'cash' ? '💵 Cash' : '🎁 Free'}
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => onConfirm(method)} style={{
          width: '100%', padding: '13px 0', borderRadius: 8, background: '#7C8C5E', color: '#fff',
          border: 'none', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontSize: '0.92rem', fontWeight: 600,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <Check size={16} /> Confirm Sale
        </button>
      </div>
    </div>
  );
}

// ── Restock Modal ─────────────────────────────────────────────
function RestockModal({ product, onClose, onSave }) {
  const [qty, setQty] = useState('');
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(61,35,20,0.35)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#FAF7F2', borderRadius: 16, padding: 28, width: '100%', maxWidth: 360, boxShadow: '0 8px 40px rgba(61,35,20,0.18)', border: '1px solid #E0D5C1' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontFamily: "'Cormorant Garant', serif", fontSize: '1.2rem', fontWeight: 500, color: '#3D2314' }}>Restock — {product.emoji} {product.name}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9C8470' }}><X size={18} /></button>
        </div>
        <div style={{ fontSize: '0.85rem', color: '#9C8470', marginBottom: 16 }}>Current stock: <strong style={{ color: '#3D2314' }}>{product.stock}</strong></div>
        <input type="number" min="1" placeholder="Units to add" value={qty} onChange={e => setQty(e.target.value)}
          style={{ width: '100%', padding: '11px 14px', borderRadius: 8, border: '1.5px solid #E0D5C1', background: '#FFF', fontFamily: "'DM Sans', sans-serif", fontSize: '0.92rem', color: '#2A1A0E', outline: 'none', boxSizing: 'border-box', marginBottom: 16 }} />
        <button onClick={() => { if (qty > 0) onSave(product.id, parseInt(qty)); }} style={{
          width: '100%', padding: '12px 0', borderRadius: 8, background: '#3D2314', color: '#F5F0E8',
          border: 'none', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontSize: '0.9rem', fontWeight: 600,
        }}>Add Stock</button>
      </div>
    </div>
  );
}

// ── Add Product Modal ─────────────────────────────────────────
function AddProductModal({ onClose, addProduct }) {
  const [form, setForm]   = useState({ name:'', category:'Drinks', price:'', stock:'', lowStock:'5', emoji:'📦' });
  const [saving, setSaving] = useState(false);
  const set = (k,v) => setForm(p => ({...p,[k]:v}));

  async function handleSave() {
    if (!form.name.trim() || !form.price || !form.stock) return toast.error('Name, price and stock are required.');
    setSaving(true);
    try {
      await addProduct({ name: form.name.trim(), category: form.category, price: Number(form.price), stock: Number(form.stock), lowStock: Number(form.lowStock) || 5, emoji: form.emoji });
      toast.success('Product added!');
      onClose();
    } catch { toast.error('Failed to add product.'); }
    finally  { setSaving(false); }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(61,35,20,0.35)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }} onClick={onClose}>
      <div style={{ background:'#FAF7F2', borderRadius:16, padding:28, width:'100%', maxWidth:400, boxShadow:'0 8px 40px rgba(61,35,20,0.18)', border:'1px solid #E0D5C1' }} onClick={e=>e.stopPropagation()}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <span style={{ fontFamily:"'Cormorant Garant',serif", fontSize:'1.2rem', fontWeight:500, color:'#3D2314' }}>Add Product</span>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#9C8470' }}><X size={18}/></button>
        </div>
        {[
          { label:'Name',       key:'name',     type:'text',   placeholder:'e.g. Still Water' },
          { label:'Emoji',      key:'emoji',     type:'text',   placeholder:'💧' },
          { label:'Price ($)',  key:'price',     type:'number', placeholder:'0.00' },
          { label:'Stock',      key:'stock',     type:'number', placeholder:'0' },
          { label:'Low Stock Alert', key:'lowStock', type:'number', placeholder:'5' },
        ].map(f => (
          <div key={f.key} style={{ marginBottom:12 }}>
            <label style={{ display:'block', fontSize:'0.75rem', fontWeight:500, color:'#6B5744', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>{f.label}</label>
            <input type={f.type} placeholder={f.placeholder} value={form[f.key]} onChange={e=>set(f.key,e.target.value)}
              style={{ width:'100%', padding:'10px 13px', border:'1.5px solid #E0D5C1', borderRadius:8, background:'#F5F0E8', fontFamily:"'DM Sans',sans-serif", fontSize:'0.88rem', color:'#2A1A0E', outline:'none', boxSizing:'border-box' }}/>
          </div>
        ))}
        <div style={{ marginBottom:16 }}>
          <label style={{ display:'block', fontSize:'0.75rem', fontWeight:500, color:'#6B5744', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>Category</label>
          <select value={form.category} onChange={e=>set('category',e.target.value)}
            style={{ width:'100%', padding:'10px 13px', border:'1.5px solid #E0D5C1', borderRadius:8, background:'#F5F0E8', fontFamily:"'DM Sans',sans-serif", fontSize:'0.88rem', color:'#2A1A0E', outline:'none', boxSizing:'border-box' }}>
            {CATEGORIES.filter(c=>c!=='All').map(c=><option key={c}>{c}</option>)}
          </select>
        </div>
        <button onClick={handleSave} disabled={saving} style={{ width:'100%', padding:'12px', borderRadius:8, background:'#3D2314', color:'#F5F0E8', border:'none', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", fontSize:'0.9rem', fontWeight:600, opacity:saving?0.6:1 }}>
          {saving ? 'Adding…' : 'Add Product'}
        </button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function AdminPOS() {
  const today = format(new Date(), 'yyyy-MM-dd');

  const { products, loading: loadingProducts, addProduct, restockProduct, deductStock } = usePOSProducts();
  const { sales, loading: loadingSales, fetchSalesByDate, recordSale, totalRevenue, totalItems, freeSales } = usePOSSales();

  const [cart,           setCart]           = useState([]);
  const [category,       setCategory]       = useState('All');
  const [showCheckout,   setShowCheckout]   = useState(false);
  const [showRestock,    setShowRestock]    = useState(null);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [successMsg,     setSuccessMsg]     = useState('');

  useEffect(() => { fetchSalesByDate(today); }, [today]);

  const filtered = category === 'All' ? products : products.filter(p => p.category === category);

  function addToCart(product) {
    if (product.stock === 0) return;
    setCart(prev => {
      const exists = prev.find(i => i.id === product.id);
      if (exists) return prev.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { id: product.id, qty: 1 }];
    });
  }

  function updateCartQty(id, delta) {
    setCart(prev => prev.map(i => i.id === id ? { ...i, qty: i.qty + delta } : i).filter(i => i.qty > 0));
  }

  async function handleConfirm(method) {
    const total = method === 'free' ? 0 : cart.reduce((sum, item) => {
      const p = products.find(p => p.id === item.id);
      return sum + (p?.price || 0) * item.qty;
    }, 0);

    const items = cart.map(item => {
      const p = products.find(p => p.id === item.id);
      return { productId: item.id, name: p?.name || '', qty: item.qty, price: p?.price || 0 };
    });

    try {
      await recordSale({ items, total, method, date: today });
      // Deduct stock for each item
      for (const item of cart) {
        await deductStock(item.id, item.qty);
      }
      await fetchSalesByDate(today); // refresh sales
      setCart([]);
      setShowCheckout(false);
      setSuccessMsg('Sale recorded successfully!');
      setTimeout(() => setSuccessMsg(''), 3000);
      toast.success('Sale recorded!');
    } catch {
      toast.error('Failed to record sale.');
    }
  }

  async function handleRestock(id, qty) {
    try {
      await restockProduct(id, qty);
      setShowRestock(null);
      toast.success('Stock updated!');
    } catch {
      toast.error('Failed to update stock.');
    }
  }

  const cartCount  = cart.reduce((s, i) => s + i.qty, 0);
  const lowStock   = products.filter(p => p.stock > 0 && p.stock <= (p.lowStock || 5));
  const outOfStock = products.filter(p => p.stock === 0);

  // Top item from today's sales
  const itemCounts = {};
  sales.forEach(s => s.items?.forEach(i => { itemCounts[i.name] = (itemCounts[i.name] || 0) + i.qty; }));
  const topItem = Object.entries(itemCounts).sort((a,b) => b[1]-a[1])[0];

  return (
    <div style={{ padding: '28px 32px 60px' }}>

      {successMsg && (
        <div style={{ position: 'fixed', top: 24, right: 24, zIndex: 2000, background: '#EEF3E6', border: '1px solid #C8D9B0', color: '#4E6A2E', borderRadius: 10, padding: '12px 20px', fontSize: '0.88rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 20px rgba(61,35,20,0.12)' }}>
          <Check size={15} /> {successMsg}
        </div>
      )}

      {showCheckout  && <CheckoutModal cart={cart} products={products} onClose={() => setShowCheckout(false)} onConfirm={handleConfirm} />}
      {showRestock   && <RestockModal  product={showRestock} onClose={() => setShowRestock(null)} onSave={handleRestock} />}
      {showAddProduct && <AddProductModal onClose={() => setShowAddProduct(false)} addProduct={addProduct} />}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }} className="pos-stats-resp">
        {[
          { label: 'Revenue Today',    value: `$${totalRevenue.toFixed(2)}`, sub: `${sales.length} transactions`,              icon: DollarSign,   color: '#A0673A' },
          { label: 'Items Sold',       value: totalItems,                    sub: `${Object.keys(itemCounts).length} products`, icon: ShoppingCart, color: '#7C8C5E' },
          { label: 'Top Item',         value: topItem?.[0] || '—',          sub: topItem ? `${topItem[1]} units` : 'No sales', icon: TrendingUp,   color: '#3D2314' },
          { label: 'Free Items Given', value: freeSales,                     sub: 'complimentary',                              icon: Package,      color: '#C4AE8F' },
        ].map(s => <StatCard key={s.label} {...s} />)}
      </div>

      {/* Low stock alert */}
      {(lowStock.length > 0 || outOfStock.length > 0) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderRadius: 8, fontSize: '0.82rem', marginBottom: 18, background: '#F7EDED', border: '1px solid #DDB0B0', color: '#8C3A3A' }}>
          <AlertTriangle size={15} style={{ flexShrink: 0 }} />
          <span>
            {lowStock.length > 0 && <>Low stock: <strong>{lowStock.map(p => p.name).join(', ')}</strong>. </>}
            {outOfStock.length > 0 && <>Out of stock: <strong>{outOfStock.map(p => p.name).join(', ')}</strong>.</>}
          </span>
        </div>
      )}

      {/* Main layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, marginBottom: 16 }} className="pos-main-resp">

        {/* Product Grid */}
        <Card title="Products">
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {CATEGORIES.map(cat => (
              <button key={cat} onClick={() => setCategory(cat)} style={{
                padding: '5px 14px', borderRadius: 20, fontSize: '0.78rem', fontWeight: 500,
                cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", transition: 'all 0.15s',
                background: category === cat ? '#3D2314' : '#FAF7F2',
                color: category === cat ? '#F5F0E8' : '#9C8470',
                border: category === cat ? 'none' : '1.5px solid #E0D5C1',
              }}>{cat}</button>
            ))}
          </div>

          {loadingProducts ? (
            <div style={{ textAlign:'center', padding:'32px 0', color:'#C4AE8F', fontSize:'0.88rem' }}>Loading products…</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign:'center', padding:'32px 0', color:'#9C8470', fontSize:'0.88rem' }}>No products yet. Add your first product!</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
              {filtered.map(product => {
                const inCart = cart.find(i => i.id === product.id);
                const isLow  = product.stock > 0 && product.stock <= (product.lowStock || 5);
                const isOut  = product.stock === 0;
                return (
                  <div key={product.id} onClick={() => !isOut && addToCart(product)} style={{
                    background: isOut ? '#F5F0E8' : '#FFFDF9',
                    border: inCart ? '2px solid #7C8C5E' : '1.5px solid #E0D5C1',
                    borderRadius: 12, padding: 14, cursor: isOut ? 'not-allowed' : 'pointer',
                    opacity: isOut ? 0.55 : 1, transition: 'all 0.15s', position: 'relative',
                    boxShadow: inCart ? '0 0 0 3px #7C8C5E22' : 'none',
                  }}
                    onMouseEnter={e => { if (!isOut) e.currentTarget.style.boxShadow = '0 4px 16px rgba(61,35,20,0.13)'; }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = inCart ? '0 0 0 3px #7C8C5E22' : 'none'; }}>
                    {inCart && (
                      <div style={{ position: 'absolute', top: 8, right: 8, width: 20, height: 20, borderRadius: '50%', background: '#7C8C5E', color: '#fff', fontSize: '0.68rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {inCart.qty}
                      </div>
                    )}
                    <div style={{ fontSize: '1.6rem', marginBottom: 6 }}>{product.emoji}</div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 500, color: '#2A1A0E', marginBottom: 3 }}>{product.name}</div>
                    <div style={{ fontFamily: "'Cormorant Garant', serif", fontSize: '1.05rem', color: '#A0673A', fontWeight: 500, marginBottom: 6 }}>${product.price?.toFixed(2)}</div>
                    <div style={{ fontSize: '0.7rem', fontWeight: 500, color: isOut ? '#8C3A3A' : isLow ? '#8C5A2A' : '#7C8C5E', background: isOut ? '#F7EDED' : isLow ? '#F5EDE8' : '#EEF3E6', padding: '2px 8px', borderRadius: 20, display: 'inline-block' }}>
                      {isOut ? 'Out of stock' : isLow ? `Low — ${product.stock} left` : `${product.stock} in stock`}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Cart */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card title={`Cart${cartCount > 0 ? ` (${cartCount})` : ''}`}>
            {cart.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: '#C4AE8F', fontSize: '0.85rem' }}>
                <ShoppingCart size={28} style={{ marginBottom: 8, opacity: 0.4 }} /><br />Tap a product to add it
              </div>
            ) : (
              <>
                {cart.map(item => {
                  const p = products.find(p => p.id === item.id);
                  return (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid #E0D5C1' }}>
                      <span style={{ fontSize: '1.2rem' }}>{p?.emoji}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 500, color: '#2A1A0E' }}>{p?.name}</div>
                        <div style={{ fontSize: '0.75rem', color: '#9C8470' }}>${p?.price?.toFixed(2)} each</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button onClick={() => updateCartQty(item.id, -1)} style={{ width: 22, height: 22, borderRadius: '50%', border: '1.5px solid #E0D5C1', background: '#FAF7F2', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3D2314' }}><Minus size={11} /></button>
                        <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#3D2314', minWidth: 16, textAlign: 'center' }}>{item.qty}</span>
                        <button onClick={() => updateCartQty(item.id, +1)} style={{ width: 22, height: 22, borderRadius: '50%', border: '1.5px solid #E0D5C1', background: '#FAF7F2', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3D2314' }}><Plus size={11} /></button>
                      </div>
                      <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#A0673A', minWidth: 44, textAlign: 'right' }}>${(p?.price * item.qty).toFixed(2)}</span>
                      <button onClick={() => setCart(prev => prev.filter(i => i.id !== item.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C4AE8F', padding: 2 }}><Trash2 size={13} /></button>
                    </div>
                  );
                })}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 0', fontWeight: 600, color: '#3D2314' }}>
                  <span style={{ fontSize: '0.88rem' }}>Total</span>
                  <span style={{ fontFamily: "'Cormorant Garant', serif", fontSize: '1.3rem' }}>
                    ${cart.reduce((sum, item) => { const p = products.find(p => p.id === item.id); return sum + (p?.price || 0) * item.qty; }, 0).toFixed(2)}
                  </span>
                </div>
                <button onClick={() => setShowCheckout(true)} style={{ marginTop: 12, width: '100%', padding: '12px 0', borderRadius: 8, background: '#3D2314', color: '#F5F0E8', border: 'none', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontSize: '0.92rem', fontWeight: 600 }}>
                  Checkout
                </button>
                <button onClick={() => setCart([])} style={{ marginTop: 6, width: '100%', padding: '9px 0', borderRadius: 8, background: 'transparent', color: '#9C8470', border: '1.5px solid #E0D5C1', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontSize: '0.82rem' }}>
                  Clear Cart
                </button>
              </>
            )}
          </Card>
        </div>
      </div>

      {/* Bottom row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }} className="pos-bottom-resp">

        {/* Inventory */}
        <Card title="Inventory Management">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Product', 'Category', 'Price', 'Stock'].map(h => (
                    <th key={h} style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9C8470', padding: '8px 10px', textAlign: 'left', borderBottom: '1.5px solid #E0D5C1', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {products.map((p, i) => {
                  const isLow = p.stock > 0 && p.stock <= (p.lowStock || 5);
                  const isOut = p.stock === 0;
                  return (
                    <tr key={p.id}
                      onMouseEnter={e => e.currentTarget.style.background = '#F5F0E8'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ padding: '10px 10px', fontSize: '0.88rem', color: '#2A1A0E', borderBottom: '1px solid #E0D5C1' }}>{p.emoji} {p.name}</td>
                      <td style={{ padding: '10px 10px', fontSize: '0.78rem', color: '#9C8470', borderBottom: '1px solid #E0D5C1' }}>{p.category}</td>
                      <td style={{ padding: '10px 10px', fontSize: '0.88rem', color: '#A0673A', fontWeight: 500, borderBottom: '1px solid #E0D5C1' }}>${p.price?.toFixed(2)}</td>
                      <td style={{ padding: '10px 10px', borderBottom: '1px solid #E0D5C1' }}>
                        <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 500, background: isOut ? '#F7EDED' : isLow ? '#F5EDE8' : '#EEF3E6', color: isOut ? '#8C3A3A' : isLow ? '#4E6A2E' : '#4E6A2E' }}>
                          {p.stock}
                        </span>
                      </td>
                      <td style={{ padding: '10px 10px', borderBottom: '1px solid #E0D5C1' }}></td>
                    </tr>
                  );
                })}
                {products.length === 0 && (
                  <tr><td colSpan={5} style={{ padding:'24px', textAlign:'center', color:'#9C8470', fontSize:'0.85rem' }}>No products yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Recent Sales */}
        <Card title="Today's Sales">
          {loadingSales ? (
            <div style={{ textAlign:'center', padding:'24px 0', color:'#C4AE8F', fontSize:'0.85rem' }}>Loading sales…</div>
          ) : sales.length === 0 ? (
            <div style={{ textAlign:'center', padding:'24px 0', color:'#C4AE8F', fontSize:'0.85rem' }}>No sales yet today.</div>
          ) : sales.map((s, i) => (
            <div key={s.id || i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < sales.length - 1 ? '1px solid #E0D5C1' : 'none' }}>
              <div style={{ textAlign: 'center', minWidth: 52 }}>
                <div style={{ fontSize: '0.78rem', color: '#9C8470' }}>
                  {s.createdAt?.toDate ? format(s.createdAt.toDate(), 'h:mm a') : '—'}
                </div>
              </div>
              <div style={{ width: 1.5, height: 32, background: '#E0D5C1', borderRadius: 2, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.82rem', color: '#2A1A0E', fontWeight: 500, marginBottom: 2 }}>
                  {s.items?.map(i => `${i.name} × ${i.qty}`).join(', ')}
                </div>
                <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: 20, background: s.method === 'free' ? '#EEF3E6' : '#F5EDE8', color: s.method === 'free' ? '#4E6A2E' : '#8C5A2A', fontWeight: 500 }}>
                  {s.method === 'free' ? '🎁 Free' : '💵 Cash'}
                </span>
              </div>
              <span style={{ fontFamily: "'Cormorant Garant', serif", fontSize: '1.1rem', fontWeight: 500, color: '#A0673A' }}>${s.total?.toFixed(2)}</span>
            </div>
          ))}
        </Card>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .pos-main-resp   { grid-template-columns: 1fr !important; }
          .pos-bottom-resp { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 700px) {
          .pos-stats-resp  { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>
    </div>
  );
}