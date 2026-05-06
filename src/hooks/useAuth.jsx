import { useState, useEffect, createContext, useContext } from 'react';
import { auth, db } from '../firebase/config';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  doc, getDoc, setDoc, updateDoc,
  serverTimestamp, collection, query, where, getDocs
} from 'firebase/firestore';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (snap.exists()) {
            const data = snap.data();
            setUser({
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              name: data.name || '',
              avatar: data.avatar || firebaseUser.email?.slice(0, 2).toUpperCase(),
              phone: data.phone || '',
              role: data.role || 'client',
            });
            setRole(data.role || 'client');
          } else {
            setUser({ uid: firebaseUser.uid, email: firebaseUser.email, role: 'client' });
            setRole('client');
          }
        } catch (err) {
          console.error('Error fetching user doc:', err);
          setUser(null);
          setRole(null);
        }
      } else {
        setUser(null);
        setRole(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // ── Login ──────────────────────────────────────────────────
  async function login(email, password) {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const snap = await getDoc(doc(db, 'users', cred.user.uid));
    if (!snap.exists()) throw new Error('Account not found in database. Contact admin.');
    const data = snap.data();
    return { uid: cred.user.uid, email: cred.user.email, ...data };
  }

  // ── Client self-register with phone-based merge ────────────
  async function register(email, password, name, phone, dob) {
    const normalizedPhone = phone.replace(/\s+/g, '').replace(/[^\d+]/g, '');

    // 1. Check for an existing client doc with this phone BEFORE creating the Auth account.
    //    We do this first so we can block duplicate registrations cleanly.
    const phoneQuery = await getDocs(
      query(collection(db, 'clients'), where('phone', '==', normalizedPhone))
    );

    // If a doc with this phone already has a uid linked, someone already registered — block it.
    if (!phoneQuery.empty) {
      const existingData = phoneQuery.docs[0].data();
      if (existingData.uid && existingData.uid !== '') {
        throw new Error('PHONE_ALREADY_REGISTERED');
      }
    }

    // 2. Create the Firebase Auth account.
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const uid = cred.user.uid;
    const avatar = name.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

    // 3. Create /users/{uid} doc (always, for role + profile lookup).
    await setDoc(doc(db, 'users', uid), {
      name: name.trim(), phone: normalizedPhone, email, avatar, dob: dob || '',
      role: 'client', createdAt: serverTimestamp(),
    });

    if (!phoneQuery.empty) {
      // ── MERGE: stamp uid onto the existing client doc. The doc ID stays the same.
      // Everything else (package, sessions, bookings, attendance) is already attached
      // to this doc ID and keeps working with zero migrations needed.
      const existingClientDoc = phoneQuery.docs[0];
      await updateDoc(doc(db, 'clients', existingClientDoc.id), {
        uid,
        email,
        avatar,
        name: name.trim(),
        dob: dob || existingClientDoc.data().dob || '',
        linkedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // ── CRITICAL: Also create a /clients/{uid} doc that just points to the real doc.
      // This prevents a second "new client" doc from being created if anything re-runs,
      // and lets uid-based lookups resolve correctly without duplicating data.
      if (existingClientDoc.id !== uid) {
        await setDoc(doc(db, 'clientUidIndex', uid), {
          clientDocId: existingClientDoc.id,
          createdAt: serverTimestamp(),
        });
      }
    } else {
      // ── NEW CLIENT: no existing profile found, create a fresh one.
      // Use uid as the doc ID so the simple c.id === uid lookup works for new clients.
      await setDoc(doc(db, 'clients', uid), {
        uid,
        name: name.trim(), phone: normalizedPhone, email, avatar,
        dob: dob || '',
        pkg: '',
        sessionsTotal: 0,
        sessionsRemaining: 0,
        sessionsUsed: 0,
        purchaseDate: null,
        expiry: null,
        status: 'active',
        isFrozen: false,
        frozenUntil: null,
        freezeStartDate: null,
        cancelledSessions: 0,
        notes: '',
        history: [],
        paymentVerified: false,
        createdAt: serverTimestamp(),
      });
    }

    return cred.user;
  }

  // ── Admin creates trainer account ──────────────────────────
  async function createTrainerAccount(email, password, name, phone, specialty) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const uid = cred.user.uid;
    const avatar = name.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

    await setDoc(doc(db, 'users', uid), {
      name: name.trim(), phone, email, avatar,
      role: 'trainer', specialty, createdAt: serverTimestamp(),
    });

    await setDoc(doc(db, 'trainers', uid), {
      name: name.trim(), phone, email, avatar, specialty,
      avgRating: 0, totalRatings: 0,
      classesThisMonth: 0, totalClasses: 0,
      ratingBreakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
      uid,
      createdAt: serverTimestamp(),
    });

    return cred.user;
  }

  // ── Logout ─────────────────────────────────────────────────
  async function logout() {
    await signOut(auth);
    setUser(null);
    setRole(null);
  }

  return (
    <AuthContext.Provider value={{ user, role, loading, login, logout, register, createTrainerAccount }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}