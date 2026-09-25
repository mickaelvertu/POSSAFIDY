import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAjCYBrBPeXYfX-_mv5eb2pKhzj_lmQdkQ",
  authDomain: "vtcplus-mg.firebaseapp.com",
  projectId: "vtcplus-mg",
  storageBucket: "vtcplus-mg.firebasestorage.app",
  messagingSenderId: "64864717761",
  appId: "1:64864717761:web:595da271f718432a1a7d40"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, "ai-studio-stockgileada-5c2d38b9-1b03-48e4-87ac-411c65868528");
export const database = db;
export default app;

