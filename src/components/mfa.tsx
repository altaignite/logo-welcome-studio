import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { usePopup } from "@/components/popup";

/** True when the user has a verified authenticator but this session hasn't passed it yet. */
export async function mfaNeeded() {
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return !!data && data.nextLevel === "aal2" && data.currentLevel !== "aal2";
}

function CodeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <InputOTP maxLength={6} value={value} onChange={onChange} inputMode="numeric" autoFocus aria-label="Six-digit code">
      <InputOTPGroup>{[0, 1, 2, 3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} />)}</InputOTPGroup>
    </InputOTP>
  );
}

/** Second sign-in step: a code from the user's authenticator app. */
export function MfaChallenge({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const verify = async () => {
    setBusy(true); setError(null);
    const { data: f } = await supabase.auth.mfa.listFactors();
    const factor = f?.totp?.find((x) => x.status === "verified");
    if (!factor) { setBusy(false); setError("No authenticator is set up for this account."); return; }
    const { error: e } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    setBusy(false);
    if (e) { setError("That code didn't work. Check the time on your phone and try again."); setCode(""); return; }
    onDone();
  };
  useEffect(() => { if (code.length === 6 && !busy) void verify(); }, [code]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="w-full max-w-md space-y-4">
      <div className="flex items-center gap-2"><ShieldCheck className="size-5" /><h2 className="text-lg font-bold">Two-factor authentication</h2></div>
      <p className="text-sm text-muted-foreground">Enter the six-digit code from your authenticator app.</p>
      <CodeInput value={code} onChange={setCode} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button type="button" disabled={busy || code.length !== 6} onClick={verify} className="signup-primary inline-flex items-center justify-center gap-2 text-sm">{busy && <Loader2 className="size-4 animate-spin" />}Verify</button>
      <button type="button" onClick={onCancel} className="app-modal-secondary">Use a different account</button>
    </div>
  );
}

/** Set up or remove an authenticator app (TOTP). */
export function MfaSettings({ onChange }: { onChange?: () => void }) {
  const popup = usePopup();
  const [factors, setFactors] = useState<{ id: string; friendly_name?: string; status: string; created_at: string }[] | null>(null);
  const [enrolling, setEnrolling] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => { const { data } = await supabase.auth.mfa.listFactors(); setFactors((data?.all ?? []).filter((f) => f.factor_type === "totp")); };
  useEffect(() => { void load(); }, []);
  const verified = (factors ?? []).filter((f) => f.status === "verified");
  const start = async () => {
    setBusy(true);
    // Clear half-finished setups first; Supabase allows only a few factors per user.
    for (const f of (factors ?? []).filter((x) => x.status !== "verified")) await supabase.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}` });
    setBusy(false);
    if (error || !data) return popup({ type: "error", title: "Couldn't start setup", description: error?.message ?? "Try again.", primaryLabel: "Close", secondaryLabel: null });
    setEnrolling({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret }); setCode("");
  };
  const confirm = async () => {
    if (!enrolling) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrolling.id, code });
    setBusy(false);
    if (error) return popup({ type: "error", title: "That code didn't work", description: "Enter the current code shown in your authenticator app.", primaryLabel: "Try again", secondaryLabel: null });
    setEnrolling(null); await load(); onChange?.();
    popup({ type: "success", title: "Two-factor authentication is on", description: "You'll enter a code from your app each time you sign in.", primaryLabel: "Done", secondaryLabel: null });
  };
  const remove = (id: string) => popup({
    type: "info", title: "Turn off two-factor authentication?", description: "Your account will only be protected by your password.", primaryLabel: "Turn off", secondaryLabel: "Cancel",
    onPrimary: async () => {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
      if (error) popup({ type: "error", title: "Couldn't turn it off", description: "Sign out and back in with your code, then try again.", primaryLabel: "Close", secondaryLabel: null });
      await load(); onChange?.();
    },
  });
  if (!factors) return <p className="p-5 text-sm text-muted-foreground">Loading…</p>;
  return (
    <div className="space-y-4 p-5 text-sm">
      {verified.length > 0 ? <>
        <p className="flex items-center gap-2 font-medium"><ShieldCheck className="size-4 text-emerald-600" />On. You enter a code from your authenticator app when you sign in.</p>
        {verified.map((f) => <div key={f.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"><span>{f.friendly_name ?? "Authenticator app"}</span><button type="button" onClick={() => remove(f.id)} className="text-xs font-semibold text-destructive">Turn off</button></div>)}
      </> : enrolling ? <>
        <p>Scan this code with an authenticator app such as Google Authenticator, 1Password or Authy, then enter the six-digit code it shows.</p>
        <img src={enrolling.qr} alt="QR code for your authenticator app" className="size-44 rounded-lg border bg-white p-2" />
        <p className="text-xs text-muted-foreground">Can't scan? Enter this key: <span className="select-all break-all font-mono">{enrolling.secret}</span></p>
        <CodeInput value={code} onChange={setCode} />
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy || code.length !== 6} onClick={confirm} className="h-10 rounded-full bg-foreground px-6 text-sm font-semibold text-background disabled:opacity-50">{busy ? "Checking…" : "Turn on"}</button>
          <button type="button" onClick={() => setEnrolling(null)} className="h-10 rounded-full border px-6 text-sm font-semibold">Cancel</button>
        </div>
      </> : <>
        <p className="text-muted-foreground">Optional. You sign in with just your password unless you turn this on. It adds a code from an authenticator app on your phone as a second step.</p>
        <button type="button" disabled={busy} onClick={start} className="h-10 rounded-full bg-foreground px-6 text-sm font-semibold text-background disabled:opacity-50">{busy ? "Starting…" : "Set up two-factor authentication"}</button>
      </>}
    </div>
  );
}
