import { dbFor, type ScopedDb } from "./db";
import { requireDb } from "./auth";
import { asMailClient, type MailClient } from "./mail";
import { asPhoneApp, type PhoneApp } from "./phone";

/**
 * Per-agency settings.
 *
 * Every function here takes an optional database handle. Left out, it uses
 * whoever is signed in — which is what a page or an action wants. Passed in,
 * it reads another agency's settings, which is what an inbound webhook or a
 * cron job needs, since neither has a session to work from.
 */
const handle = async (db?: ScopedDb): Promise<ScopedDb> => db ?? (await requireDb());

/** Settings for a named agency, for code running outside a request. */
export const settingsFor = (agencyId: string): ScopedDb => dbFor(agencyId);

export async function getSetting(key: string, scoped?: ScopedDb): Promise<string | null> {
  const db = await handle(scoped);
  const s = await db.setting.findFirst({ where: { key } });
  return s?.value ?? null;
}

export async function setSetting(key: string, value: string, scoped?: ScopedDb): Promise<void> {
  const db = await handle(scoped);
  const existing = await db.setting.findFirst({ where: { key }, select: { key: true } });
  if (existing) await db.setting.updateMany({ where: { key }, data: { value } });
  else await db.setting.create({ data: { key, value } });
}

/** Which mail client "Email" links should open. Defaults to the desktop app. */
export async function getMailClient(scoped?: ScopedDb): Promise<MailClient> {
  return asMailClient(await getSetting("email_client", scoped));
}

/** Which app call and text links should open. Defaults to RingCentral web. */
export async function getPhoneApp(scoped?: ScopedDb): Promise<PhoneApp> {
  return asPhoneApp(await getSetting("phone_app", scoped));
}

/**
 * Round-robin assignee for an incoming lead. Returns the next active agent's id
 * when auto-assignment is enabled, otherwise null (lead stays unassigned).
 */
export async function pickNextAssignee(scoped?: ScopedDb): Promise<string | null> {
  const db = await handle(scoped);
  if ((await getSetting("auto_assign", db)) !== "on") return null;

  const agents = await db.user.findMany({
    where: { active: true, role: "AGENT" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (agents.length === 0) return null;

  const lastId = await getSetting("auto_assign_cursor", db);
  const lastIndex = agents.findIndex((a) => a.id === lastId);
  const next = agents[(lastIndex + 1) % agents.length];
  await setSetting("auto_assign_cursor", next.id, db);
  return next.id;
}
