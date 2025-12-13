import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged 
} from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDG6YCgaxmh3cXaCNqS8qq862E7Avptpgo",
  authDomain: "genmediastudio.firebaseapp.com",
  projectId: "genmediastudio",
  storageBucket: "genmediastudio.firebasestorage.app",
  messagingSenderId: "856765593724",
  appId: "1:856765593724:web:2d56922818e4dd876ff1f9",
  measurementId: "G-M4801D5V62"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Allowed emails list
const ALLOWED_EMAILS = [
  "ldebortolialves@hubspot.com"
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
