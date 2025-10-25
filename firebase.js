// ----------------- firebase.js -----------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile as fbUpdateProfile,
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

// ----------------- Firebase Config -----------------
const firebaseConfig = {
  apiKey: "AIzaSyDn-fGmBlJfDwDbCtMs0OX9J53NeTSXQxA",
  authDomain: "bloodandambulance.firebaseapp.com",
  projectId: "bloodandambulance",
  storageBucket: "bloodandambulance.firebasestorage.app",
  messagingSenderId: "700070000677",
  appId: "1:700070000677:web:e22a0f9078018f6dc027cc",
  measurementId: "G-H8FQ5LYQDH"
};

// ----------------- Initialize Firebase -----------------
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ----------------- REGISTER (donor OR driver) -----------------
export async function registerUser({
  email,
  password,
  profileData = {},
  role = "donor"
}) {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const uid = cred.user.uid;

    // Update auth profile with display name
    if (profileData.fullName) {
      await fbUpdateProfile(cred.user, {
        displayName: profileData.fullName
      });
    }

    // Common fields for both donor and driver
    const baseDoc = {
      uid,
      email,
      role,
      createdAt: serverTimestamp(),
      ...profileData,
      available: true // Default availability
    };

    // Write to appropriate collection
    if (role === "driver") {
      await setDoc(doc(db, "drivers", uid), baseDoc);
      window.location.href = "driver_registration_done.html";
    } else {
      await setDoc(doc(db, "users", uid), baseDoc);
      window.location.href = "donor_registration_done.html";
    }

    // Send verification email (optional)
    try { 
      await sendEmailVerification(cred.user); 
    } catch (e) { 
      console.warn("Verification email:", e); 
    }

    return { uid, user: cred.user };
  } catch (error) {
    console.error("Registration error:", error);
    throw error;
  }
}

// ----------------- LOGIN (role-aware redirect) -----------------
export async function loginUser(email, password) {
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const uid = cred.user.uid;

    // Check if user exists in users collection (donor)
    const userDoc = await getDoc(doc(db, "users", uid));
    if (userDoc.exists()) {
      window.location.href = "donor_dashboard.html";
      return { user: cred.user, profile: userDoc.data() };
    }
    
    // Check if user exists in drivers collection
    const driverDoc = await getDoc(doc(db, "drivers", uid));
    if (driverDoc.exists()) {
      window.location.href = "driver_dashboard.html";
      return { user: cred.user, profile: driverDoc.data() };
    }

    // If no profile found, redirect to home
    window.location.href = "home_page.html";
    return { user: cred.user, profile: null };
  } catch (error) {
    console.error("Login error:", error);
    throw error;
  }
}

// ----------------- LOGOUT -----------------
export async function logoutUser() {
  await signOut(auth);
  window.location.href = "home_page.html";
}

// ----------------- PASSWORD RESET -----------------
export async function resetPassword(email) {
  try {
    await sendPasswordResetEmail(auth, email);
    return true;
  } catch (error) {
    console.error("Reset error:", error);
    throw error;
  }
}

// ----------------- AUTH STATE CHANGE -----------------
export function onAuthChanged(callback) {
  return onAuthStateChanged(auth, callback);
}

// ----------------- FETCH PROFILE (users OR drivers) -----------------
export async function getUserProfile(uid) {
  if (!uid) return null;
  
  // Check users collection first
  const userDoc = await getDoc(doc(db, "users", uid));
  if (userDoc.exists()) return { ...userDoc.data(), role: 'donor' };
  
  // Check drivers collection
  const driverDoc = await getDoc(doc(db, "drivers", uid));
  if (driverDoc.exists()) return { ...driverDoc.data(), role: 'driver' };
  
  return null;
}

// ----------------- UPDATE PROFILE -----------------
export async function updateUserProfile(uid, updates = {}) {
  if (!uid) throw new Error("uid required");

  const userRef = doc(db, "users", uid);
  const driverRef = doc(db, "drivers", uid);
  
  // Check which collection contains the user
  const userSnap = await getDoc(userRef);
  if (userSnap.exists()) {
    await updateDoc(userRef, updates);
    
    // Update auth profile if displayName changed
    if (updates.fullName && auth.currentUser) {
      await fbUpdateProfile(auth.currentUser, {
        displayName: updates.fullName
      });
    }
    
    return { success: true, role: 'donor' };
  } else {
    const driverSnap = await getDoc(driverRef);
    if (driverSnap.exists()) {
      await updateDoc(driverRef, updates);
      
      // Update auth profile if displayName changed
      if (updates.fullName && auth.currentUser) {
        await fbUpdateProfile(auth.currentUser, {
          displayName: updates.fullName
        });
      }
      
      return { success: true, role: 'driver' };
    }
  }
  throw new Error("No profile found to update");
}

// ----------------- GET USER ROLE -----------------
export async function getUserRole(uid) {
  if (!uid) return null;
  
  const userDoc = await getDoc(doc(db, "users", uid));
  if (userDoc.exists()) return 'donor';
  
  const driverDoc = await getDoc(doc(db, "drivers", uid));
  if (driverDoc.exists()) return 'driver';
  
  return null;
}

// ----------------- FIND DONORS BY BLOOD GROUP -----------------
export async function findDonorsByBloodGroup(bloodGroup) {
  try {
    const q = query(
      collection(db, "users"), 
      where("bloodGroup", "==", bloodGroup),
      where("role", "==", "donor")
    );
    const snaps = await getDocs(q);
    const results = [];
    snaps.forEach(s => results.push({ id: s.id, ...s.data() }));
    return results;
  } catch (error) {
    console.error("Error finding donors:", error);
    throw error;
  }
}

// ----------------- FIND ALL DONORS -----------------
export async function findAllDonors() {
  try {
    const q = query(
      collection(db, "users"), 
      where("role", "==", "donor")
    );
    const snaps = await getDocs(q);
    const results = [];
    snaps.forEach(s => results.push({ id: s.id, ...s.data() }));
    return results;
  } catch (error) {
    console.error("Error finding all donors:", error);
    throw error;
  }
}

// ----------------- FIND DRIVERS BY AREA -----------------
export async function findDriversByArea(area) {
  try {
    let q;
    if (area) {
      q = query(
        collection(db, "drivers"), 
        where("area", "==", area),
        where("available", "==", true)
      );
    } else {
      q = query(
        collection(db, "drivers"), 
        where("available", "==", true)
      );
    }
    
    const snaps = await getDocs(q);
    const results = [];
    snaps.forEach(s => results.push({ id: s.id, ...s.data() }));
    return results;
  } catch (error) {
    console.error("Error finding drivers:", error);
    throw error;
  }
}

// ----------------- UPDATE AVAILABILITY -----------------
export async function updateAvailability(uid, available, role = "donor") {
  const collectionName = role === "driver" ? "drivers" : "users";
  const userRef = doc(db, collectionName, uid);
  await updateDoc(userRef, { available });
}

// ----------------- EXPORTS -----------------
export { auth, db, collection, query, where, getDocs };