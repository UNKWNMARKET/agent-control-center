"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setEmailClient } from "@/app/actions/settings";
import { MAIL_CLIENTS, MAIL_CLIENT_HINTS, type MailClient } from "@/lib/mail";

export function EmailClientSelect({ value }: { value: MailClient }) {
  const router = useRouter();
  const [client, setClient] = useState<MailClient>(value);
  const [pending, start] = useTransition();

  const change = (next: MailClient) =>
    start(async () => {
      setClient(next);
      await setEmailClient(next);
      router.refresh();
    });

  return (
    <div>
      <select
        value={client}
        disabled={pending}
        onChange={(e) => change(e.target.value as MailClient)}
        className="input w-auto"
        aria-label="Mail client for email links"
      >
        {(Object.keys(MAIL_CLIENTS) as MailClient[]).map((k) => (
          <option key={k} value={k}>
            {MAIL_CLIENTS[k]}
          </option>
        ))}
      </select>
      <p className="mt-2 text-sm text-muted">{MAIL_CLIENT_HINTS[client]}</p>
    </div>
  );
}
