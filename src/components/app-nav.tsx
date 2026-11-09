"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users2,
  Plug,
  Upload,
  ChevronDown,
  LogOut,
  UserCog,
  PhoneOff,
  BarChart3,
  CalendarClock,
  CalendarSync,
  ArrowRightLeft,
  ShieldCheck,
  Settings,
  Menu,
  X,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/utils";
import { logout } from "@/app/actions/auth";

type NavItem = { href: string; label: string; icon: React.ReactNode };
type NavGroup = { title: string; items: NavItem[] };

/**
 * The top bar.
 *
 * Twelve destinations in one row is a wall, not a menu, so the bar carries
 * only the six an agent uses all day. The rest are filed under Tools by what
 * they're for — moving work in and out, and running the agency — which is
 * also how they're grouped on a phone.
 */
export function AppNav({
  user,
  isAdmin,
}: {
  user: { name: string; email: string };
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const toolsRef = useRef<HTMLDivElement>(null);

  // The daily run of work, in the order it happens.
  const primary: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard size={17} /> },
    { href: "/leads", label: "Leads", icon: <Users2 size={17} /> },
    { href: "/follow-ups", label: "Follow-ups", icon: <CalendarClock size={17} /> },
    { href: "/renewals", label: "Renewals", icon: <CalendarSync size={17} /> },
    { href: "/customers", label: "Customers", icon: <Users2 size={17} /> },
    { href: "/agency", label: "Book of business", icon: <ShieldCheck size={17} /> },
  ];

  const groups: NavGroup[] = [
    {
      title: "Moving work",
      items: [
        { href: "/transfer", label: "Transfer", icon: <ArrowRightLeft size={17} /> },
        { href: "/import", label: "Import", icon: <Upload size={17} /> },
      ],
    },
    ...(isAdmin
      ? [
          {
            title: "Running the agency",
            items: [
              { href: "/reports", label: "Reports", icon: <BarChart3 size={17} /> },
              { href: "/team", label: "Team", icon: <UserCog size={17} /> },
              { href: "/vendors", label: "Integrations", icon: <Plug size={17} /> },
              { href: "/dnc", label: "Do Not Call", icon: <PhoneOff size={17} /> },
            ],
          },
        ]
      : []),
  ];

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const toolsActive = groups.some((g) => g.items.some((i) => isActive(i.href)));

  // Click-away, so the menu doesn't sit open over the page.
  useEffect(() => {
    if (!toolsOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!toolsRef.current?.contains(e.target as Node)) setToolsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setToolsOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [toolsOpen]);

  const pill = (active: boolean) =>
    cn(
      "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium transition-colors lg:px-3.5",
      active ? "bg-black/5 text-ink" : "text-muted hover:bg-black/[0.035] hover:text-ink",
    );

  return (
    <header className="glass sticky top-0 z-40 border-b border-line">
      <div className="mx-auto flex h-15 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Link href="/dashboard" className="flex shrink-0 items-center gap-2.5">
          <Logo className="h-8 w-8 shrink-0" />
          <span className="hidden shrink-0 whitespace-nowrap text-[15px] font-semibold tracking-tight text-ink sm:block">
            Agent Control Center
          </span>
        </Link>

        <nav className="ml-2 hidden min-w-0 flex-1 items-center gap-0.5 md:flex lg:ml-4 lg:gap-1">
          {primary.map((item) => (
            <Link key={item.href} href={item.href} className={pill(isActive(item.href))}>
              {item.icon}
              {item.label}
            </Link>
          ))}

          {/* Everything that isn't daily work, filed by what it's for. */}
          <div className="relative shrink-0" ref={toolsRef}>
            <button
              onClick={() => setToolsOpen((v) => !v)}
              aria-expanded={toolsOpen}
              aria-haspopup="menu"
              className={pill(toolsActive || toolsOpen)}
            >
              <Settings size={17} />
              Tools
              <ChevronDown
                size={14}
                className={cn("transition-transform", toolsOpen && "rotate-180")}
              />
            </button>

            {toolsOpen ? (
              <div
                role="menu"
                className="absolute left-0 mt-2 w-60 overflow-hidden rounded-2xl border border-line bg-surface py-1.5 shadow-[var(--shadow-pop)]"
              >
                {groups.map((group, i) => (
                  <div key={group.title}>
                    <p
                      className={cn(
                        "px-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-faint",
                        i === 0 ? "pt-1.5" : "mt-1.5 border-t border-line pt-2.5",
                      )}
                    >
                      {group.title}
                    </p>
                    {group.items.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        role="menuitem"
                        onClick={() => setToolsOpen(false)}
                        className={cn(
                          "flex items-center gap-2.5 px-4 py-2 text-sm",
                          isActive(item.href)
                            ? "bg-accent-soft font-medium text-accent"
                            : "text-ink hover:bg-black/[0.035]",
                        )}
                      >
                        <span className="text-muted">{item.icon}</span>
                        {item.label}
                      </Link>
                    ))}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {/* Account */}
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
              className="flex items-center gap-2 rounded-full p-1 pr-2 transition-colors hover:bg-black/5"
            >
              <Avatar name={user.name} className="h-8 w-8" />
              <span className="hidden max-w-[140px] truncate text-sm font-medium text-ink lg:block">
                {user.name}
              </span>
              <ChevronDown size={15} className="hidden text-faint lg:block" />
            </button>

            {menuOpen ? (
              <div className="absolute right-0 mt-2 w-60 overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-pop)]">
                <div className="border-b border-line px-4 py-3">
                  <p className="truncate text-sm font-semibold text-ink">
                    {user.name}
                  </p>
                  <p className="truncate text-xs text-muted">{user.email}</p>
                </div>
                <Link
                  href="/account"
                  className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-ink hover:bg-black/[0.035]"
                >
                  <UserCog size={16} className="text-muted" />
                  Account settings
                </Link>
                {isAdmin ? (
                  <Link
                    href="/settings"
                    className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-ink hover:bg-black/[0.035]"
                  >
                    <Settings size={16} className="text-muted" />
                    Agency settings
                  </Link>
                ) : null}
                <form action={logout}>
                  <button
                    type="submit"
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-danger hover:bg-danger-soft"
                  >
                    <LogOut size={16} />
                    Sign out
                  </button>
                </form>
              </div>
            ) : null}
          </div>

          <button
            className="rounded-full p-2 text-muted hover:bg-black/5 md:hidden"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Menu"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* On a phone, the same grouping, laid out flat. */}
      {mobileOpen ? (
        <nav className="border-t border-line px-4 py-3 md:hidden">
          <div className="flex flex-col gap-1">
            {primary.map((item) => (
              <MobileLink
                key={item.href}
                item={item}
                active={isActive(item.href)}
                onNavigate={() => setMobileOpen(false)}
              />
            ))}
          </div>

          {groups.map((group) => (
            <div key={group.title} className="mt-3 border-t border-line pt-3">
              <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
                {group.title}
              </p>
              <div className="flex flex-col gap-1">
                {group.items.map((item) => (
                  <MobileLink
                    key={item.href}
                    item={item}
                    active={isActive(item.href)}
                    onNavigate={() => setMobileOpen(false)}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>
      ) : null}
    </header>
  );
}

function MobileLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium",
        active ? "bg-black/5 text-ink" : "text-muted hover:bg-black/[0.035]",
      )}
    >
      {item.icon}
      {item.label}
    </Link>
  );
}
