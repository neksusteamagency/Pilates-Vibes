import { useState } from 'react';
import { db } from '../firebase/config';
import {
  collection, doc,
  addDoc, updateDoc, deleteDoc,
  getDocs, query, where, orderBy,
  serverTimestamp,
} from 'firebase/firestore';

export function useExpenses() {
  const [expenses, setExpenses] = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);

  // Fetch ALL expenses that are relevant to a month:
  // - Normal / POS / income entries whose 'month' field matches
  // - Allocated (accrual) advance entries whose 'date' starts with targetMonth
  // - Lump-sum entries whose 'originalPaymentDate' starts with targetMonth
  async function fetchByMonth(month) {
    setLoading(true);
    try {
      // We fetch all expenses then filter client-side to cover all 3 cases above
      // (Firestore OR queries need multiple reads; easier to pull & filter for small datasets)
      const snap = await getDocs(
        query(collection(db, 'expenses'), orderBy('date', 'desc'))
      );
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Keep an entry if it belongs to this month in ANY capacity
      const filtered = all.filter(e => {
        if (e.isLumpSum)    return e.originalPaymentDate?.startsWith(month);
        if (e.isAllocated)  return e.date?.startsWith(month);
        return e.month === month; // normal, POS, income
      });

      setExpenses(filtered);
    } catch (err) {
      console.error('useExpenses fetchByMonth:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Fetch expenses for a date range (cash basis range queries)
  async function fetchByRange(startDate, endDate) {
    setLoading(true);
    try {
      const q = query(
        collection(db, 'expenses'),
        where('date', '>=', startDate),
        where('date', '<=', endDate),
        orderBy('date', 'desc')
      );
      const snap = await getDocs(q);
      setExpenses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('useExpenses fetchByRange:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function addExpense(data) {
    const month = data.date.slice(0, 7);
    return await addDoc(collection(db, 'expenses'), {
      ...data,
      month,
      createdAt: serverTimestamp(),
    });
  }

  async function updateExpense(id, data) {
    const month = data.date ? data.date.slice(0, 7) : undefined;
    await updateDoc(doc(db, 'expenses', id), {
      ...data,
      ...(month && { month }),
      updatedAt: serverTimestamp(),
    });
  }

  async function removeExpense(id) {
    await deleteDoc(doc(db, 'expenses', id));
  }

  // ── Monthly Expenses (Cash Basis) ────────────────────────────
  // What actually left the bank this month:
  // • Lump-sum advance payments paid this month → full lump amount
  // • Normal / POS purchases paid this month → their amount
  // • Allocated (accrual) entries are EXCLUDED (they are virtual splits)
  function getMonthlyExpensesForMonth(expensesList, targetMonth) {
    return expensesList.reduce((sum, exp) => {
      if (exp.isIncome)   return sum; // skip income entries
      if (exp.isAllocated) return sum; // skip accrual splits — they're virtual

      // Lump-sum: the real cash payment happened on originalPaymentDate
      if (exp.isLumpSum) {
        return exp.originalPaymentDate?.startsWith(targetMonth)
          ? sum + (exp.totalAdvanceAmount || exp.amount || 0)
          : sum;
      }

      // Normal / POS: cash left bank on exp.date
      if (exp.date?.startsWith(targetMonth)) {
        return sum + (exp.amount || 0);
      }

      return sum;
    }, 0);
  }

  // ── Actual Expenses (Accrual Basis) ──────────────────────────
  // True monthly cost for trend analysis:
  // • Allocated entries (monthly rent split) → their per-month amount
  // • Normal / POS expenses → their full amount (already one-month cash events)
  // • Lump-sum entries are EXCLUDED (replaced by their allocated splits)
  function getActualExpensesForMonth(expensesList, targetMonth) {
    return expensesList.reduce((sum, exp) => {
      if (exp.isIncome)  return sum;
      if (exp.isLumpSum) return sum; // excluded — the allocated splits cover it

      if (exp.isAllocated) {
        // Only count the allocated entry for this target month
        return exp.date?.startsWith(targetMonth)
          ? sum + (exp.amount || 0)
          : sum;
      }

      // Normal / POS — count if it falls in this month
      if (exp.date?.startsWith(targetMonth)) {
        return sum + (exp.amount || 0);
      }

      return sum;
    }, 0);
  }

  // Legacy helpers (still used by overview cards when expenses state is already filtered)
  const totalExpenses = expenses
    .filter(e => !e.isIncome && !e.isLumpSum)
    .reduce((s, e) => s + (e.amount || 0), 0);

  const byCategory = expenses
    .filter(e => !e.isIncome && !e.isLumpSum)
    .reduce((acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + (e.amount || 0);
      return acc;
    }, {});

  return {
    expenses, loading, error,
    fetchByMonth, fetchByRange,
    addExpense, updateExpense, removeExpense,
    totalExpenses, byCategory,
    getMonthlyExpensesForMonth,
    getActualExpensesForMonth,
  };
}