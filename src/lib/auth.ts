import { cache } from "react";
import { redirect } from "next/navigation";
import type { Agency, User } from "@prisma/client";
import { unscopedDb, dbFor, type ScopedDb } from "./db";
import { readSession } from "./session";

/**
 * Who is signed in, which agency they belong to, and the only database handle
 * the app has.
 *
 * Carrying `db` on the signed-in user is deliberate: it means no page or
 * action can reach the database without first establishing whose data it is
 * allowed to see. Forgetting to scope a query stops being a mistake you can
 * make.
 *
 * A suspended agency signs nobody in — that is how an unpaid month is
 * handled, without touching anyone's data.
 */
export type SignedIn = User & { agency: Agency; db: ScopedDb };

export const getCurrentUser = cache(async (): Promise<SignedIn | null> => {
  const session = await readSession();
  if (!session) return null;
  // The only read that cannot be scoped: finding out who this is.
  const user = await unscopedDb.user.findUnique({
    where: { id: session.userId },
    include: { agency: true },
  });
  if (!user || !user.active) return null;
  if (user.agency.status === "SUSPENDED") return null;
  return Object.assign(user, { db: dbFor(user.agencyId) });
});

/** Require any signed-in user, else redirect to /login. */
export async function requireUser(): Promise<SignedIn> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Require an admin of their own agency, else send them to the dashboard. */
export async function requireAdmin(): Promise<SignedIn> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");
  return user;
}

/**
 * Require the platform owner — the one account that may look across agencies.
 *
 * A missing owner is a 404, not a redirect to a login page: there is no reason
 * to tell a stranger that an owner console exists.
 */
export async function requireOwner(): Promise<SignedIn> {
  const user = await getCurrentUser();
  if (!user || !user.isPlatformOwner) redirect("/dashboard");
  return user;
}

export function isAdmin(user: { role: string } | null | undefined): boolean {
  return user?.role === "ADMIN";
}

/**
 * The scoped database handle for whoever is signed in.
 *
 * `getCurrentUser` is cached for the life of the request, so calling this from
 * anywhere inside a request is free and always returns the same agency. It
 * throws rather than returning null: there is no sensible unscoped fallback,
 * and a thrown error is better than a query that quietly reads everything.
 *
 * Code that runs without a session — inbound webhooks, cron jobs, the owner
 * console — must name its agency explicitly with `dbFor`.
 */
export async function requireDb(): Promise<ScopedDb> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in");
  return user.db;
}

/**
 * The database, as seen by whoever is signed in.
 *
 * Every call resolves the agency first and runs against that agency's scoped
 * client, so `db.lead.findMany({})` returns one agency's leads and never
 * anybody else's — there is no way to write the query that returns everyone's.
 *
 * Reaching for this outside a request throws "Not signed in" rather than
 * falling back to something unscoped. Inbound webhooks and cron jobs have no
 * session and must name their agency with `dbFor`.
 */
export const db = new Proxy({} as ScopedDb, {
  get(_target, model: string | symbol) {
    if (typeof model !== "string" || model.startsWith("$")) {
      throw new Error(
        `db.${String(model)} is not available on the scoped client — ` +
          "use dbFor(agencyId) and filter by agency yourself.",
      );
    }
    return new Proxy(
      {},
      {
        get(_t, operation: string | symbol) {
          return async (...args: unknown[]) => {
            const scoped = (await requireDb()) as unknown as Record<
              string,
              Record<string, (...a: unknown[]) => Promise<unknown>>
            >;
            return scoped[model][operation as string](...args);
          };
        },
      },
    );
  },
});

/**
 * The agency filter every query starts from.
 *
 * Written as a function rather than passed around loose so that a query
 * missing its scope is obvious in review: if you don't see `scope(user)` in
 * a `where`, it isn't scoped.
 */
export const scope = (user: { agencyId: string }) => ({ agencyId: user.agencyId });
