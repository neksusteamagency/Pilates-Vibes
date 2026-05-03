import { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import {
  collection, onSnapshot, doc,
  addDoc, updateDoc, deleteDoc,
  serverTimestamp, query, orderBy, where, getDocs,
} from 'firebase/firestore';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from 'date-fns';

export function useClasses() {
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    // BUG FIX: Was orderBy('startDate'), orderBy('time') which requires a composite
    // Firestore index AND excludes docs missing 'startDate' (older one-off classes).
    // Simple createdAt ordering works for all docs and needs no composite index.
    const q = query(collection(db, 'classes'), orderBy('createdAt', 'desc'));
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
      date:        data.date,
      startDate:   data.date,
      booked:      0,
      status:      'available',
      createdAt:   serverTimestamp(),
    });
  }

  // Add a PERMANENT recurring rule.
  async function addRecurringClass(baseData, startDate) {
    const startDateStr = format(startDate, 'yyyy-MM-dd');
    return await addDoc(collection(db, 'classes'), {
      ...baseData,
      isRecurring: true,
      startDate:   startDateStr,
      endDate:     null,
      exceptions:  [],
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

  async function updateFutureClasses(id, data) {
    await updateDoc(doc(db, 'classes', id), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  }

  async function removeClass(id) {
    await deleteDoc(doc(db, 'classes', id));
  }

  async function cancelOccurrence(id, dateStr, currentExceptions = []) {
    await updateDoc(doc(db, 'classes', id), {
      exceptions: [...currentExceptions, dateStr],
      updatedAt:  serverTimestamp(),
    });
  }

  async function endRecurringFrom(id, dateStr) {
    await updateDoc(doc(db, 'classes', id), {
      endDate:   dateStr,
      updatedAt: serverTimestamp(),
    });
  }

  async function deleteRecurringRule(id) {
    await deleteDoc(doc(db, 'classes', id));
  }

  async function deleteByTrainer(trainerName) {
    const q = query(collection(db, 'classes'), where('trainer', '==', trainerName));
    const snap = await getDocs(q);
    await Promise.all(snap.docs.map(d => deleteDoc(doc(db, 'classes', d.id))));
  }

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

// Full 30-min time slots from 9:00 AM to 10:00 PM
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
export function resolveClassesForWeek(classes, weekStart) {
  const resolved = [];

  for (const cls of classes) {
    if (cls.status === 'cancelled') continue;

    if (!cls.isRecurring) {
      resolved.push(cls);
    } else {
      const occurrenceDate = format(
        new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + cls.day),
        'yyyy-MM-dd'
      );

      const afterStart  = occurrenceDate >= cls.startDate;
      const beforeEnd   = !cls.endDate || occurrenceDate <= cls.endDate;
      const notExcepted = !(cls.exceptions || []).includes(occurrenceDate);

      if (afterStart && beforeEnd && notExcepted) {
        resolved.push({
          ...cls,
          date:            occurrenceDate,
          _recurringId:    cls.id,
          _occurrenceDate: occurrenceDate,
        });
      }
    }
  }

  // Deduplicate: prevent same trainer + day + time slot appearing twice
  // (e.g. both a one-off doc and a recurring rule doc for the same slot)
  const seen = new Set();
  return resolved.filter(c => {
    const key = `${c.trainer}__${c.day}__${c.time}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Resolve all occurrences of recurring classes within a given month.
// Returns a flat array of virtual occurrence objects for that month.
export function resolveClassesForMonth(classes, monthDate) {
  const monthStart = startOfMonth(monthDate);
  const monthEnd   = endOfMonth(monthDate);
  const days       = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const resolved   = [];

  for (const cls of classes) {
    if (cls.status === 'cancelled') continue;

    if (!cls.isRecurring) {
      // One-off: include if its date falls within this month
      if (cls.date && cls.date >= format(monthStart, 'yyyy-MM-dd') && cls.date <= format(monthEnd, 'yyyy-MM-dd')) {
        resolved.push(cls);
      }
    } else {
      // Recurring rule: find every day in this month that matches the rule's weekday
      // cls.day: 0=Mon, 1=Tue, ... 6=Sun
      // date-fns getDay: 0=Sun, 1=Mon, ... 6=Sat
      const targetJsDay = cls.day === 6 ? 0 : cls.day + 1; // convert our Mon=0 to JS Sun=0
      for (const day of days) {
        if (getDay(day) !== targetJsDay) continue;
        const dateStr     = format(day, 'yyyy-MM-dd');
        const afterStart  = dateStr >= cls.startDate;
        const beforeEnd   = !cls.endDate || dateStr <= cls.endDate;
        const notExcepted = !(cls.exceptions || []).includes(dateStr);
        if (afterStart && beforeEnd && notExcepted) {
          resolved.push({
            ...cls,
            date:            dateStr,
            _recurringId:    cls.id,
            _occurrenceDate: dateStr,
          });
        }
      }
    }
  }

  // Deduplicate: if both a one-off doc and a recurring occurrence land on the
  // same trainer + day + time + date, keep only the first one found.
  // This prevents double-entries when a slot was saved both ways in Firestore.
  const seen = new Set();
  const deduped = resolved.filter(c => {
    const key = `${c.trainer}__${c.day}__${c.time}__${c.date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort by date then time
  deduped.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (a.time || '').localeCompare(b.time || '');
  });

  return deduped;
}