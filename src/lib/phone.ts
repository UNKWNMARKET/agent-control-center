/**
 * Click-to-call and click-to-text links.
 *
 * RingCentral deep links follow /r/sms?type=new&number=… and /r/call?number=…,
 * reachable three ways: the web app at app.ringcentral.com, the desktop app via
 * the rcapp:// protocol, and the phone apps via rcmobile://. Agencies differ in
 * which one is installed, so the target is a setting.
 */

export const PHONE_APPS = {
  rc_web: "RingCentral (web app)",
  rc_desktop: "RingCentral (desktop app)",
  rc_mobile: "RingCentral (mobile app)",
  device: "This computer's default phone and SMS app",
} as const;

export type PhoneApp = keyof typeof PHONE_APPS;

export const DEFAULT_PHONE_APP: PhoneApp = "rc_web";

export const PHONE_APP_HINTS: Record<PhoneApp, string> = {
  rc_web: "Opens app.ringcentral.com in a new tab with the number filled in. Works on any computer, and hands off to the desktop app when it's installed.",
  rc_desktop: "Opens the installed RingCentral desktop app directly. Nothing happens on a computer without it.",
  rc_mobile: "Opens the RingCentral app on a phone or tablet.",
  device: "Uses whatever the computer has registered for tel: and sms: links.",
};

export function asPhoneApp(value: string | null | undefined): PhoneApp {
  return value === "rc_web" || value === "rc_desktop" || value === "rc_mobile" || value === "device"
    ? value
    : DEFAULT_PHONE_APP;
}

/** US numbers to E.164, which is what the deep links expect. */
export function e164(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length > 11) return `+${digits}`;
  return null;
}

const base: Record<PhoneApp, string> = {
  rc_web: "https://app.ringcentral.com",
  rc_desktop: "rcapp://",
  rc_mobile: "rcmobile://",
  device: "",
};

export function callHref(phone: string | null | undefined, app: PhoneApp = DEFAULT_PHONE_APP): string | null {
  const n = e164(phone);
  if (!n) return null;
  const num = encodeURIComponent(n);
  if (app === "device") return `tel:${n}`;
  if (app === "rc_mobile") return `rcmobile://call?number=${num}`;
  return `${base[app]}/r/call?number=${num}`;
}

export function smsHref(
  phone: string | null | undefined,
  app: PhoneApp = DEFAULT_PHONE_APP,
  message?: string,
): string | null {
  const n = e164(phone);
  if (!n) return null;
  const num = encodeURIComponent(n);
  const body = message ? `&content=${encodeURIComponent(message)}` : "";
  if (app === "device") return `sms:${n}${message ? `?&body=${encodeURIComponent(message)}` : ""}`;
  if (app === "rc_mobile") return `rcmobile://sms?number=${num}${body}`;
  return `${base[app]}/r/sms?type=new&number=${num}${body}`;
}

/** Only the web app opens in a browser tab; the rest hand off to an installed app. */
export const opensInTab = (app: PhoneApp) => app === "rc_web";
