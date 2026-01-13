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

// Helper function to get Firebase ID token (for testing)
// Usage in browser console: window.getFirebaseToken()
if (typeof window !== "undefined") {
  (window as any).getFirebaseToken = async () => {
    try {
      const user = auth.currentUser;
      if (!user) {
        console.error("❌ No user logged in. Please sign in first.");
        return null;
      }
      const token = await user.getIdToken();
      console.log("🔑 Firebase ID Token:");
      console.log(token);
      await navigator.clipboard.writeText(token);
      console.log("✅ Token copied to clipboard!");
      console.log("\nTo use in tests, add to .env.test:");
      console.log(`FIREBASE_TEST_TOKEN=${token}`);
      return token;
    } catch (error) {
      console.error("❌ Error getting token:", error);
      return null;
    }
  };
}
