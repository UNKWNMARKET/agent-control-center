/**
 * Click-to-call and click-to-text.
 *
 * Every agency runs a different phone system, so this is a setting rather
 * than a decision. Each entry knows how to turn a number into a link that
 * phone system understands — a deep link into a desktop or mobile app, a URL
 * for a web dialer, or the plain `tel:` and `sms:` the computer already
 * handles.
 *
 * Adding a system later is a matter of adding a row here and nothing else.
 */

export const PHONE_APPS = {
  rc_web: "RingCentral (web)",
  rc_desktop: "RingCentral (desktop app)",
  rc_mobile: "RingCentral (mobile app)",
  dialpad: "Dialpad",
  zoom_phone: "Zoom Phone",
  eight_by_eight: "8x8",
  vonage: "Vonage",
  goto: "GoTo Connect",
  device: "Whatever this computer uses",
} as const;

export type PhoneApp = keyof typeof PHONE_APPS;

export const DEFAULT_PHONE_APP: PhoneApp = "device";

export const PHONE_APP_HINTS: Record<PhoneApp, string> = {
  rc_web:
    "Opens app.ringcentral.com in a new tab with the number filled in. Works on any computer, and hands off to the desktop app when it's installed.",
  rc_desktop: "Opens the installed RingCentral desktop app directly. Nothing happens on a computer without it.",
  rc_mobile: "Opens the RingCentral app on a phone or tablet.",
  dialpad: "Opens Dialpad with the number ready to dial.",
  zoom_phone: "Opens Zoom and starts the call from Zoom Phone.",
  eight_by_eight: "Opens the 8x8 Work app.",
  vonage: "Opens the Vonage Business app.",
  goto: "Opens GoTo Connect.",
  device:
    "Uses whatever this computer has registered for tel: and sms: links — a softphone, or the phone paired with it. The safest choice if you're not sure.",
};

export function asPhoneApp(value: string | null | undefined): PhoneApp {
  return value != null && value in PHONE_APPS ? (value as PhoneApp) : DEFAULT_PHONE_APP;
}

/** US numbers to E.164, which is what the deep links expect. */
export function e164(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length > 11) return `+${digits}`;
  return null;
}

/**
 * How each system wants to be handed a number.
 *
 * `tab` marks the ones that are web pages rather than installed apps, which
 * decides whether the link opens a new tab or hands off to the desktop.
 */
type Spec = {
  call: (n: string, encoded: string) => string;
  sms: (n: string, encoded: string, body: string) => string;
  tab?: boolean;
};

const SPECS: Record<PhoneApp, Spec> = {
  rc_web: {
    call: (_n, e) => `https://app.ringcentral.com/r/call?number=${e}`,
    sms: (_n, e, b) => `https://app.ringcentral.com/r/sms?type=new&number=${e}${b}`,
    tab: true,
  },
  rc_desktop: {
    call: (_n, e) => `rcapp://r/call?number=${e}`,
    sms: (_n, e, b) => `rcapp://r/sms?type=new&number=${e}${b}`,
  },
  rc_mobile: {
    call: (_n, e) => `rcmobile://call?number=${e}`,
    sms: (_n, e, b) => `rcmobile://sms?number=${e}${b}`,
  },
  dialpad: {
    call: (_n, e) => `dialpad://${e}`,
    // Dialpad has no documented deep link for a pre-filled text, so this
    // falls back to the computer's own handler rather than a dead link.
    sms: (n, _e, _b) => `sms:${n}`,
  },
  zoom_phone: {
    call: (_n, e) => `zoomphonecall://${e}`,
    sms: (n) => `sms:${n}`,
  },
  eight_by_eight: {
    call: (_n, e) => `sip:${e}`,
    sms: (n) => `sms:${n}`,
  },
  vonage: {
    call: (_n, e) => `tel:${e}`,
    sms: (n) => `sms:${n}`,
  },
  goto: {
    call: (_n, e) => `tel:${e}`,
    sms: (n) => `sms:${n}`,
  },
  device: {
    call: (n) => `tel:${n}`,
    sms: (n, _e, b) => `sms:${n}${b ? `?&body=${b.replace(/^&content=/, "")}` : ""}`,
  },
};

export function callHref(
  phone: string | null | undefined,
  app: PhoneApp = DEFAULT_PHONE_APP,
): string | null {
  const n = e164(phone);
  if (!n) return null;
  return SPECS[app].call(n, encodeURIComponent(n));
}

export function smsHref(
  phone: string | null | undefined,
  app: PhoneApp = DEFAULT_PHONE_APP,
  message?: string,
): string | null {
  const n = e164(phone);
  if (!n) return null;
  const body = message ? `&content=${encodeURIComponent(message)}` : "";
  return SPECS[app].sms(n, encodeURIComponent(n), body);
}

/** Web dialers open a tab; installed apps hand off instead. */
export const opensInTab = (app: PhoneApp) => SPECS[app].tab === true;
