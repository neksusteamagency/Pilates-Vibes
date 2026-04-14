import { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import {
  collection, onSnapshot, doc,
  addDoc, updateDoc, deleteDoc,
  serverTimestamp, query, orderBy, where, getDocs,
} from 'firebase/firestore';

export function useClients() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    const q = query(collection(db, 'clients'), orderBy('name'));
    const unsub = onSnapshot(q, (snap) => {
      setClients(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => {
      console.error('useClients:', err);
      setError(err.message);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  async function addClient(data) {
    const normalizedPhone = (data.phone || '')
      .replace(/\s+/g, '')
      .replace(/[^\d+]/g, '');

    return await addDoc(collection(db, 'clients'), {
      ...data,
      phone:             normalizedPhone,
      sessionsUsed:      0,
      cancelledSessions: 0,
      isFrozen:          false,
      frozenUntil:       null,
      freezeStartDate:   null,
      paymentVerified:   false,
      status:            'active',
      createdAt:         serverTimestamp(),
    });
  }

  async function updateClient(id, data) {
    await updateDoc(doc(db, 'clients', id), {
      ...data, updatedAt: serverTimestamp(),
    });
  }

  async function removeClient(id) {
    await deleteDoc(doc(db, 'clients', id));
  }

  async function freezeClient(id, freezeStartDate, frozenUntil) {
    await updateDoc(doc(db, 'clients', id), {
      isFrozen:        true,
      freezeStartDate,
      frozenUntil,
      updatedAt:       serverTimestamp(),
    });
  }

  async function unfreezeClient(id) {
    await updateDoc(doc(db, 'clients', id), {
      isFrozen:        false,
      frozenUntil:     null,
      freezeStartDate: null,
      updatedAt:       serverTimestamp(),
    });
  }

  async function renewPackage(id, pkg) {
    await updateDoc(doc(db, 'clients', id), {
      pkg:               pkg.name,
      sessionsTotal:     pkg.sessionsTotal,
      sessionsRemaining: pkg.sessionsTotal,
      sessionsUsed:      0,
      cancelledSessions: 0,
      purchaseDate:      pkg.purchaseDate,
      expiry:            pkg.expiry,
      paymentMethod:     pkg.paymentMethod,
      paymentVerified:   pkg.paymentMethod === 'Cash' || pkg.paymentMethod === 'Whish' ? false : true,
      paidAmount:        pkg.paidAmount ?? null,
      discount:          pkg.discount   ?? 0,
      status:            'active',
      updatedAt:         serverTimestamp(),
    });
  }

  async function verifyPayment(id) {
    await updateDoc(doc(db, 'clients', id), {
      paymentVerified:   true,
      paymentVerifiedAt: serverTimestamp(),
      updatedAt:         serverTimestamp(),
    });
  }

  // BUG FIX: When client self-registers with same phone as admin-created record,
  // merge them: update admin record with new auth uid and any new profile info (name, email).
  async function mergeClientByPhone(phone, authUid, profileData) {
    const normalizedPhone = (phone || '').replace(/\s+/g, '').replace(/[^\d+]/g, '');
    const q = query(
      collection(db, 'clients'),
      where('phone', '==', normalizedPhone)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;

    // Find the existing client doc (not the one with the same auth uid)
    const existingDoc = snap.docs.find(d => d.id !== authUid);
    if (!existingDoc) return null;

    const existingData = existingDoc.data();
    // Update the existing doc with new auth info AND updated profile fields
    await updateDoc(doc(db, 'clients', existingDoc.id), {
      uid:       authUid,
      name:      profileData.name || existingData.name,
      email:     profileData.email || existingData.email || '',
      avatar:    (profileData.name || existingData.name).trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2),
      linkedAt:  serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return existingDoc.id; // return the canonical doc id
  }

  async function deductSession(id, currentRemaining) {
    const client       = clients.find(c => c.id === id);
    const newRemaining = Math.max(0, currentRemaining - 1);
    await updateDoc(doc(db, 'clients', id), {
      sessionsRemaining: newRemaining,
      sessionsUsed:      (client?.sessionsUsed      || 0) + 1,
      cancelledSessions: (client?.cancelledSessions || 0) + 1,
      status: newRemaining === 0 ? 'expired' : newRemaining <= 2 ? 'low' : 'active',
      updatedAt: serverTimestamp(),
    });
  }

  // Feature: admin can manually set expiry date for a client's package
  async function updatePackageExpiry(id, newExpiry) {
    await updateDoc(doc(db, 'clients', id), {
      expiry:    newExpiry,
      updatedAt: serverTimestamp(),
    });
  }

  return {
    clients, loading, error,
    addClient, updateClient, removeClient,
    deductSession, freezeClient, unfreezeClient,
    renewPackage, verifyPayment, mergeClientByPhone,
    updatePackageExpiry,
  };
}