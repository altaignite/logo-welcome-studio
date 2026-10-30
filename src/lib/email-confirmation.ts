import { supabase } from "@/integrations/supabase/client";
import type { PopupOptions } from "@/components/popup";

/** Supabase refuses password sign-in until the address is confirmed. */
export const isUnconfirmedEmail = (e: { message?: string | undefined; code?: string | undefined } | null | undefined) =>
  !!e && (e.code === "email_not_confirmed" || /email not confirmed/i.test(e.message ?? ""));

/** Popup for an unconfirmed address with a working "Resend" action. `redirectPath` is where the confirmation link lands. */
export function unconfirmedPopup(email: string, popup: (o: PopupOptions) => void, redirectPath = "/"): PopupOptions {
  const resend = async () => {
    const { error } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: `${window.location.origin}${redirectPath}` } });
    if (error) {
      const wait = /seconds|rate|security purposes/i.test(error.message);
      popup({ type: "error", title: wait ? "Please wait a moment" : "We couldn't resend the email", description: wait ? "A confirmation email was sent very recently. Wait a minute, then try again." : error.message, primaryLabel: "Close", secondaryLabel: null });
      return;
    }
    popup({ type: "success", title: "Confirmation email sent", description: `We sent a new link to ${email}. Open it to confirm your address, then sign in. Check your spam or promotions folder if you don't see it within a few minutes.`, primaryLabel: "Got it", secondaryLabel: null });
  };
  return {
    type: "info",
    title: "Please confirm your email first",
    description: `We sent a confirmation link to ${email} when you signed up. Open it to activate your login, then sign in again.`,
    primaryLabel: "Resend confirmation email",
    onPrimary: resend,
    secondaryLabel: "Close",
  };
}
