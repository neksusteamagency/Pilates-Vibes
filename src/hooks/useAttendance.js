import { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import {
  collection, onSnapshot, doc, getDoc, getDocs,
  addDoc, updateDoc, setDoc,
  query, where, orderBy, serverTimestamp, writeBatch, runTransaction,
} from 'firebase/firestore';
import { format } from 'date-fns';

export function useAttendance(filters = {}) {
  const [attendance, setAttendance] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);

  useEffect(() => {
    // BUG FIX #7: Support date range filter to avoid loading the entire collection.
    // Callers can pass { dateFrom, dateTo } for week-scoped queries.
    let q = query(collection(db, 'attendance'), orderBy('date', 'desc'));
    if (filters.classId)  q = query(q, where('classId',  '==', filters.classId));
    if (filters.date)     q = query(q, where('date',     '==', filters.date));
    if (filters.clientId) q = query(q, where('clientId', '==', filters.clientId));
    if (filters.dateFrom) q = query(q, where('date',     '>=', filters.dateFrom));
    if (filters.dateTo)   q = query(q, where('date',     '<=', filters.dateTo));

    const unsub = onSnapshot(q, (snap) => {
      setAttendance(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => {
      console.error('useAttendance:', err);
      setError(err.message);
      setLoading(false);
    });
    return () => unsub();
  }, [filters.classId, filters.date, filters.clientId, filters.dateFrom, filters.dateTo]);

  // ── Deduct session from client balance (inside a transaction to prevent race conditions) ──
  // BUG FIX #5: Use runTransaction to safely read-then-write atomically.
  async function deductClientSession(clientId) {
    if (!clientId) return false;

    return await runTransaction(db, async (transaction) => {
      const clientRef  = doc(db, 'clients', clientId);
      const clientSnap = await transaction.get(clientRef);
      if (!clientSnap.exists()) return false;

      const clientData       = clientSnap.data();
      const currentRemaining = clientData.sessionsRemaining || 0;
      if (currentRemaining <= 0) return false;

      const newRemaining = currentRemaining - 1;
      const newUsed      = (clientData.sessionsUsed || 0) + 1;

      transaction.update(clientRef, {
        sessionsRemaining: newRemaining,
        sessionsUsed:      newUsed,
        status: newRemaining === 0 ? 'expired' : newRemaining <= 2 ? 'low' : 'active',
        updatedAt: serverTimestamp(),
      });
      return true;
    });
  }

  // ── Update trainer stats — safe, idempotent, one count per class per date ──
  // BUG FIX #1: Use a flag on the class doc itself (counted_YYYY-MM-DD) instead of
  // querying attendance records (which were just written and are always present).
  // We also mark the flag BEFORE updating trainer stats to prevent any race condition.
  async function updateTrainerStats(classId, dateStr) {
    const classRef  = doc(db, 'classes', classId);
    const classSnap = await getDoc(classRef);
    if (!classSnap.exists()) return;

    const classData  = classSnap.data();
    const countedKey = `counted_${dateStr}`;

    // Already counted for this specific date — skip
    if (classData[countedKey]) {
      console.log('Trainer stats already counted for this class/date — skipping.');
      return;
    }

    const trainerName = classData.trainer;
    if (!trainerName) return;

    // Mark as counted FIRST to prevent duplicate calls from re-saves
    await updateDoc(classRef, { [countedKey]: true });

    // Find trainer doc by name
    const trainersRef  = collection(db, 'trainers');
    const q            = query(trainersRef, where('name', '==', trainerName));
    const trainerSnap  = await getDocs(q);
    if (trainerSnap.empty) return;

    const trainerDoc  = trainerSnap.docs[0];
    const trainerData = trainerDoc.data();
    const classMonth  = dateStr.slice(0, 7);
    const currentMonth = format(new Date(), 'yyyy-MM');
    const isThisMonth  = classMonth === currentMonth;

    await updateDoc(doc(db, 'trainers', trainerDoc.id), {
      classesThisMonth: (trainerData.classesThisMonth || 0) + (isThisMonth ? 1 : 0),
      totalClasses:     (trainerData.totalClasses     || 0) + 1,
      updatedAt:        serverTimestamp(),
    });
  }

  // ── Update booking status for a client in a given class/week ──
  async function updateBookingStatus(classId, clientId, weekOf, status) {
    if (!clientId || !weekOf) return;

    const bookingsRef = collection(db, 'bookings');
    const q = query(
      bookingsRef,
      where('classId',  '==', classId),
      where('clientId', '==', clientId),
      where('weekOf',   '==', weekOf)
    );

    const snapshot = await getDocs(q);
    if (snapshot.empty) return;

    const batch = writeBatch(db);
    snapshot.docs.forEach(bookingDoc => {
      batch.update(doc(db, 'bookings', bookingDoc.id), {
        status:    status,
        updatedAt: serverTimestamp(),
      });
    });
    await batch.commit();
  }

  // ── Log or update a single attendance record ──
  // BUG FIX #2 & #3:
  //   - Check `sessionDeducted` flag before deducting to prevent double-deduction on re-save.
  //   - Accept weekOf and pass it through correctly so booking status updates work.
  async function logAttendance(classId, clientId, date, status, weekOf = null) {
    if (!clientId) return;

    const docId  = `${classId}_${clientId}_${date}`;
    const attRef = doc(db, 'attendance', docId);

    // Read existing record to check if session was already deducted
    const existingSnap  = await getDoc(attRef);
    const alreadyDeducted = existingSnap.exists() && existingSnap.data().sessionDeducted === true;

    const shouldDeduct = !alreadyDeducted && (status === 'attended' || status === 'no-show');

    // Write attendance doc
    await setDoc(attRef, {
      classId,
      clientId,
      date,
      status,
      sessionDeducted: alreadyDeducted || shouldDeduct,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    // BUG FIX #4: weekOf must be the week-start date matching how bookings are stored.
    // Fallback to date only if no weekOf is provided (e.g. from AdminOverview quick-toggle).
    const bookingWeekOf = weekOf || date;
    await updateBookingStatus(classId, clientId, bookingWeekOf, status);

    // Deduct session only if not already done
    if (shouldDeduct) {
      await deductClientSession(clientId);
    }
  }

  // ── Save entire class attendance in one batch ──
  // BUG FIX #4: weekOf is now properly accepted and forwarded.
  async function saveClassAttendance(classId, date, logs, weekOf = null) {
    const promises = Object.entries(logs).map(([clientId, status]) =>
      logAttendance(classId, clientId, date, status, weekOf)
    );
    await Promise.all(promises);

    // BUG FIX #1: updateTrainerStats is now idempotent — safe to always call.
    await updateTrainerStats(classId, date);
  }

  // ── Add a walk-in non-member ──
  async function addWalkIn(classId, date, name) {
    return await addDoc(collection(db, 'attendance'), {
      classId,
      date,
      clientId:   null,
      clientName: name,
      isWalkIn:   true,
      status:     'attended',
      createdAt:  serverTimestamp(),
    });
  }

  const attended = attendance.filter(a => a.status === 'attended');
  const noShows  = attendance.filter(a => a.status === 'no-show');

  return {
    attendance, attended, noShows,
    loading, error,
    logAttendance, saveClassAttendance, addWalkIn,
  };
}