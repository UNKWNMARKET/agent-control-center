"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, CalendarPlus, Tag, X } from "lucide-react";
import { setFollowUp, addLeadTag, removeLeadTag } from "@/app/actions/leads";

export function FollowUpTags({
  leadId,
  followUpAt,
  tags,
}: {
  leadId: string;
  followUpAt: string | null;
  tags: string[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [date, setDate] = useState(followUpAt ? followUpAt.slice(0, 10) : "");
  const [newTag, setNewTag] = useState("");

  const run = (fn: () => Promise<void>) =>
    start(async () => {
      await fn();
      router.refresh();
    });

  return (
    <div className="card space-y-4 p-4">
      <div>
        <label className="label flex items-center gap-1.5">
          <CalendarClock size={14} /> Follow-up date
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input w-auto"
          />
          <button
            onClick={() => run(() => setFollowUp(leadId, date))}
            disabled={pending}
            className="btn btn-secondary"
          >
            Save
          </button>
          {followUpAt ? (
            <>
              <a
                href={`/api/leads/${leadId}/followup.ics`}
                className="btn btn-secondary"
                title="Opens in Outlook and adds the appointment with a 30-minute reminder"
              >
                <CalendarPlus size={15} /> Add to Outlook
              </a>
              <button
                onClick={() => {
                  setDate("");
                  run(() => setFollowUp(leadId, ""));
                }}
                disabled={pending}
                className="btn btn-ghost"
              >
                Clear
              </button>
            </>
          ) : null}
        </div>
        {followUpAt ? (
          <p className="mt-1.5 text-xs text-faint">
            A calendar invite is emailed to whoever the lead is assigned to when the
            date is saved.
          </p>
        ) : null}
      </div>

      <div>
        <label className="label flex items-center gap-1.5">
          <Tag size={14} /> Tags
        </label>
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.map((t) => (
            <span key={t} className="chip bg-info-soft text-info">
              {t}
              <button
                onClick={() => run(() => removeLeadTag(leadId, t))}
                disabled={pending}
                className="ml-0.5 rounded-full hover:bg-info/10"
                aria-label={`Remove ${t}`}
              >
                <X size={12} />
              </button>
            </span>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const t = newTag.trim();
              if (!t) return;
              setNewTag("");
              run(() => addLeadTag(leadId, t));
            }}
          >
            <input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              placeholder="Add tag…"
              className="input w-28 py-1 text-sm"
            />
          </form>
        </div>
      </div>
    </div>
  );
}
