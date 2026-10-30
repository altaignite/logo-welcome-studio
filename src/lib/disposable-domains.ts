/** Common disposable and temporary email domains. Seeded into public.blocked_email_domains (migration 0012), which signup and
 * email changes are checked against on the server; staff can add more from Staff and security. Subdomains are blocked too. */
export const disposableDomains = [
  "0-mail.com", "10minutemail.com", "10minutemail.net", "20minutemail.com", "33mail.com", "anonaddy.com", "anonbox.net", "burnermail.io",
  "byom.de", "chacuo.net", "cock.li", "crazymailing.com", "deadaddress.com", "discard.email", "discardmail.com", "dispostable.com",
  "dropmail.me", "dumpmail.de", "easytrashmail.com", "emailondeck.com", "emailfake.com", "emltmp.com", "fakeinbox.com", "fakemail.net",
  "fakemailgenerator.com", "fexbox.org", "getairmail.com", "getnada.com", "guerrillamail.biz", "guerrillamail.com", "guerrillamail.de",
  "guerrillamail.info", "guerrillamail.net", "guerrillamail.org", "guerrillamailblock.com", "harakirimail.com", "inboxbear.com",
  "inboxkitten.com", "incognitomail.org", "jetable.org", "mail-temp.com", "mail.tm", "mail7.io", "mailcatch.com", "maildrop.cc",
  "mailinator.com", "mailinator.net", "mailinator2.com", "mailnesia.com", "mailpoof.com", "mailsac.com", "mailtemp.info", "mintemail.com",
  "mohmal.com", "moakt.com", "mytemp.email", "mytrashmail.com", "nada.email", "neverbox.com", "nwytg.net", "owlymail.com",
  "pokemail.net", "rcpt.at", "sharklasers.com", "spam4.me", "spambog.com", "spambox.us", "spamgourmet.com", "spamex.com",
  "spamfree24.org", "spaml.de", "temp-mail.io", "temp-mail.org", "tempail.com", "tempinbox.com", "tempmail.com", "tempmail.dev",
  "tempmail.net", "tempmail.plus", "tempmailo.com", "tempr.email", "tempmailaddress.com", "throwawaymail.com", "tmail.ws", "tmailor.com",
  "tmpmail.net", "tmpmail.org", "trash-mail.com", "trashmail.com", "trashmail.de", "trashmail.net", "trashmail.ws", "trbvm.com",
  "wegwerfmail.de", "wegwerfmail.net", "yopmail.com", "yopmail.fr", "yopmail.net", "zetmail.com", "emailnax.com", "minuteinbox.com",
  "linshiyouxiang.net", "1secmail.com", "1secmail.net", "1secmail.org", "esiix.com", "wwjmp.com", "xojxe.com", "yoggm.com",
  "kzccv.com", "qiott.com", "vjuum.com", "laafd.com", "txcct.com", "dpptd.com", "bheps.com", "rteet.com", "dcctb.com", "mailto.plus",
  "fextemp.com", "any.pink", "merepost.com", "simplelogin.co",
] as const;

/** Lower-cased domain of an address, or "" when there isn't one. */
export const emailDomain = (email: string) => (email.trim().toLowerCase().split("@")[1] ?? "").replace(/\.+$/, "");

/** True for a listed domain or any subdomain of one. */
export function isBlockedDomain(email: string, blocked: readonly string[] = disposableDomains) {
  const d = emailDomain(email);
  return !!d && blocked.some((b) => d === b || d.endsWith(`.${b}`));
}
