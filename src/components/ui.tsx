import type { LeadStatus } from "@prisma/client";
import { STATUS_META } from "@/lib/leads";
import { initials } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * A lead's stage: a coloured dot and a word. No filled pill — in a table of
 * fifty rows, fifty pills shout; fifty dots can be scanned.
 */
export function StatusBadge({ status }: { status: LeadStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-medium text-ink-2">
      <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}

export function Avatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-fill-2 text-[0.68rem] font-semibold text-muted",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center justify-center px-6 py-16 text-center">
      {icon ? (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-fill text-muted">
          {icon}
        </div>
      ) : null}
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-ink">
          {title}
        </h1>
        {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {children ? (
        <div className="flex flex-wrap items-center gap-2">{children}</div>
      ) : null}
    </div>
  );
}

/** The title row of a card: what this is, and one optional thing to do. */
export function CardHeader({
  title,
  children,
}: {
  title: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
      <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
      {children}
    </div>
  );
}
