import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { auth } from "../../firebase"; // adjust path if needed

export async function handleSignup(email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}

export async function handleLogin(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}
