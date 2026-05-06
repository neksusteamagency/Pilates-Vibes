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

// ─────────────────────────────────────────────────────────────
// Normalizes a phone number into multiple candidate formats so
// that minor formatting differences (spaces, leading zeros,
// country-code presence) don't prevent a merge match.
// e.g. "+961 70 123 456" → ["+96170123456", "0070123456", "70123456"]
// ─────────────────────────────────────────────────────────────
function phoneVariants(raw) {
  const digits = (raw || '').replace(/\D/g, ''); // strip everything non-digit
  const withPlus = (raw || '').replace(/\s+/g, '').replace(/[^\d+]/g, '');

  const variants = new Set();
  variants.add(withPlus);           // +96170123456
  variants.add(digits);             // 96170123456

  // Lebanese numbers: strip leading country code 961
  if (digits.startsWith('961') && digits.length >= 10) {
    const local = digits.slice(3);  // 70123456
    variants.add(local);
    variants.add('0' + local);      // 070123456
    variants.add('+961' + local);   // +96170123456 (already covered but harmless)
  }

  // Numbers stored with leading 00 instead of +
  if (digits.startsWith('00')) {
    variants.add('+' + digits.slice(2));
  }

  return [...variants].filter(Boolean);
}

// Query clients collection for any of the phone variants
async function findClientByPhone(phone) {
  const variants = phoneVariants(phone);
  for (const variant of variants) {
    const snap = await getDocs(
      query(collection(db, 'clients'), where('phone', '==', variant))
    );
    if (!snap.empty) return snap.docs[0]; // return the first matching doc
  }
  return null;
}

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [role, setRole]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          // Small delay so that register() Firestore writes finish before
          // onAuthStateChanged tries to read the docs.
          await new Promise(r => setTimeout(r, 500));

          const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (snap.exists()) {
            const data = snap.data();

            // If this uid has a pointer in clientUidIndex, use that real doc ID
            // for any downstream lookups (the merge path created it).
            let clientDocId = firebaseUser.uid;
            try {
              const idxSnap = await getDoc(doc(db, 'clientUidIndex', firebaseUser.uid));
              if (idxSnap.exists()) {
                clientDocId = idxSnap.data().clientDocId;
              }
            } catch (_) { /* index doesn't exist for new clients — that's fine */ }

            setUser({
              uid:          firebaseUser.uid,
              clientDocId,                          // ← real Firestore client doc ID
              email:        firebaseUser.email,
              name:         data.name  || '',
              avatar:       data.avatar || firebaseUser.email?.slice(0, 2).toUpperCase(),
              phone:        data.phone || '',
              role:         data.role  || 'client',
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

  // ── Login ────────────────────────────────────────────────────
  async function login(email, password) {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const snap = await getDoc(doc(db, 'users', cred.user.uid));
    if (!snap.exists()) throw new Error('Account not found in database. Contact admin.');
    const data = snap.data();
    return { uid: cred.user.uid, email: cred.user.email, ...data };
  }

  // ── Client self-register with phone-based merge ──────────────
  async function register(email, password, name, phone, dob) {
    // Normalize the way admin would have stored it (strip spaces, keep + prefix)
    const normalizedPhone = phone.replace(/\s+/g, '').replace(/[^\d+]/g, '');

    // ── Step 1: Find existing client doc by phone (tries multiple formats) ──
    const existingClientDoc = await findClientByPhone(phone);

    // ── Step 2: If found and already linked to an Auth uid → block duplicate ──
    if (existingClientDoc) {
      const existingData = existingClientDoc.data();
      if (existingData.uid && existingData.uid !== '') {
        throw new Error('PHONE_ALREADY_REGISTERED');
      }
    }

    // ── Step 3: Create the Firebase Auth account ──
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const uid  = cred.user.uid;
    const avatar = name.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

    // ── Step 4: Create /users/{uid} (role + profile, always needed) ──
    await setDoc(doc(db, 'users', uid), {
      name:      name.trim(),
      phone:     normalizedPhone,
      email,
      avatar,
      dob:       dob || '',
      role:      'client',
      createdAt: serverTimestamp(),
    });

    if (existingClientDoc) {
      // ── MERGE PATH ────────────────────────────────────────────
      // Stamp uid onto the existing client doc so all existing data
      // (package, sessions, bookings, history) keeps working with no migration.
      await updateDoc(doc(db, 'clients', existingClientDoc.id), {
        uid,
        email,
        avatar,
        name:      name.trim(),
        // Keep original phone format already stored by admin; only fill if blank
        phone:     existingClientDoc.data().phone || normalizedPhone,
        dob:       dob || existingClientDoc.data().dob || '',
        linkedAt:  serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // ── Index: uid → real client doc ID ──
      // Lets any code that looks up clients by uid find the right doc,
      // even though the doc ID is not the uid.
      if (existingClientDoc.id !== uid) {
        await setDoc(doc(db, 'clientUidIndex', uid), {
          clientDocId: existingClientDoc.id,
          createdAt:   serverTimestamp(),
        });
      }

      console.log(`[register] Merged uid ${uid} into existing client doc ${existingClientDoc.id}`);

    } else {
      // ── NEW CLIENT PATH ───────────────────────────────────────
      // No pre-existing profile; create a fresh client doc using uid as doc ID.
      await setDoc(doc(db, 'clients', uid), {
        uid,
        name:              name.trim(),
        phone:             normalizedPhone,
        email,
        avatar,
        dob:               dob || '',
        pkg:               '',
        sessionsTotal:     0,
        sessionsRemaining: 0,
        sessionsUsed:      0,
        purchaseDate:      null,
        expiry:            null,
        status:            'active',
        isFrozen:          false,
        frozenUntil:       null,
        freezeStartDate:   null,
        cancelledSessions: 0,
        notes:             '',
        history:           [],
        paymentVerified:   false,
        createdAt:         serverTimestamp(),
      });
    }

    return cred.user;
  }

  // ── Admin creates trainer account ────────────────────────────
  async function createTrainerAccount(email, password, name, phone, specialty) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const uid  = cred.user.uid;
    const avatar = name.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

    await setDoc(doc(db, 'users', uid), {
      name: name.trim(), phone, email, avatar,
      role: 'trainer', specialty, createdAt: serverTimestamp(),
    });

    await setDoc(doc(db, 'trainers', uid), {
      name:           name.trim(), phone, email, avatar, specialty,
      avgRating:      0, totalRatings:   0,
      classesThisMonth: 0, totalClasses: 0,
      ratingBreakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
      uid,
      createdAt: serverTimestamp(),
    });

    return cred.user;
  }

  // ── Logout ───────────────────────────────────────────────────
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