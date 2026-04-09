import { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import {
  collection, onSnapshot, doc,
  addDoc, updateDoc, deleteDoc,
  serverTimestamp, query, orderBy,
} from 'firebase/firestore';

export function useTrainers() {
  const [trainers, setTrainers] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  useEffect(() => {
    const q = query(collection(db, 'trainers'), orderBy('name'));
    const unsub = onSnapshot(q, (snap) => {
      setTrainers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => {
      console.error('useTrainers:', err);
      setError(err.message);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  async function addTrainer(data) {
    return await addDoc(collection(db, 'trainers'), {
      ...data,
      classesThisMonth: 0,
      totalClasses:     0,
      createdAt:        serverTimestamp(),
    });
  }

  async function updateTrainer(id, data) {
    await updateDoc(doc(db, 'trainers', id), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  }

  async function removeTrainer(id) {
    await deleteDoc(doc(db, 'trainers', id));
  }

  return {
    trainers, loading, error,
    addTrainer, updateTrainer, removeTrainer,
  };
}