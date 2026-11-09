"use client";

import { Phone, MessageSquare } from "lucide-react";
import { callHref, smsHref, opensInTab, type PhoneApp } from "@/lib/phone";
import { logOutreach } from "@/app/actions/outreach";
import { formatPhone, cn } from "@/lib/utils";

type Base = {
  phone: string | null | undefined;
  app: PhoneApp;
  className?: string;
  /** Rows that navigate on click need these not to trigger the row. */
  stopRowClick?: boolean;
  /** Given a lead, the reach-out is logged automatically on click. */
  leadId?: string;
};

function anchorProps(
  app: PhoneApp,
  stopRowClick?: boolean,
  leadId?: string,
  channel?: "CALL" | "SMS",
) {
  const tab = opensInTab(app);
  return {
    target: tab ? "_blank" : undefined,
    rel: tab ? "noopener noreferrer" : undefined,
    onClick: (e: React.MouseEvent) => {
      if (stopRowClick) e.stopPropagation();
      // Fire and forget: the call or text opens immediately either way, and a
      // failed log should never get between an agent and the phone.
      if (leadId && channel) void logOutreach(leadId, channel).catch(() => {});
    },
  };
}

/** The number itself, click to call. */
export function CallLink({ phone, app, className, stopRowClick, leadId, children }: Base & { children?: React.ReactNode }) {
  const href = callHref(phone, app);
  if (!href) return <span className={className}>{children ?? formatPhone(phone ?? null)}</span>;
  return (
    <a href={href} title={`Call ${formatPhone(phone ?? null)}`} className={cn("hover:text-accent hover:underline", className)} {...anchorProps(app, stopRowClick, leadId, "CALL")}>
      {children ?? formatPhone(phone ?? null)}
    </a>
  );
}

/** Small message icon beside a number, click to text. */
export function TextLink({ phone, app, className, stopRowClick, leadId, message }: Base & { message?: string }) {
  const href = smsHref(phone, app, message);
  if (!href) return null;
  return (
    <a
      href={href}
      title={`Text ${formatPhone(phone ?? null)}`}
      aria-label={`Text ${formatPhone(phone ?? null)}`}
      className={cn("inline-flex items-center text-faint transition-colors hover:text-accent", className)}
      {...anchorProps(app, stopRowClick, leadId, "SMS")}
    >
      <MessageSquare size={13} />
    </a>
  );
}

/** Button pair for page headers. */
export function PhoneButtons({ phone, app, leadId, message }: Base & { message?: string }) {
  const call = callHref(phone, app);
  const sms = smsHref(phone, app, message);
  if (!call && !sms) return null;
  return (
    <>
      {call ? (
        <a href={call} className="btn btn-secondary" title={`Call ${formatPhone(phone ?? null)}`} {...anchorProps(app, false, leadId, "CALL")}>
          <Phone size={15} /> Call
        </a>
      ) : null}
      {sms ? (
        <a href={sms} className="btn btn-secondary" title={`Text ${formatPhone(phone ?? null)}`} {...anchorProps(app, false, leadId, "SMS")}>
          <MessageSquare size={15} /> Text
        </a>
      ) : null}
    </>
  );
}
