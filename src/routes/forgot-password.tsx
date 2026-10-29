import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePopup } from "@/components/popup";
import { AuthShell } from "@/components/auth-shell";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset your password | FP Marketing Accelerator" },
      { name: "description", content: "Get a secure link to reset your FP Marketing Accelerator password." },
      { property: "og:title", content: "Reset your password | FP Marketing Accelerator" },
      { property: "og:description", content: "Get a secure link to reset your FP Marketing Accelerator password." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Forgot,
});

function Forgot() {
  const popup = usePopup();
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) { popup({ type: "error", title: "Enter a valid email address", description: "We'll send the reset link there." }); return; }
    setBusy(true);
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
    setBusy(false);
    // Same message either way so the page never reveals which emails have accounts.
    popup({ type: "success", title: "Check your inbox", description: "If an account exists for this email, a reset link is on its way. It expires in one hour.", primaryLabel: "Got it", secondaryLabel: null });
  };
  return (
    <AuthShell title="Forgot your password?" subtitle="Enter your email and we'll send you a link to set a new one.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <label className="block space-y-1.5">
          <span className="block text-[13px] font-medium">Email Address<span className="text-primary">*</span></span>
          <input name="email" type="email" autoComplete="email" placeholder="Enter your email" className="signup-input" />
        </label>
        <button type="submit" disabled={busy} className="signup-primary text-sm">{busy ? "Sending…" : "Send reset link"}</button>
        <p className="text-center text-sm text-muted-foreground"><Link to="/" className="font-semibold text-foreground hover:text-primary">Back to login</Link></p>
      </form>
    </AuthShell>
  );
}
