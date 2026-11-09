"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Phone, MessageSquare } from "lucide-react";
import { logContact } from "@/app/actions/leads";
import { cn } from "@/lib/utils";

const OUTCOMES: Record<"CALL" | "SMS", string[]> = {
  CALL: [
    "Connected",
    "Left voicemail",
    "No answer",
    "Busy",
    "Wrong number",
    "Not interested",
    "Callback requested",
    "Quoted",
    "Sold",
  ],
  SMS: ["Texted", "Replied", "No reply", "Opted out", "Not interested", "Callback requested"],
};

export function LogActivity({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [kind, setKind] = useState<"CALL" | "SMS">("CALL");
  const [outcome, setOutcome] = useState(OUTCOMES.CALL[0]);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  const pickKind = (k: "CALL" | "SMS") => {
    setKind(k);
    setOutcome(OUTCOMES[k][0]);
  };

  const submit = () =>
    start(async () => {
      await logContact(leadId, kind, outcome, note);
      setNote("");
      router.refresh();
    });

  return (
    <div className="mb-5 rounded-2xl border border-line bg-surface-2 p-3">
      <div className="mb-2 flex gap-1 rounded-xl bg-black/[0.04] p-1">
        {(["CALL", "SMS"] as const).map((k) => (
          <button
            key={k}
            onClick={() => pickKind(k)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-sm font-medium transition-colors",
              kind === k ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
            )}
          >
            {k === "CALL" ? <Phone size={14} /> : <MessageSquare size={14} />}
            {k === "CALL" ? "Call" : "Text"}
          </button>
        ))}
      </div>
      <select
        value={outcome}
        onChange={(e) => setOutcome(e.target.value)}
        className="input mb-2 py-2 text-sm"
      >
        {OUTCOMES[kind].map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Add a note (optional)"
        className="input mb-2 py-2 text-sm"
      />
      <button
        onClick={submit}
        disabled={pending}
        className="btn btn-primary w-full py-2"
      >
        {pending ? "Logging…" : `Log ${kind === "CALL" ? "call" : "text"}`}
      </button>
    </div>
  );
}
