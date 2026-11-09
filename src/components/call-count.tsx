import { PhoneCall } from "lucide-react";
import { db } from "@/lib/auth";
import { cn, timeAgo } from "@/lib/utils";

// How many times this lead has really been dialed: every outbound RingCentral call to
// its phone or second phone, whether the agent clicked Call here or dialed from the
// RingCentral app or a desk phone. Synced from RingCentral every 2 minutes.

type Row = {
  total: number;
  today: number;
  lastAt: Date | null;
  lastBy: string | null;
  lastResult: string | null;
};

export async function CallCount({
  phone,
  phoneSecondary,
}: {
  phone: string | null;
  phoneSecondary: string | null;
}) {
  if (!phone && !phoneSecondary) return null;

  let row: Row | null = null;
  try {
    const rows = await db.$queryRaw<Row[]>`
      WITH d AS (
        SELECT ringcentral.digits10(${phone ?? ""}::text) AS d1,
               ringcentral.digits10(${phoneSecondary ?? ""}::text) AS d2
      ),
      c AS (
        SELECT k.start_time, k.user_id, k.from_name, k.result
        FROM ringcentral.calls k
        CROSS JOIN d
        WHERE k.direction = 'Outbound'
          AND k.other_party_digits IS NOT NULL
          AND k.other_party_digits IN (d.d1, d.d2)
      ),
      last AS (
        SELECT c.start_time, c.result, coalesce(u.name, c.from_name) AS who
        FROM c LEFT JOIN "User" u ON u.id = c.user_id
        ORDER BY c.start_time DESC
        LIMIT 1
      )
      SELECT
        (SELECT count(*) FROM c)::int AS total,
        (SELECT count(*) FROM c
          WHERE c.start_time >= date_trunc('day', now() AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York')::int AS today,
        (SELECT start_time FROM last) AS "lastAt",
        (SELECT who FROM last) AS "lastBy",
        (SELECT result FROM last) AS "lastResult"
    `;
    row = rows[0] ?? null;
  } catch (err) {
    console.error("Call count failed to load", err);
    return null;
  }
  if (!row) return null;

  return (
    <p
      className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"
      title="Every outbound RingCentral dial to this lead's numbers, including calls made outside Agent Control Center. Updates every 2 minutes."
    >
      <span
        className={cn(
          "inline-flex items-center gap-1.5 font-medium",
          row.total ? "text-ink-2" : "text-danger",
        )}
      >
        <PhoneCall size={14} />
        {row.total ? `Dialed ${row.total} ${row.total === 1 ? "time" : "times"}` : "Not dialed yet"}
      </span>
      {row.today ? <span className="text-muted">· {row.today} today</span> : null}
      {row.lastAt ? (
        <span className="text-muted">
          · last {timeAgo(row.lastAt)}
          {row.lastBy ? ` by ${row.lastBy}` : ""}
          {row.lastResult ? ` (${row.lastResult})` : ""}
        </span>
      ) : null}
    </p>
  );
}
