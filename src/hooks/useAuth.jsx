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
  serverTimestamp, collection, query, where, getDocs, writeBatch, deleteDoc
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

    // Check if a client doc already exists with this phone number
    const phoneQuery = await getDocs(
      query(collection(db, 'clients'), where('phone', '==', normalizedPhone))
    );

    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const uid = cred.user.uid;
    const avatar = name.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

    // Create /users/{uid} doc
    await setDoc(doc(db, 'users', uid), {
      name: name.trim(), phone: normalizedPhone, email, avatar, dob: dob || '',
      role: 'client', createdAt: serverTimestamp(),
    });

    if (!phoneQuery.empty) {
      // ── MERGE: link existing client profile to this Auth account ──
      const existingClientDoc = phoneQuery.docs[0];
      // BUG FIX: also update name and dob so the admin page reflects the
      // client's real registered name instead of the admin's placeholder.
      await updateDoc(doc(db, 'clients', existingClientDoc.id), {
        uid,
        name: name.trim(),
        email,
        avatar,
        dob: dob || existingClientDoc.data().dob || '',
        linkedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      
      // If existing client doc id differs from uid, create a new one with uid pointing to same data
      if (existingClientDoc.id !== uid) {
        const existingData = existingClientDoc.data();

        // 1. Create the new doc under the uid (copy all existing data)
        await setDoc(doc(db, 'clients', uid), {
          ...existingData,
          uid,
          name: name.trim(),
          email,
          avatar,
          dob: dob || existingData.dob || '',
          linkedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        // 2. Migrate all bookings from old ID → new uid
        const oldBookings = await getDocs(
          query(collection(db, 'bookings'), where('clientId', '==', existingClientDoc.id))
        );
        if (!oldBookings.empty) {
          const batch = writeBatch(db);
          oldBookings.docs.forEach(d => {
            batch.update(doc(db, 'bookings', d.id), { clientId: uid });
          });
          await batch.commit();
        }

        // 3. Migrate all attendance records too
        const oldAttendance = await getDocs(
          query(collection(db, 'attendance'), where('clientId', '==', existingClientDoc.id))
        );
        if (!oldAttendance.empty) {
          const batch = writeBatch(db);
          oldAttendance.docs.forEach(d => {
            batch.update(doc(db, 'attendance', d.id), { clientId: uid });
          });
          await batch.commit();
        }

        // 4. Delete the old doc so there's no duplicate
        await deleteDoc(doc(db, 'clients', existingClientDoc.id));
      }
    } else {
      // ── NEW CLIENT: create fresh client profile ──
      await setDoc(doc(db, 'clients', uid), {
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