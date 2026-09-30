import { redirect } from "next/navigation";

/** `/overview` is an app route (mirrors the target's post-login landing). */
export default function OverviewAliasPage() {
  redirect("/dashboard");
}
