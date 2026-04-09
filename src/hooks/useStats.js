import { useState } from 'react';
import { db } from '../firebase/config';
import {
  collection, getDocs,
  query, where, orderBy,
} from 'firebase/firestore';

export function useStats() {
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  async function fetchStats(month) {
    // month = 'YYYY-MM'
    setLoading(true);
    try {
      const startDate = `${month}-01`;
      const endDate   = `${month}-31`;

      // Parallel fetches for performance
      const [clientsSnap, attendanceSnap, salesSnap, expensesSnap] = await Promise.all([
        getDocs(collection(db, 'clients')),
        getDocs(query(
          collection(db, 'attendance'),
          where('date', '>=', startDate),
          where('date', '<=', endDate)
        )),
        // POS sales for this month
        getDocs(query(
          collection(db, 'pos_sales'),
          where('date', '>=', startDate),
          where('date', '<=', endDate)
        )),
        // Fetch ALL expenses then filter — same strategy as useExpenses.fetchByMonth
        getDocs(collection(db, 'expenses')),
      ]);

      const clients    = clientsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const attendance = attendanceSnap.docs.map(d => d.data());
      const sales      = salesSnap.docs.map(d => d.data());
      const allExpenses = expensesSnap.docs.map(d => d.data());

      // ── Client stats ──────────────────────────────────────────
      const activeClients   = clients.filter(c => c.status === 'active' && !c.isFrozen).length;
      const lowClients      = clients.filter(c => c.status === 'low').length;
      const expiringClients = clients.filter(c => c.status === 'expiring').length;
      const frozenClients   = clients.filter(c => c.isFrozen).length;

      // ── Attendance stats ──────────────────────────────────────
      const totalAttended = attendance.filter(a => a.status === 'attended').length;
      const totalNoShows  = attendance.filter(a => a.status === 'no-show').length;

      // ── POS Income ────────────────────────────────────────────
      // Only cash sales count as income (free = $0)
      const posIncome = sales
        .filter(s => s.method !== 'free')
        .reduce((s, sale) => s + (sale.total || 0), 0);

      // ── Service Income (from income entries logged in Finance) ─
      const serviceIncome = allExpenses
        .filter(e => e.isIncome && e.month === month)
        .reduce((s, e) => s + Math.abs(e.amount || 0), 0);

      const totalIncome = serviceIncome + posIncome;

      // ── Actual Expenses (Accrual — for profit & reports) ──────
      // • Allocated entries for this month (rent split)
      // • Normal / POS expenses paid this month
      // • Lump-sum entries are EXCLUDED (their allocated splits are included above)
      const actualExpenses = allExpenses.reduce((sum, exp) => {
        if (exp.isIncome)  return sum;
        if (exp.isLumpSum) return sum; // covered by isAllocated splits

        if (exp.isAllocated) {
          return exp.date?.startsWith(month) ? sum + (exp.amount || 0) : sum;
        }

        // Normal or POS expense
        if (exp.date?.startsWith(month)) {
          return sum + (exp.amount || 0);
        }

        return sum;
      }, 0);

      // ── Monthly Expenses (Cash Basis) ─────────────────────────
      // What actually left the bank this month
      const monthlyExpenses = allExpenses.reduce((sum, exp) => {
        if (exp.isIncome)   return sum;
        if (exp.isAllocated) return sum; // virtual — skip

        if (exp.isLumpSum) {
          return exp.originalPaymentDate?.startsWith(month)
            ? sum + (exp.totalAdvanceAmount || exp.amount || 0)
            : sum;
        }

        if (exp.date?.startsWith(month)) {
          return sum + (exp.amount || 0);
        }

        return sum;
      }, 0);

      // Profit is based on actual expenses (accrual) for accurate trend
      const profit = totalIncome - actualExpenses;

      // ── Trainer performance ───────────────────────────────────
      const classesSnap = await getDocs(collection(db, 'classes'));
      const classesMap  = {};
      classesSnap.docs.forEach(d => { classesMap[d.id] = d.data(); });

      const trainerSessions = {};
      attendance.forEach(a => {
        if (a.status === 'attended' && a.classId) {
          const trainer = classesMap[a.classId]?.trainer || 'Unknown';
          trainerSessions[trainer] = (trainerSessions[trainer] || 0) + 1;
        }
      });

      const topTrainer = Object.entries(trainerSessions)
        .sort((a, b) => b[1] - a[1])[0] || null;

      setStats({
        clients: {
          total:    clients.length,
          active:   activeClients,
          low:      lowClients,
          expiring: expiringClients,
          frozen:   frozenClients,
        },
        attendance: {
          total:    totalAttended + totalNoShows,
          attended: totalAttended,
          noShows:  totalNoShows,
          rate:     totalAttended + totalNoShows > 0
            ? Math.round((totalAttended / (totalAttended + totalNoShows)) * 100)
            : 0,
        },
        finance: {
          serviceIncome,
          posIncome,
          totalIncome,
          monthlyExpenses,
          actualExpenses,
          profit,
        },
        trainers: {
          sessions: trainerSessions,
          top: topTrainer ? { name: topTrainer[0], sessions: topTrainer[1] } : null,
        },
      });
    } catch (err) {
      console.error('useStats:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return { stats, loading, error, fetchStats };
}