"use server";

import { redirect } from "next/navigation";
import { signIn, signOut } from "@/lib/auth";

/**
 * Server actions for sign-in/out.
 * `redirectTo` honors the callbackUrl pattern observed on the target.
 */
export async function signInWithGoogle(formData: FormData) {
  const raw = String(formData.get("callbackUrl") ?? "/overview");
  // Only allow same-origin relative paths (open-redirect defense).
  const target = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/overview";
  await signIn("google", { redirectTo: target });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}
