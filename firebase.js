// ----------------- firebase.js -----------------
// Must be included using: <script type="module" src="./firebase.js"></script>

// Firebase SDK v12 modular imports
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

import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";
// ----------------- Firebase Config -----------------
// Replace this object with the config object from your Firebase Console → Project settings
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
const storage = getStorage(app);

// ----------------- Helper: upload profile image -----------------
async function uploadProfileImage(uid, file) {
  if (!file) return null;
  const path = `profiles/${uid}/${Date.now()}_${file.name}`;
  const ref = storageRef(storage, path);
  const snapshot = await uploadBytes(ref, file);
  return await getDownloadURL(snapshot.ref);
}

// ----------------- REGISTER (donor OR driver) -----------------
// Usage: registerUser({ email, password, profileData:{fullName, ...}, role:"donor"|"driver", profileFile:File })
export async function registerUser({
  email,
  password,
  profileData = {},
  role = "donor",
  profileFile = null,
}) {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const uid = cred.user.uid;

    // upload image if provided
    const photoURL = profileFile ? await uploadProfileImage(uid, profileFile) : null;

    // update auth profile (displayName + photo)
    if (profileData.fullName || photoURL) {
      await fbUpdateProfile(cred.user, {
        displayName: profileData.fullName || null,
        photoURL: photoURL || null,
      });
    }

    // common fields
    const baseDoc = {
      uid,
      email,
      role,
      createdAt: serverTimestamp(),
      ...profileData,
      photoURL: photoURL || null,
    };

    // write to appropriate collection
    if (role === "driver") {
      await setDoc(doc(db, "drivers", uid), baseDoc);
      window.location.href = "driver_registration_done.html";
    } else {
      await setDoc(doc(db, "users", uid), baseDoc);
      window.location.href = "donor_registration_done.html";
    }

    // send verification email (best-effort)
    try { await sendEmailVerification(cred.user); } catch (e) { console.warn("Verif email:", e); }

    return { uid, user: cred.user };
  } catch (error) {
    console.error("Registration error:", error);
    throw error;
  }
}

// ----------------- LOGIN (role-aware redirect) -----------------
// loginUser(email, password) -> redirects to donor_dashboard.html or driver_dashboard.html
export async function loginUser(email, password) {
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const uid = cred.user.uid;

    const userDoc = await getDoc(doc(db, "users", uid));
    if (userDoc.exists()) {
      window.location.href = "donor_dashboard.html";
      return { user: cred.user, profile: userDoc.data() };
    }
    const driverDoc = await getDoc(doc(db, "drivers", uid));
    if (driverDoc.exists()) {
      window.location.href = "driver_dashboard.html";
      return { user: cred.user, profile: driverDoc.data() };
    }

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
  const u = await getDoc(doc(db, "users", uid));
  if (u.exists()) return u.data();
  const d = await getDoc(doc(db, "drivers", uid));
  if (d.exists()) return d.data();
  return null;
}

// ----------------- UPDATE PROFILE -----------------
export async function updateUserProfile(uid, updates = {}, profileFile = null) {
  if (!uid) throw new Error("uid required");
  if (profileFile) {
    const photoURL = await uploadProfileImage(uid, profileFile);
    updates.photoURL = photoURL;
    const currentUser = auth.currentUser;
    if (currentUser && currentUser.uid === uid) {
      await fbUpdateProfile(currentUser, { photoURL });
    }
  }

  const userRef = doc(db, "users", uid);
  const driverRef = doc(db, "drivers", uid);
  const userSnap = await getDoc(userRef);
  if (userSnap.exists()) {
    await updateDoc(userRef, updates);
    return true;
  } else {
    const driverSnap = await getDoc(driverRef);
    if (driverSnap.exists()) {
      await updateDoc(driverRef, updates);
      return true;
    }
  }
  throw new Error("No profile found to update");
}

// ----------------- FIND DONORS BY BLOOD GROUP -----------------
export async function findDonorsByBloodGroup(bloodGroup) {
  const q = query(collection(db, "users"), where("bloodGroup", "==", bloodGroup), where("role", "==", "donor"));
  const snaps = await getDocs(q);
  const results = [];
  snaps.forEach(s => results.push(s.data()));
  return results;
}

// ----------------- EXPORTS -----------------
export { auth, db, storage };
