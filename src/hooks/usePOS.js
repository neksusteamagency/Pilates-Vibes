import { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import {
  collection, onSnapshot, doc,
  addDoc, updateDoc, deleteDoc,
  getDocs, query, orderBy, where,
  serverTimestamp, increment,
} from 'firebase/firestore';

// ── Products (real-time) ─────────────────────────────────────
export function usePOSProducts() {
  const [products, setProducts] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  useEffect(() => {
    const q = query(collection(db, 'pos_products'), orderBy('category'), orderBy('name'));
    const unsub = onSnapshot(q, (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => {
      console.error('usePOSProducts:', err);
      setError(err.message);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  async function addProduct(data) {
    return await addDoc(collection(db, 'pos_products'), {
      ...data,
      createdAt: serverTimestamp(),
    });
  }

  async function updateProduct(id, data) {
    await updateDoc(doc(db, 'pos_products', id), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  }

  async function removeProduct(id) {
    await deleteDoc(doc(db, 'pos_products', id));
  }

  // Restock: increment stock by qty
  async function restockProduct(id, qty) {
    await updateDoc(doc(db, 'pos_products', id), {
      stock:     increment(qty),
      updatedAt: serverTimestamp(),
    });
  }

  // Deduct stock after a sale
  async function deductStock(id, qty) {
    await updateDoc(doc(db, 'pos_products', id), {
      stock:     increment(-qty),
      updatedAt: serverTimestamp(),
    });
  }

  return {
    products, loading, error,
    addProduct, updateProduct, removeProduct,
    restockProduct, deductStock,
  };
}

// ── Sales (on-demand) ────────────────────────────────────────
export function usePOSSales() {
  const [sales,   setSales]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  // Fetch sales for a specific date (YYYY-MM-DD)
  async function fetchSalesByDate(date) {
    setLoading(true);
    try {
      const q = query(
        collection(db, 'pos_sales'),
        where('date', '==', date),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      setSales(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('usePOSSales fetchByDate:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Fetch sales for a month (YYYY-MM)
  async function fetchSalesByMonth(month) {
    setLoading(true);
    try {
      const startDate = `${month}-01`;
      const endDate   = `${month}-31`;
      const q = query(
        collection(db, 'pos_sales'),
        where('date', '>=', startDate),
        where('date', '<=', endDate),
        orderBy('date', 'desc')
      );
      const snap = await getDocs(q);
      setSales(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('usePOSSales fetchByMonth:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Fetch sales for a date range
  async function fetchSalesByRange(startDate, endDate) {
    setLoading(true);
    try {
      const q = query(
        collection(db, 'pos_sales'),
        where('date', '>=', startDate),
        where('date', '<=', endDate),
        orderBy('date', 'desc')
      );
      const snap = await getDocs(q);
      setSales(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('usePOSSales fetchByRange:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Record a sale + deduct stock in one go
  // items = [{ productId, name, qty, price }]
  // method: 'cash' | 'free'
  // date:   'YYYY-MM-DD'
  async function recordSale({ items, total, method, date }) {
    const month = date.slice(0, 7); // store month for easy monthly queries
    const saleRef = await addDoc(collection(db, 'pos_sales'), {
      items,
      total: method === 'free' ? 0 : total,
      method,
      date,
      month,
      createdAt: serverTimestamp(),
    });
    return saleRef;
  }

  // ── Computed helpers ──────────────────────────────────────────
  // Only count cash sales towards revenue (free = $0 income)
  const totalRevenue = sales
    .filter(s => s.method !== 'free')
    .reduce((s, sale) => s + (sale.total || 0), 0);

  const totalItems = sales.reduce(
    (s, sale) => s + sale.items.reduce((a, i) => a + i.qty, 0), 0
  );

  const freeSales = sales.filter(s => s.method === 'free').length;

  return {
    sales, loading, error,
    fetchSalesByDate, fetchSalesByMonth, fetchSalesByRange, recordSale,
    totalRevenue, totalItems, freeSales,
  };
}