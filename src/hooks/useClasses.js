import { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import {
  collection, onSnapshot, doc,
  addDoc, updateDoc, deleteDoc,
  serverTimestamp, query, orderBy, where, getDocs,
} from 'firebase/firestore';
import { format } from 'date-fns';

export function useClasses() {
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    // We query both one-off classes (ordered by date) and recurring rules.
    // Recurring rules have isRecurring=true and no 'date' field — they are
    // ordered by startDate instead.
    const q = query(collection(db, 'classes'), orderBy('startDate'), orderBy('time'));
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

  // Add a one-off class for a specific date.
  async function addClass(data) {
    return await addDoc(collection(db, 'classes'), {
      ...data,
      isRecurring: false,
      // Keep 'date' for one-off classes so existing getClass() logic still works.
      date:        data.date,
      startDate:   data.date, // used for ordering
      booked:      0,
      status:      'available',
      createdAt:   serverTimestamp(),
    });
  }

  // Add a PERMANENT recurring rule. A single Firestore document represents
  // "this class happens every week on `day` at `time` starting from `startDate`".
  // The UI generates virtual occurrences from this rule — no per-week documents.
  // Cancelled individual occurrences are tracked in the `exceptions` array (list
  // of 'yyyy-MM-dd' strings) so admins can cancel a single week without deleting
  // the whole series.
  async function addRecurringClass(baseData, startDate) {
    const startDateStr = format(startDate, 'yyyy-MM-dd');
    return await addDoc(collection(db, 'classes'), {
      ...baseData,
      isRecurring: true,
      startDate:   startDateStr,   // first occurrence
      endDate:     null,           // null = runs forever
      exceptions:  [],             // dates (yyyy-MM-dd) that are individually cancelled
      booked:      0,
      status:      'available',
      createdAt:   serverTimestamp(),
    });
  }

  async function updateClass(id, data) {
    await updateDoc(doc(db, 'classes', id), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  }

  // Edit future occurrences of a recurring rule (just updates the rule doc itself).
  async function updateFutureClasses(id, data) {
    await updateDoc(doc(db, 'classes', id), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  }

  // Delete a single one-off class.
  async function removeClass(id) {
    await deleteDoc(doc(db, 'classes', id));
  }

  // Cancel a single occurrence of a recurring class by adding the date to exceptions.
  // This leaves the recurring rule intact; that week just won't render.
  async function cancelOccurrence(id, dateStr, currentExceptions = []) {
    await updateDoc(doc(db, 'classes', id), {
      exceptions: [...currentExceptions, dateStr],
      updatedAt:  serverTimestamp(),
    });
  }

  // Stop a recurring class from a given date onwards by setting endDate.
  async function endRecurringFrom(id, dateStr) {
    await updateDoc(doc(db, 'classes', id), {
      endDate:   dateStr,
      updatedAt: serverTimestamp(),
    });
  }

  // Delete the entire recurring rule (all past + future occurrences gone).
  async function deleteRecurringRule(id) {
    await deleteDoc(doc(db, 'classes', id));
  }

  // Delete all classes (one-off + recurring rules) for a specific trainer.
  async function deleteByTrainer(trainerName) {
    const q = query(collection(db, 'classes'), where('trainer', '==', trainerName));
    const snap = await getDocs(q);
    await Promise.all(snap.docs.map(d => deleteDoc(doc(db, 'classes', d.id))));
  }

  // Delete all classes (one-off + recurring rules) at a specific day+time combo.
  async function deleteByDayAndTime(day, time) {
    const q = query(
      collection(db, 'classes'),
      where('day', '==', day),
      where('time', '==', time),
    );
    const snap = await getDocs(q);
    await Promise.all(snap.docs.map(d => deleteDoc(doc(db, 'classes', d.id))));
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
    addClass,
    addRecurringClass,
    updateClass, updateFutureClasses,
    removeClass,
    cancelOccurrence,
    endRecurringFrom,
    deleteRecurringRule,
    deleteByTrainer,
    deleteByDayAndTime,
    updateBookedCount,
  };
}

// Full 30-min time slots from 5:00 AM to 11:30 PM
export function generateTimeSlots() {
  const slots = [];
  for (let h = 9; h <= 22; h++) {
    slots.push(`${String(h).padStart(2,'0')}:00`);
    if (h < 22) slots.push(`${String(h).padStart(2,'0')}:30`);
  }
  return slots;
}

// Given the full classes array and a specific week's start date, expand recurring
// rules into virtual occurrence objects so the schedule grid can render them.
// Returns a flat array of "resolved" class objects (one-offs + expanded recurrings).
export function resolveClassesForWeek(classes, weekStart) {
  const resolved = [];

  for (const cls of classes) {
    if (cls.status === 'cancelled') continue;

    if (!cls.isRecurring) {
      // One-off: just include it as-is.
      resolved.push(cls);
    } else {
      // Recurring rule: check if this week's matching date falls within the rule's range.
      const occurrenceDate = format(
        new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + cls.day),
        'yyyy-MM-dd'
      );

      const afterStart  = occurrenceDate >= cls.startDate;
      const beforeEnd   = !cls.endDate || occurrenceDate <= cls.endDate;
      const notExcepted = !(cls.exceptions || []).includes(occurrenceDate);

      if (afterStart && beforeEnd && notExcepted) {
        // Virtual occurrence — carries the rule's id so edits/deletes know which doc to touch.
        resolved.push({
          ...cls,
          date:          occurrenceDate,
          _recurringId:  cls.id,       // the Firestore doc id of the rule
          _occurrenceDate: occurrenceDate,
        });
      }
    }
  }

  return resolved;
}