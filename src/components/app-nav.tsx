"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutGrid,
  Inbox,
  Plug,
  Upload,
  LogOut,
  UserRound,
  PhoneOff,
  BarChart3,
  CalendarClock,
  RefreshCw,
  ArrowRightLeft,
  ShieldCheck,
  Settings,
  Ellipsis,
  Building2,
  Users,
  Contact,
  Search,
  Plus,
  ChevronsUpDown,
  X,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/utils";
import { logout } from "@/app/actions/auth";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** A count worth seeing before you click, e.g. follow-ups due. */
  badge?: number;
};
type NavGroup = { title?: string; items: NavItem[] };

/**
 * Getting around.
 *
 * On a desk: a sidebar, with every destination visible and grouped by what
 * it's for. Nothing is hidden in a menu, so nobody has to remember where
 * Import lives.
 *
 * On a phone: the four places an agent goes all day sit in a tab bar under
 * the thumb, and everything else is one tap away under More.
 */
export function AppNav({
  user,
  isAdmin,
  agencyName,
  isOwner,
  followUpsDue = 0,
}: {
  user: { name: string; email: string };
  isAdmin: boolean;
  /** Their agency, shown in the corner in place of the product name. */
  agencyName: string;
  /** The platform owner also sees the Agencies console. */
  isOwner: boolean;
  followUpsDue?: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [accountOpen, setAccountOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  // The daily run of work, in the order it happens.
  const daily: NavItem[] = [
    { href: "/dashboard", label: "Home", icon: <LayoutGrid size={17} /> },
    { href: "/leads", label: "Leads", icon: <Inbox size={17} /> },
    {
      href: "/follow-ups",
      label: "Follow-ups",
      icon: <CalendarClock size={17} />,
      badge: followUpsDue,
    },
    { href: "/renewals", label: "Renewals", icon: <RefreshCw size={17} /> },
    { href: "/customers", label: "Customers", icon: <Contact size={17} /> },
    { href: "/agency", label: "Book of business", icon: <ShieldCheck size={17} /> },
  ];

  const groups: NavGroup[] = [
    { items: daily },
    {
      title: "Move work",
      items: [
        { href: "/transfer", label: "Transfer", icon: <ArrowRightLeft size={17} /> },
        { href: "/import", label: "Import", icon: <Upload size={17} /> },
      ],
    },
    ...(isAdmin
      ? [
          {
            title: "Agency",
            items: [
              { href: "/reports", label: "Reports", icon: <BarChart3 size={17} /> },
              { href: "/team", label: "Team", icon: <Users size={17} /> },
              { href: "/vendors", label: "Lead sources", icon: <Plug size={17} /> },
              { href: "/dnc", label: "Do Not Call", icon: <PhoneOff size={17} /> },
              { href: "/settings", label: "Settings", icon: <Settings size={17} /> },
            ],
          },
        ]
      : []),
    // The platform owner's own section, and only theirs.
    ...(isOwner
      ? [
          {
            title: "Platform",
            items: [{ href: "/owner", label: "Agencies", icon: <Building2 size={17} /> }],
          },
        ]
      : []),
  ];

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  // The phone's tab bar: four daily places, then everything else.
  const tabs = [daily[0], daily[1], daily[2], daily[4]];
  const moreActive = !tabs.some((t) => isActive(t.href));

  // Menus close on a click elsewhere, on Escape, and on navigation.
  useEffect(() => {
    if (!accountOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!accountRef.current?.contains(e.target as Node)) setAccountOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [accountOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAccountOpen(false);
        setMoreOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Arriving somewhere new closes whatever was open.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setAccountOpen(false);
    setMoreOpen(false);
  }

  const search = (form: HTMLFormElement) => {
    const q = String(new FormData(form).get("q") ?? "").trim();
    router.push(q ? `/leads?q=${encodeURIComponent(q)}` : "/leads");
    form.reset();
  };

  return (
    <>
      {/* ── Desktop: sidebar ─────────────────────────────────────────── */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-line bg-sidebar lg:flex">
        <Link href="/dashboard" className="flex items-center gap-2.5 px-4 pb-3 pt-5">
          <Logo className="h-7 w-7 shrink-0" />
          <span className="truncate text-[15px] font-semibold tracking-tight text-ink">
            {agencyName}
          </span>
        </Link>

        <div className="flex items-center gap-2 px-3 pb-2">
          <form
            role="search"
            className="relative min-w-0 flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              search(e.currentTarget);
            }}
          >
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint"
            />
            <input
              name="q"
              aria-label="Search leads"
              placeholder="Search"
              className="input min-h-8 py-1 pl-8 text-[13px]"
            />
          </form>
          <Link
            href="/leads/new"
            aria-label="Add a lead"
            title="Add a lead"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-accent text-on-accent transition-colors hover:bg-accent-hover"
          >
            <Plus size={16} />
          </Link>
        </div>

        <nav className="no-scrollbar flex-1 overflow-y-auto px-3 pb-3">
          {groups.map((group, i) => (
            <div key={group.title ?? i} className={i === 0 ? "mt-1" : "mt-5"}>
              {group.title ? <p className="eyebrow px-2.5 pb-1.5">{group.title}</p> : null}
              <div className="flex flex-col gap-px">
                {group.items.map((item) => (
                  <SideLink key={item.href} item={item} active={isActive(item.href)} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="relative border-t border-line p-2" ref={accountRef}>
          {accountOpen ? (
            <div className="popover absolute inset-x-2 bottom-full mb-1 overflow-hidden py-1">
              <AccountMenu />
            </div>
          ) : null}
          <button
            onClick={() => setAccountOpen((v) => !v)}
            aria-expanded={accountOpen}
            aria-haspopup="menu"
            className="flex w-full items-center gap-2.5 rounded-[10px] p-1.5 text-left transition-colors hover:bg-fill"
          >
            <Avatar name={user.name} className="h-8 w-8" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-ink">{user.name}</span>
              <span className="block truncate text-[11px] text-faint">{user.email}</span>
            </span>
            <ChevronsUpDown size={14} className="shrink-0 text-faint" />
          </button>
        </div>
      </aside>

      {/* ── Phone and tablet: slim top bar ───────────────────────────── */}
      <header className="glass sticky top-0 z-40 flex h-12 items-center gap-2.5 border-b border-line px-4 lg:hidden">
        <Link href="/dashboard" className="flex min-w-0 items-center gap-2">
          <Logo className="h-6 w-6 shrink-0" />
          <span className="truncate text-[15px] font-semibold tracking-tight text-ink">
            {agencyName}
          </span>
        </Link>
        <Link
          href="/leads/new"
          aria-label="Add a lead"
          className="ml-auto flex h-8 w-8 items-center justify-center rounded-full bg-accent text-on-accent"
        >
          <Plus size={17} />
        </Link>
      </header>

      {/* ── Phone and tablet: tab bar ────────────────────────────────── */}
      <nav
        aria-label="Main"
        className="glass fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {tabs.map((item) => (
          <TabLink key={item.href} item={item} active={isActive(item.href)} />
        ))}
        <button
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          className={cn(
            "flex flex-col items-center gap-0.5 pb-1.5 pt-2 text-[10px] font-medium",
            moreActive ? "text-accent" : "text-faint",
          )}
        >
          <Ellipsis size={21} />
          More
        </button>
      </nav>

      {/* ── Phone and tablet: the More sheet ─────────────────────────── */}
      {moreOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="More">
          <button
            aria-label="Close"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMoreOpen(false)}
          />
          <div className="sheet-up absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-[20px] bg-canvas pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            <div className="sticky top-0 z-10 flex items-center justify-between bg-canvas px-5 pb-2 pt-4">
              <div className="flex min-w-0 items-center gap-2.5">
                <Avatar name={user.name} className="h-9 w-9" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
                  <p className="truncate text-xs text-muted">{user.email}</p>
                </div>
              </div>
              <button
                onClick={() => setMoreOpen(false)}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-fill text-muted"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4 px-4 pt-2">
              {groups.map((group, i) => {
                // The tab bar already holds these.
                const items = group.items.filter((it) => !tabs.includes(it));
                if (items.length === 0) return null;
                return (
                  <div key={group.title ?? i}>
                    {group.title ? <p className="eyebrow px-3 pb-1.5">{group.title}</p> : null}
                    <div className="card divide-y divide-line overflow-hidden">
                      {items.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={cn(
                            "flex items-center gap-3 px-3.5 py-3 text-[15px]",
                            isActive(item.href) ? "font-medium text-accent" : "text-ink",
                          )}
                        >
                          <span className={isActive(item.href) ? "text-accent" : "text-muted"}>
                            {item.icon}
                          </span>
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })}

              <div className="card overflow-hidden py-1">
                <AccountMenu roomy />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function SideLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[14px] transition-colors",
        active ? "bg-fill-2 font-medium text-ink" : "text-ink-2 hover:bg-fill",
      )}
    >
      <span className={active ? "text-accent" : "text-muted"}>{item.icon}</span>
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.badge ? (
        <span className="tabular rounded-full bg-danger px-1.5 text-[11px] font-semibold leading-[18px] text-white">
          {item.badge > 99 ? "99+" : item.badge}
        </span>
      ) : null}
    </Link>
  );
}

function TabLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex flex-col items-center gap-0.5 pb-1.5 pt-2 text-[10px] font-medium",
        active ? "text-accent" : "text-faint",
      )}
    >
      <span className="relative [&>svg]:h-[21px] [&>svg]:w-[21px]">
        {item.icon}
        {item.badge ? (
          <span className="absolute -right-2 -top-1 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] font-semibold leading-4 text-white">
            {item.badge > 99 ? "99+" : item.badge}
          </span>
        ) : null}
      </span>
      {item.label}
    </Link>
  );
}

function AccountMenu({ roomy = false }: { roomy?: boolean }) {
  const row = cn(
    "flex w-full items-center gap-2.5 px-3.5 text-left hover:bg-fill",
    roomy ? "py-3 text-[15px]" : "py-2 text-[13px]",
  );
  return (
    <>
      <Link href="/account" role="menuitem" className={cn(row, "text-ink")}>
        <UserRound size={roomy ? 17 : 15} className="text-muted" />
        Your account
      </Link>
      <form action={logout}>
        <button type="submit" role="menuitem" className={cn(row, "text-danger")}>
          <LogOut size={roomy ? 17 : 15} />
          Sign out
        </button>
      </form>
    </>
  );
}
