import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Copy, ShieldAlert } from "lucide-react";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { KYC_EMAIL } from "@/lib/admin";

export const Route = createFileRoute("/kyc")({
  head: () => ({ meta: [{ title: "Verify your identity | FP Marketing Accelerator" }, { name: "robots", content: "noindex" }] }),
  component: Kyc,
});

/** Where restricted (Fraud - KYC) accounts land. Static on purpose: the account can't read any data until it is reinstated. */
function Kyc() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { void supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? null)); }, []);
  const subject = encodeURIComponent(`Identity verification${email ? ` for ${email}` : ""}`);
  const body = encodeURIComponent(`Hello,\n\nPlease find attached my proof of identity and proof of residence to reinstate my account${email ? ` (${email})` : ""}.\n\nThank you.`);
  const copy = () => { void navigator.clipboard?.writeText(KYC_EMAIL).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1800); }).catch(() => {}); };
  return <AuthShell title="Verify your identity" subtitle="Your account has been restricted.">
    <div className="space-y-5 text-sm leading-relaxed">
      <div className="flex gap-3 rounded-xl border p-4"><ShieldAlert className="mt-0.5 size-5 shrink-0" /><p>Our security checks flagged your account, so access to your dashboard, plans and orders is paused. To reinstate your account, please complete an additional identity verification.</p></div>
      <div>
        <h2 className="font-semibold">Email us these documents</h2>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-muted-foreground">
          <li><span className="font-medium text-foreground">Proof of identity:</span> a clear photo or scan of a valid passport, national ID card or driver's licence.</li>
          <li><span className="font-medium text-foreground">Proof of residence:</span> a utility bill, bank statement or official letter showing your name and address, <span className="font-medium text-foreground">not older than 3 months</span>.</li>
        </ol>
      </div>
      <div className="flex items-center justify-between gap-3 border-y py-3"><span className="min-w-0"><span className="block text-xs text-muted-foreground">Send to</span><span className="block truncate font-semibold">{KYC_EMAIL}</span></span><button type="button" onClick={copy} className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium underline underline-offset-4"><Copy className="size-3.5" />{copied ? "Copied" : "Copy"}</button></div>
      <p className="text-muted-foreground">Send the email from {email ? <span className="font-medium text-foreground">{email}</span> : "the email address on your account"} so we can match it to your account. Our team reviews documents within 2 business days and will email you once your account is reinstated.</p>
      <div className="space-y-2">
        <Button asChild className="signup-primary"><a href={`mailto:${KYC_EMAIL}?subject=${subject}&body=${body}`}>Email my documents</a></Button>
        <button type="button" className="app-modal-secondary" onClick={async () => { await supabase.auth.signOut(); void navigate({ to: "/" }); }}>Sign out</button>
      </div>
    </div>
  </AuthShell>;
}
