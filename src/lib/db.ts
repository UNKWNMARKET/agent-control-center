import { PrismaClient } from "@prisma/client";

/**
 * Database access, in two flavours.
 *
 * Every agency on this platform shares one database, so the dangerous mistake
 * is a query that forgets whose data it is asking for. Rather than trust
 * forty files to remember, the scoped client below rewrites every query as it
 * goes: reads gain `agencyId`, writes gain `agencyId`, and a query that tries
 * to reach outside its agency comes back empty.
 *
 * `unscopedDb` is the raw client. It exists because sign-in has to find a user
 * before it knows their agency, inbound webhooks identify themselves by token,
 * and the owner console looks across agencies on purpose. Those are the only
 * four callers, and the name is deliberately ugly so a fifth stands out.
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const unscopedDb =
  globalForPrisma.prisma ?? new PrismaClient({ log: ["error", "warn"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = unscopedDb;

/**
 * Models that carry an agencyId of their own.
 *
 * Activity and PolicyDocument are deliberately absent: they are reached only
 * through a Lead, which is scoped, and giving them a column of their own would
 * be one more thing to keep in step.
 */
const TENANT_MODELS = new Set([
  "Lead",
  "Vendor",
  "Setting",
  "DncEntry",
  "Policy",
  "User",
  "Invite",
]);

/** Reads and writes, split by what has to happen to the arguments. */
const WHERE_OPS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "updateMany",
  "deleteMany",
]);
const UNIQUE_OPS = new Set(["findUnique", "findUniqueOrThrow"]);
const SINGLE_WRITE_OPS = new Set(["update", "delete"]);
const CREATE_OPS = new Set(["create", "createMany", "createManyAndReturn"]);

type AnyArgs = Record<string, unknown>;

const withAgency = (where: unknown, agencyId: string): AnyArgs => ({
  ...((where as AnyArgs) ?? {}),
  agencyId,
});

/**
 * A Prisma client that can only see one agency.
 *
 * `findUnique` becomes `findFirst` on the way through. Prisma will not accept
 * a non-unique field in a `findUnique` where-clause, and an id lookup that
 * ignored the agency is precisely the hole this exists to close — so the
 * operation is swapped for one that can carry the filter.
 *
 * `update` and `delete` by id are rewritten the same way: they run as
 * `updateMany`/`deleteMany` with the agency filter, and throw if they touch
 * nothing, so a write aimed at another agency fails loudly instead of
 * silently succeeding.
 */
export function dbFor(agencyId: string) {
  return unscopedDb.$extends({
    name: "agency-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_MODELS.has(model)) return query(args);
          const a = (args ?? {}) as AnyArgs;

          if (WHERE_OPS.has(operation)) {
            return query({ ...a, where: withAgency(a.where, agencyId) });
          }

          if (UNIQUE_OPS.has(operation)) {
            const rows = await (
              unscopedDb as unknown as Record<string, { findFirst: (x: AnyArgs) => Promise<unknown> }>
            )[lower(model)].findFirst({ ...a, where: withAgency(a.where, agencyId) });
            if (!rows && operation === "findUniqueOrThrow") {
              throw new Error(`No ${model} found`);
            }
            return rows;
          }

          if (SINGLE_WRITE_OPS.has(operation)) {
            const many = operation === "update" ? "updateMany" : "deleteMany";
            const result = (await (
              unscopedDb as unknown as Record<string, Record<string, (x: AnyArgs) => Promise<{ count: number }>>>
            )[lower(model)][many]({
              where: withAgency(a.where, agencyId),
              ...(operation === "update" ? { data: a.data } : {}),
            })) as { count: number };
            if (result.count === 0) {
              throw new Error(`No ${model} matched — it may belong to another agency`);
            }
            // Hand back the row the caller expected to get.
            return (
              unscopedDb as unknown as Record<string, { findFirst: (x: AnyArgs) => Promise<unknown> }>
            )[lower(model)].findFirst({ where: withAgency(a.where, agencyId) });
          }

          if (CREATE_OPS.has(operation)) {
            if (Array.isArray(a.data)) {
              return query({
                ...a,
                data: (a.data as AnyArgs[]).map((row) => ({ ...row, agencyId })),
              });
            }
            return query({ ...a, data: { ...((a.data as AnyArgs) ?? {}), agencyId } });
          }

          if (operation === "upsert") {
            return query({
              ...a,
              where: withAgency(a.where, agencyId),
              create: { ...((a.create as AnyArgs) ?? {}), agencyId },
            });
          }

          return query(args);
        },
      },
    },
  });
}

const lower = (model: string) => model.charAt(0).toLowerCase() + model.slice(1);

export type ScopedDb = ReturnType<typeof dbFor>;
