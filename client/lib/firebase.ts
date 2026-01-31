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

// Validate Firebase config - show helpful error if missing
if (!firebaseConfig.apiKey) {
  const errorMsg =
    "Firebase API key is missing. Please ensure VITE_FIREBASE_API_KEY is set during build.";
  console.error(errorMsg);
  console.error("Current Firebase config:", {
    ...firebaseConfig,
    apiKey: firebaseConfig.apiKey ? "[SET]" : "[MISSING]",
  });
  // In production, show a user-friendly message instead of crashing
  if (typeof document !== "undefined") {
    document.body.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; height: 100vh; font-family: system-ui; background: #1a1a2e; color: white;">
        <div style="text-align: center; padding: 20px;">
          <h1>Configuration Error</h1>
          <p>Firebase is not configured. Please check deployment settings.</p>
          <p style="color: #888; font-size: 14px;">VITE_FIREBASE_API_KEY is missing</p>
        </div>
      </div>
    `;
  }
  throw new Error(errorMsg);
}

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Allowed emails list - loaded from environment variable (comma-separated)
const ALLOWED_EMAILS: string[] = (import.meta.env.VITE_ALLOWED_EMAILS || "")
  .split(",")
  .map((email: string) => email.trim().toLowerCase())
  .filter((email: string) => email.length > 0);

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
