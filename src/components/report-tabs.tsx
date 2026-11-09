import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "overview", label: "Overview", href: "/reports" },
  { key: "not-dialed", label: "Not dialed", href: "/reports?tab=not-dialed" },
] as const;

export type ReportTab = (typeof TABS)[number]["key"];

export function ReportTabs({ active }: { active: ReportTab }) {
  return (
    <nav className="mb-4 flex gap-1 border-b border-line" aria-label="Report views">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={active === t.key ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-[14px] font-medium transition-colors",
            active === t.key
              ? "border-accent text-ink"
              : "border-transparent text-muted hover:text-ink",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
