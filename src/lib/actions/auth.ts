"use server";
import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";

export async function login(_prev: string | undefined, fd: FormData) {
  try {
    await signIn("credentials", { email: fd.get("email"), password: fd.get("password"), redirectTo: "/dashboard" });
  } catch (e) {
    if (e instanceof AuthError) return "E-mail ou mot de passe incorrect.";
    throw e;
  }
}

export async function logout() {
  await signOut({ redirectTo: "/login" });
}