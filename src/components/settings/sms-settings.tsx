"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { setSmsAutomation, saveSmsSettings } from "@/app/actions/settings";
import type { ActionState } from "@/app/actions/users";
import { cn } from "@/lib/utils";

function Switch({
  on,
  disabled,
  onClick,
}: {
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      role="switch"
      aria-checked={on}
      className={cn(
        "relative h-7 w-12 shrink-0 rounded-full transition-colors",
        on ? "bg-accent" : "bg-fill-2",
      )}
    >
      <span
        className={cn(
          "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all",
          on ? "left-6" : "left-1",
        )}
      />
    </button>
  );
}

export function SmsSettings({
  enabled,
  configured,
  agencyName,
  initialTpl,
  followupTpl,
  inboundUrl,
}: {
  enabled: boolean;
  configured: boolean;
  agencyName: string;
  initialTpl: string;
  followupTpl: string;
  inboundUrl: string;
}) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [toggling, startToggle] = useTransition();
  const [state, action, pending] = useActionState<ActionState, FormData>(
    saveSmsSettings,
    undefined,
  );

  const toggle = () =>
    startToggle(async () => {
      const next = !on;
      setOn(next);
      await setSmsAutomation(next);
      router.refresh();
    });

  return (
    <div className="card space-y-5 p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <MessageSquare size={16} /> Text automation
          </p>
          <p className="mt-1 text-sm text-muted">
            Text new leads automatically, then again at 5 days if not sold. Never
            texts DNC/blocked numbers or anyone who replied STOP.
          </p>
        </div>
        <Switch on={on} disabled={toggling} onClick={toggle} />
      </div>

      {configured ? (
        <p className="rounded-xl bg-positive-soft px-3.5 py-2.5 text-sm font-medium text-positive">
          Twilio is connected — texts will send when automation is on.
        </p>
      ) : (
        <p className="rounded-xl bg-warning-soft px-3.5 py-2.5 text-sm font-medium text-warning">
          Add your Twilio keys (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
          TWILIO_FROM_NUMBER) in Vercel to start sending. The automation is set up;
          no texts go out until then.
        </p>
      )}

      <form action={action} className="space-y-4">
        <div>
          <label className="label">Agency name (shown in texts)</label>
          <input
            name="agency_name"
            defaultValue={agencyName}
            className="input"
            placeholder="e.g. KRM Insurance"
          />
        </div>
        <div>
          <label className="label">Initial text — sent to new leads</label>
          <textarea
            name="sms_template_initial"
            rows={3}
            defaultValue={initialTpl}
            className="input resize-y"
          />
          <p className="mt-1 text-xs text-faint">
            {"Variables: {firstName}, {lastName}, {agency}. Always include “Reply STOP to opt out.”"}
          </p>
        </div>
        <div>
          <label className="label">5-day follow-up text — if not sold</label>
          <textarea
            name="sms_template_followup"
            rows={3}
            defaultValue={followupTpl}
            className="input resize-y"
          />
        </div>
        {state?.ok ? (
          <p className="rounded-xl bg-positive-soft px-3.5 py-2.5 text-sm font-medium text-positive">
            {state.message}
          </p>
        ) : null}
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Saving…" : "Save templates"}
        </button>
      </form>

      <div className="border-t border-line pt-4">
        <label className="label">
          Twilio inbound URL — paste into your Twilio number’s “A message comes in”
          webhook (handles STOP opt-outs)
        </label>
        <code className="block overflow-x-auto whitespace-nowrap rounded-xl bg-surface-2 px-3 py-2.5 font-mono text-xs text-ink-2">
          {inboundUrl}
        </code>
      </div>
    </div>
  );
}
