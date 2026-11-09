import { prisma } from "./db";
import { toCsv } from "./csv";

/**
 * A full copy of the agency's records, as spreadsheets.
 *
 * The point is to survive the app: if the site, the host or the database
 * were lost tomorrow, these files open in Excel and contain the book —
 * customers, policies, and every logged call and note. Nothing here depends
 * on the application to be readable.
 *
 * Password hashes are deliberately excluded; a backup that leaks is worse
 * than no backup.
 */

export type BackupFile = { filename: string; csv: string };

export async function buildBackup(): Promise<BackupFile[]> {
  const [leads, policies, documents, activities, users, vendors, dnc, settings] = await Promise.all([
    prisma.lead.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.policy.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.policyDocument.findMany({ orderBy: { uploadedAt: "asc" } }),
    prisma.activity.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.user.findMany({ orderBy: { name: "asc" } }),
    prisma.vendor.findMany({ orderBy: { name: "asc" } }),
    prisma.dncEntry.findMany(),
    prisma.setting.findMany(),
  ]);

  // Names against ids, so the spreadsheets stand alone without joins.
  const userName = new Map(users.map((u) => [u.id, u.name]));
  const leadName = new Map(
    leads.map((l) => [l.id, [l.firstName, l.lastName].filter(Boolean).join(" ")]),
  );

  return [
    {
      filename: "leads-and-customers.csv",
      csv: toCsv(
        leads.map((l) => ({
          ...l,
          assignedTo: l.assignedToId ? (userName.get(l.assignedToId) ?? "") : "",
        })),
      ),
    },
    {
      filename: "policies.csv",
      csv: toCsv(
        policies.map((p) => ({
          ...p,
          customer: leadName.get(p.leadId) ?? "",
          soldBy: p.soldById ? (userName.get(p.soldById) ?? "") : "",
        })),
      ),
    },
    {
      filename: "activity-history.csv",
      csv: toCsv(
        activities.map((a) => ({
          ...a,
          customer: leadName.get(a.leadId) ?? "",
          by: a.userId ? (userName.get(a.userId) ?? "") : "system",
        })),
      ),
    },
    { filename: "policy-documents.csv", csv: toCsv(documents) },
    {
      filename: "team.csv",
      // Never export credentials.
      csv: toCsv(users.map(({ passwordHash: _ignored, ...rest }) => rest)),
    },
    { filename: "lead-sources.csv", csv: toCsv(vendors) },
    { filename: "do-not-call.csv", csv: toCsv(dnc) },
    { filename: "settings.csv", csv: toCsv(settings) },
  ].filter((f) => f.csv.length > 0);
}

export const backupStamp = () => new Date().toISOString().slice(0, 10);
