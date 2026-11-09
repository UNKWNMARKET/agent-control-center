import { unscopedDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

/**
 * Finding someone by phone number, however it happens to be punctuated.
 *
 * Numbers arrive from vendors as "(407) 496-3088", "407-496-3088" and
 * "4074963088" all in the same import, and they're stored as they arrived.
 * Comparing what an agent types against that text misses almost every time:
 * typing a customer's full number returned nothing at all, while typing the
 * last four worked by accident.
 *
 * So both sides get stripped to digits in the database and compared there.
 * A caller's number pasted in any shape finds them.
 */
export async function leadIdsByPhone(input: string, limit = 500): Promise<string[]> {
  const digits = input.replace(/\D/g, "");
  // Fewer than four digits matches most of the book; not worth running.
  if (digits.length < 4) return [];

  // Raw SQL bypasses the scoped client, so the agency filter is written out
  // by hand here. Without it this would search every agency on the platform.
  const user = await getCurrentUser();
  if (!user) return [];

  const pattern = `%${digits}%`;
  const rows = await unscopedDb.$queryRaw<{ id: string }[]>`
    select "id" from "Lead"
    where "agencyId" = ${user.agencyId}
      and (regexp_replace(coalesce("phone", ''), '[^0-9]', '', 'g') like ${pattern}
        or regexp_replace(coalesce("phoneSecondary", ''), '[^0-9]', '', 'g') like ${pattern})
    limit ${limit}
  `;
  return rows.map((r) => r.id);
}
