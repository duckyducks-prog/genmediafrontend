import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Allowed emails list
const ALLOWED_EMAILS = [
  "ldebortolialves@hubspot.com",
  "sfiske@hubspot.com",
  "meganzinka@gmail.com",
];

export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const email = result.user.email?.toLowerCase();

    // Check if email is allowed
    if (!email || !ALLOWED_EMAILS.includes(email)) {
      await signOut(auth);
      throw new Error("Access denied. Your email is not authorized.");
    }

    return result;
  } catch (error) {
    throw error;
  }
};

export const logOut = () => signOut(auth);
export { onAuthStateChanged };

// Expose auth globally for debugging (get token in console)
// Usage: window.getFirebaseToken()
if (typeof window !== "undefined") {
  (window as any).getFirebaseToken = async () => {
    const token = await auth.currentUser?.getIdToken();
    console.log("Token:", token);
    return token;
  };
}
