import { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import {
  collection, onSnapshot, doc,
  addDoc, updateDoc, deleteDoc,
  serverTimestamp, query, orderBy, where, getDocs,
} from 'firebase/firestore';
import { addDays, format } from 'date-fns';

export function useClasses() {
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    const q = query(collection(db, 'classes'), orderBy('date'), orderBy('time'));
    const unsub = onSnapshot(q, (snap) => {
      setClasses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => {
      console.error('useClasses:', err);
      setError(err.message);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  async function addClass(data) {
    return await addDoc(collection(db, 'classes'), {
      ...data,
      date:      data.date,
      booked:    0,
      status:    'available',
      createdAt: serverTimestamp(),
    });
  }

  // BUG FIX: Each recurring class now gets a unique date (startDate + i*7 days).
  // parentId links them together for bulk update/delete. 
  // Previously all 8 classes got the same date (startDate), causing the "8 classes on same day" bug.
  async function addRecurringClasses(baseData, startDate, dayOfWeek, numWeeks = 8) {
    const parentId = `recurring_${Date.now()}`;
    const classesToAdd = [];
    for (let i = 0; i < numWeeks; i++) {
      const classDate = addDays(startDate, i * 7);
      classesToAdd.push({
        ...baseData,
        date:      format(classDate, 'yyyy-MM-dd'),
        day:       dayOfWeek,
        parentId,
        booked:    0,
        status:    'available',
        createdAt: serverTimestamp(),
      });
    }
    const promises = classesToAdd.map(data => addDoc(collection(db, 'classes'), data));
    await Promise.all(promises);
    return classesToAdd.length;
  }

  async function updateClass(id, data) {
    await updateDoc(doc(db, 'classes', id), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  }

  async function updateFutureClasses(parentId, data, currentDate) {
    const q = query(
      collection(db, 'classes'),
      where('parentId', '==', parentId),
      where('date', '>=', currentDate)
    );
    const snapshot = await getDocs(q);
    const promises = snapshot.docs.map(docSnap =>
      updateDoc(doc(db, 'classes', docSnap.id), {
        ...data,
        updatedAt: serverTimestamp(),
      })
    );
    await Promise.all(promises);
  }

  async function removeClass(id) {
    await deleteDoc(doc(db, 'classes', id));
  }

  async function removeFutureClasses(parentId, currentDate) {
    const q = query(
      collection(db, 'classes'),
      where('parentId', '==', parentId),
      where('date', '>=', currentDate)
    );
    const snapshot = await getDocs(q);
    const promises = snapshot.docs.map(docSnap => deleteDoc(doc(db, 'classes', docSnap.id)));
    await Promise.all(promises);
  }

  async function updateBookedCount(id, booked, capacity) {
    await updateDoc(doc(db, 'classes', id), {
      booked,
      status:    booked >= capacity ? 'full' : 'available',
      updatedAt: serverTimestamp(),
    });
  }

  return {
    classes, loading, error,
    addClass, addRecurringClasses,
    updateClass, updateFutureClasses,
    removeClass, removeFutureClasses,
    updateBookedCount,
  };
}

// Full 30-min time slots from 5:00 AM to 11:30 PM
export function generateTimeSlots() {
  const slots = [];
  for (let h = 5; h <= 23; h++) {
    slots.push(`${String(h).padStart(2,'0')}:00`);
    if (h < 23) slots.push(`${String(h).padStart(2,'0')}:30`);
  }
  return slots;
}