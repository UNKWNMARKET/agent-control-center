"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { sendManualSms } from "@/app/actions/leads";

export function SendText({ leadId, allowed }: { leadId: string; allowed: boolean }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [msg, setMsg] = useState<{ ok?: boolean; error?: string } | null>(null);
  const [pending, start] = useTransition();

  if (!allowed) return null;

  const send = () =>
    start(async () => {
      const res = await sendManualSms(leadId, body);
      setMsg(res);
      if (res.ok) {
        setBody("");
        router.refresh();
      }
    });

  return (
    <div className="mb-5 rounded-2xl border border-line bg-surface-2 p-3">
      <textarea
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          setMsg(null);
        }}
        rows={2}
        placeholder="Send a text to this lead…"
        className="input resize-y text-sm"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs">
          {msg?.error ? (
            <span className="text-danger">{msg.error}</span>
          ) : msg?.ok ? (
            <span className="text-positive">Sent ✓</span>
          ) : (
            <span className="text-faint">{Math.max(0, 160 - body.length)} left</span>
          )}
        </span>
        <button
          onClick={send}
          disabled={pending || !body.trim()}
          className="btn btn-primary py-1.5"
        >
          <Send size={14} /> {pending ? "Sending…" : "Send text"}
        </button>
      </div>
    </div>
  );
}
