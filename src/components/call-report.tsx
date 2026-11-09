import Link from "next/link";
import { db } from "@/lib/auth";
import { AutoRefresh } from "@/components/auto-refresh";

// Calls come from RingCentral: the ringcentral-sync job copies the company call log
// into the `ringcentral` schema every 2 minutes, and this section refreshes itself on
// the same beat. A "call to a lead" is an outbound
// dial to the phone or second phone of any lead, renewal or transfer. Times are Eastern.

type AgentRow = {
  id: string;
  name: string;
  today: number;
  week: number;
  month: number;
  allMonth: number;
  talkMin: number;
  notDialed: number;
};

type TrendRow = { kind: string; key: string; label: string; n: number };

type SyncRow = { syncedAt: string | null };

async function loadCallStats() {
  const [agents, trend, sync] = await Promise.all([
    db.$queryRaw<AgentRow[]>`
      WITH b AS (
        SELECT date_trunc('day', now() AT TIME ZONE 'America/New_York') AS d0,
               date_trunc('week', now() AT TIME ZONE 'America/New_York') AS w0,
               date_trunc('month', now() AT TIME ZONE 'America/New_York') AS m0
      ),
      ld AS (
        SELECT l.id, l."assignedToId" AS uid, l.status::text AS status, x.d
        FROM "Lead" l
        CROSS JOIN LATERAL (VALUES (ringcentral.digits10(l.phone)), (ringcentral.digits10(l."phoneSecondary"))) AS x(d)
      ),
      rec AS (SELECT DISTINCT d FROM ld WHERE d IS NOT NULL),
      c AS (
        SELECT k.user_id, k.duration_seconds, k.other_party_digits AS d,
               k.start_time AT TIME ZONE 'America/New_York' AS t,
               (rec.d IS NOT NULL) AS to_record
        FROM ringcentral.calls k
        CROSS JOIN b
        LEFT JOIN rec ON rec.d = k.other_party_digits
        WHERE k.direction = 'Outbound'
          AND k.start_time AT TIME ZONE 'America/New_York' >= b.m0 - interval '7 days'
      ),
      dialed AS (
        SELECT DISTINCT c.d FROM c CROSS JOIN b WHERE c.t >= b.m0 AND c.to_record
      ),
      nd AS (
        SELECT z.uid, count(*)::int AS n
        FROM (
          SELECT ld.id, ld.uid
          FROM ld LEFT JOIN dialed ON dialed.d = ld.d
          WHERE ld.status <> 'DNC'
          GROUP BY ld.id, ld.uid
          HAVING count(dialed.d) = 0
        ) z
        GROUP BY z.uid
      )
      SELECT u.id, u.name,
        (count(c.t) FILTER (WHERE c.to_record AND c.t >= b.d0))::int AS today,
        (count(c.t) FILTER (WHERE c.to_record AND c.t >= b.w0))::int AS week,
        (count(c.t) FILTER (WHERE c.to_record AND c.t >= b.m0))::int AS month,
        (count(c.t) FILTER (WHERE c.t >= b.m0))::int AS "allMonth",
        (round(coalesce(sum(c.duration_seconds) FILTER (WHERE c.t >= b.m0), 0) / 60.0))::int AS "talkMin",
        coalesce(nd.n, 0)::int AS "notDialed"
      FROM "User" u
      CROSS JOIN b
      LEFT JOIN c ON c.user_id = u.id
      LEFT JOIN nd ON nd.uid = u.id
      WHERE u.active
      GROUP BY u.id, u.name, nd.n
      ORDER BY month DESC, u.name
    `,
    db.$queryRaw<TrendRow[]>`
      WITH b AS (
        SELECT date_trunc('day', now() AT TIME ZONE 'America/New_York') AS d0,
               date_trunc('week', now() AT TIME ZONE 'America/New_York') AS w0,
               date_trunc('month', now() AT TIME ZONE 'America/New_York') AS m0
      ),
      rec AS (
        SELECT DISTINCT x.d
        FROM "Lead" l
        CROSS JOIN LATERAL (VALUES (ringcentral.digits10(l.phone)), (ringcentral.digits10(l."phoneSecondary"))) AS x(d)
        WHERE x.d IS NOT NULL
      ),
      c AS (
        SELECT k.start_time AT TIME ZONE 'America/New_York' AS t
        FROM ringcentral.calls k
        JOIN rec ON rec.d = k.other_party_digits
        WHERE k.direction = 'Outbound' AND k.start_time >= now() - interval '200 days'
      ),
      buckets AS (
        SELECT 'day'::text AS kind, g AS start, g + interval '1 day' AS stop, to_char(g, 'Mon FMDD') AS label
        FROM b, generate_series(b.d0 - interval '13 days', b.d0, interval '1 day') AS g
        UNION ALL
        SELECT 'week'::text, g, g + interval '1 week', to_char(g, 'Mon FMDD')
        FROM b, generate_series(b.w0 - interval '7 weeks', b.w0, interval '1 week') AS g
        UNION ALL
        SELECT 'month'::text, g, g + interval '1 month', to_char(g, 'Mon')
        FROM b, generate_series(b.m0 - interval '5 months', b.m0, interval '1 month') AS g
      )
      SELECT bk.kind, to_char(bk.start, 'YYYY-MM-DD') AS key, bk.label,
        (SELECT count(*) FROM c WHERE c.t >= bk.start AND c.t < bk.stop)::int AS n
      FROM buckets bk
      ORDER BY bk.kind, bk.start
    `,
    db.$queryRaw<SyncRow[]>`
      SELECT to_char(last_success_at AT TIME ZONE 'America/New_York', 'Mon FMDD, FMHH12:MI AM') AS "syncedAt"
      FROM ringcentral.sync_state
    `,
  ]);
  return { agents, trend, syncedAt: sync[0]?.syncedAt ?? null };
}

function formatTalk(min: number) {
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

export async function CallReport() {
  let data: Awaited<ReturnType<typeof loadCallStats>> | null = null;
  try {
    data = await loadCallStats();
  } catch (err) {
    console.error("Call report failed to load", err);
  }

  if (!data) {
    return (
      <div className="card mt-3 p-5">
        <h2 className="text-[15px] font-semibold text-ink">Calls</h2>
        <p className="mt-1 text-[13px] text-muted">
          Call data from RingCentral couldn&apos;t be loaded right now. Refresh in a minute.
        </p>
      </div>
    );
  }

  const { agents, trend, syncedAt } = data;
  const sum = (k: "today" | "week" | "month" | "allMonth") =>
    agents.reduce((s, a) => s + a[k], 0);

  const kpis = [
    { label: "Calls to leads today", value: sum("today") },
    { label: "Calls to leads this week", value: sum("week") },
    { label: "Calls to leads this month", value: sum("month") },
  ];

  const charts = [
    { kind: "day", title: "Daily · last 14 days", short: (label: string) => label.split(" ")[1] ?? label },
    { kind: "week", title: "Weekly · last 8 weeks", short: (label: string) => label },
    { kind: "month", title: "Monthly · last 6 months", short: (label: string) => label },
  ].map((c) => ({ ...c, rows: trend.filter((t) => t.kind === c.kind) }));

  return (
    <section className="mt-3">
      <AutoRefresh seconds={120} />
      <div className="mb-3 mt-6 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[17px] font-semibold text-ink">Calls · RingCentral</h2>
        <p className="text-[12px] text-faint">
          Outbound dials to leads, renewals and transfers. Updates every 2 minutes
          {syncedAt ? `, last sync ${syncedAt} ET` : ""}.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {kpis.map((k) => (
          <div key={k.label} className="card p-5">
            <p className="text-[28px] font-semibold leading-none tracking-tight text-ink">
              {k.value.toLocaleString()}
            </p>
            <p className="mt-1.5 text-[13px] text-muted">{k.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        {charts.map((c) => {
          const max = Math.max(1, ...c.rows.map((r) => r.n));
          return (
            <div key={c.kind} className="card p-5">
              <h3 className="mb-4 text-[15px] font-semibold text-ink">{c.title}</h3>
              <div className="flex items-end gap-1" style={{ height: 140 }}>
                {c.rows.map((r) => (
                  <div key={r.key} className="flex h-full min-w-0 flex-1 flex-col items-center gap-1">
                    <span className="text-[0.6rem] text-muted">{r.n ? r.n.toLocaleString() : ""}</span>
                    <div className="flex w-full flex-1 items-end">
                      <div
                        className="w-full rounded-t-md bg-accent transition-all"
                        style={{ height: `${(r.n / max) * 100}%`, minHeight: r.n ? 4 : 0 }}
                        title={`${r.label}: ${r.n.toLocaleString()} calls`}
                      />
                    </div>
                    <span className="truncate text-[0.6rem] text-faint">{c.short(r.label)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="card mt-3 overflow-hidden">
        <div className="border-b border-line px-5 py-3">
          <h3 className="text-[15px] font-semibold text-ink">Calls by agent</h3>
          <p className="mt-0.5 text-[12px] text-faint">
            Today, this week (since Monday) and this month count dials to leads. All dials and
            talk time include every outbound call. Not dialed is the agent&apos;s records (Do Not
            Call left out) nobody has dialed this month; click the number to see them.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-faint">
                <th className="px-5 py-2.5">Agent</th>
                <th className="px-3 py-2.5 text-right">Today</th>
                <th className="px-3 py-2.5 text-right">This week</th>
                <th className="px-3 py-2.5 text-right">This month</th>
                <th className="px-3 py-2.5 text-right">All dials (month)</th>
                <th className="px-3 py-2.5 text-right">Talk time (month)</th>
                <th className="px-5 py-2.5 text-right">Not dialed</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <tr key={a.id} className="border-b border-line last:border-0">
                  <td className="px-5 py-2.5 font-medium text-ink">{a.name}</td>
                  <td className="px-3 py-2.5 text-right text-ink-2">{a.today.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right text-ink-2">{a.week.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right font-semibold text-ink">
                    {a.month.toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5 text-right text-ink-2">{a.allMonth.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right text-ink-2">{formatTalk(a.talkMin)}</td>
                  <td className="px-5 py-2.5 text-right text-ink-2">
                    <Link
                      href={`/reports?tab=not-dialed&period=month&agent=${encodeURIComponent(a.id)}`}
                      className="underline decoration-line underline-offset-2 hover:text-ink"
                    >
                      {a.notDialed.toLocaleString()}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
