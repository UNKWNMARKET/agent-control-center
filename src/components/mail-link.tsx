"use client";

import { Mail } from "lucide-react";
import { composeHref, opensInNewTab, type MailClient } from "@/lib/mail";
import { cn } from "@/lib/utils";

type Props = {
  email: string | null | undefined;
  client: MailClient;
  subject?: string;
  className?: string;
  /** Rows that navigate on click need the mail link to not trigger the row. */
  stopRowClick?: boolean;
  children?: React.ReactNode;
};

/** The lead's address, rendered as a click-to-compose link. */
export function MailLink({
  email,
  client,
  subject,
  className,
  stopRowClick,
  children,
}: Props) {
  const href = composeHref(email, client, { subject });
  if (!href) return <span className={className}>{children ?? email ?? "—"}</span>;
  const newTab = opensInNewTab(client);

  return (
    <a
      href={href}
      target={newTab ? "_blank" : undefined}
      rel={newTab ? "noopener noreferrer" : undefined}
      onClick={stopRowClick ? (e) => e.stopPropagation() : undefined}
      title={`Write to ${email}`}
      className={cn("hover:text-accent hover:underline", className)}
    >
      {children ?? email}
    </a>
  );
}

/** Button form, for page headers and toolbars. */
export function MailButton({
  email,
  client,
  subject,
  label = "Email",
  className,
}: Omit<Props, "children" | "stopRowClick"> & { label?: string }) {
  const href = composeHref(email, client, { subject });
  if (!href) return null;
  const newTab = opensInNewTab(client);

  return (
    <a
      href={href}
      target={newTab ? "_blank" : undefined}
      rel={newTab ? "noopener noreferrer" : undefined}
      title={`Write to ${email}`}
      className={cn("btn btn-secondary", className)}
    >
      <Mail size={15} /> {label}
    </a>
  );
}
