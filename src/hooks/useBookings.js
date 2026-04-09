import { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import {
  collection, onSnapshot, doc, getDoc,
  addDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp,
  writeBatch,
} from 'firebase/firestore';

export function useBookings(filters = {}) {
  const [bookings, setBookings] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  useEffect(() => {
    const constraints = [orderBy('createdAt', 'desc')];
    if (filters.classId)  constraints.push(where('classId',  '==', filters.classId));
    if (filters.clientId) constraints.push(where('clientId', '==', filters.clientId));
    if (filters.weekOf)   constraints.push(where('weekOf',   '==', filters.weekOf));

    const q = query(collection(db, 'bookings'), ...constraints);
    const unsub = onSnapshot(q, (snap) => {
      setBookings(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => {
      console.error('useBookings:', err);
      setError(err.message);
      setLoading(false);
    });
    return () => unsub();
  }, [filters.classId, filters.clientId, filters.weekOf]);

  // ── Admin creates booking ──
  async function addBooking(classId, clientId, weekOf, classData, clientData) {
    const batch      = writeBatch(db);
    const bookingRef = doc(collection(db, 'bookings'));

    batch.set(bookingRef, {
      classId, clientId, weekOf,
      status:        'confirmed',
      paymentStatus: 'paid',
      createdAt:     serverTimestamp(),
    });

    if (classData) {
      const newBooked = (classData.booked || 0) + 1;
      batch.update(doc(db, 'classes', classId), {
        booked:    newBooked,
        status:    newBooked >= classData.capacity ? 'full' : 'available',
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
    return bookingRef.id;
  }

  // ── Client self-books ──
  async function addClientBooking(classId, clientId, weekOf, classData, clientData, paymentMethod) {
    const batch      = writeBatch(db);
    const bookingRef = doc(collection(db, 'bookings'));
    const hasPackage = clientData?.sessionsRemaining != null && clientData.sessionsRemaining > 0;

    batch.set(bookingRef, {
      classId, clientId, weekOf,
      status:        'confirmed',
      paymentStatus: hasPackage ? 'paid' : 'pending',
      paymentMethod: hasPackage ? 'package' : (paymentMethod || 'cash'),
      createdAt:     serverTimestamp(),
    });

    if (classData) {
      const newBooked = (classData.booked || 0) + 1;
      batch.update(doc(db, 'classes', classId), {
        booked:    newBooked,
        status:    newBooked >= classData.capacity ? 'full' : 'available',
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
    return bookingRef.id;
  }

  // ── Waitlist ──
  async function addToWaitlist(classId, clientId, weekOf, position) {
    return await addDoc(collection(db, 'bookings'), {
      classId, clientId, weekOf, position,
      status:        'waitlist',
      paymentStatus: 'pending',
      notifiedAt:    null,
      confirmBy:     null,
      createdAt:     serverTimestamp(),
    });
  }

  // ── Admin approves a specific waitlist entry → promotes to confirmed ──
  async function approveWaitlist(bookingId, classId, classData) {
    const batch = writeBatch(db);

    batch.update(doc(db, 'bookings', bookingId), {
      status:    'confirmed',
      updatedAt: serverTimestamp(),
    });

    if (classData) {
      const newBooked = (classData.booked || 0) + 1;
      batch.update(doc(db, 'classes', classId), {
        booked:    newBooked,
        status:    newBooked >= classData.capacity ? 'full' : 'available',
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  }

  // ── Admin rejects a waitlist entry ──
  async function rejectWaitlist(bookingId) {
    await updateDoc(doc(db, 'bookings', bookingId), {
      status:    'cancelled',
      updatedAt: serverTimestamp(),
    });
  }

  // ── Cancel (admin or within 24h window) ──
  async function cancelBooking(bookingId, classId, clientId, classData, clientData) {
    const batch = writeBatch(db);

    batch.update(doc(db, 'bookings', bookingId), {
      status: 'cancelled', updatedAt: serverTimestamp(),
    });

    if (classData) {
      const newBooked = Math.max(0, (classData.booked || 1) - 1);
      batch.update(doc(db, 'classes', classId), {
        booked:    newBooked,
        status:    newBooked >= classData.capacity ? 'full' : 'available',
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  }

  // ── Client cancels their own booking — blocked within 24h of class ──
  // classDate: 'yyyy-MM-dd', classTime: 'HH:mm'
  async function clientCancelBooking(bookingId, classId, classDate, classTime, classData) {
    // Build class datetime and check 24h window
    const classDateTime = new Date(`${classDate}T${classTime}:00`);
    const now           = new Date();
    const msUntilClass  = classDateTime - now;
    const hoursUntil    = msUntilClass / (1000 * 60 * 60);

    if (hoursUntil < 24) {
      throw new Error('WITHIN_24H');
    }

    const batch = writeBatch(db);

    batch.update(doc(db, 'bookings', bookingId), {
      status:       'cancelled',
      cancelledAt:  serverTimestamp(),
      updatedAt:    serverTimestamp(),
    });

    if (classData) {
      const newBooked = Math.max(0, (classData.booked || 1) - 1);
      batch.update(doc(db, 'classes', classId), {
        booked:    newBooked,
        status:    newBooked >= classData.capacity ? 'full' : 'available',
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  }

  // ── Admin confirms payment → auto-adds to Finance income ──
  async function confirmPayment(bookingId, amount, method, clientId, clientName, description) {
    const batch = writeBatch(db);
    const today = new Date().toISOString().split('T')[0];

    batch.update(doc(db, 'bookings', bookingId), {
      paymentStatus: 'paid',
      paidAt:        serverTimestamp(),
      updatedAt:     serverTimestamp(),
    });

    const incomeRef = doc(collection(db, 'expenses'));
    batch.set(incomeRef, {
      category:    'Income',
      description: `${clientName} — ${description}`,
      amount:      -Math.abs(amount),
      method,
      date:        today,
      month:       today.slice(0, 7),
      isIncome:    true,
      clientId,
      createdAt:   serverTimestamp(),
    });

    await batch.commit();
  }

  // ── Waitlist promotion ──
  async function notifyWaitlist(bookingId) {
    const confirmBy = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await updateDoc(doc(db, 'bookings', bookingId), {
      status: 'notified', notifiedAt: serverTimestamp(), confirmBy, updatedAt: serverTimestamp(),
    });
  }

  async function confirmWaitlist(bookingId) {
    await updateDoc(doc(db, 'bookings', bookingId), {
      status: 'confirmed', updatedAt: serverTimestamp(),
    });
  }

  async function removeBooking(bookingId) {
    await deleteDoc(doc(db, 'bookings', bookingId));
  }

  const confirmedBookings = bookings.filter(b => b.status === 'confirmed');
  const waitlist          = bookings
    .filter(b => ['waitlist', 'notified'].includes(b.status))
    .sort((a, b) => (a.position || 0) - (b.position || 0));
  const pendingPayments   = bookings.filter(b => b.paymentStatus === 'pending' && b.status === 'confirmed');

  return {
    bookings, confirmedBookings, waitlist, pendingPayments,
    loading, error,
    addBooking, addClientBooking, addToWaitlist,
    approveWaitlist, rejectWaitlist,
    cancelBooking, clientCancelBooking, confirmPayment,
    notifyWaitlist, confirmWaitlist, removeBooking,
  };
}