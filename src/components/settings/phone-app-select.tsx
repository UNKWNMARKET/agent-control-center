"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPhoneApp } from "@/app/actions/settings";
import { PHONE_APPS, PHONE_APP_HINTS, type PhoneApp } from "@/lib/phone";

export function PhoneAppSelect({ value }: { value: PhoneApp }) {
  const router = useRouter();
  const [app, setApp] = useState<PhoneApp>(value);
  const [pending, start] = useTransition();

  const change = (next: PhoneApp) =>
    start(async () => {
      setApp(next);
      await setPhoneApp(next);
      router.refresh();
    });

  return (
    <div>
      <select
        value={app}
        disabled={pending}
        onChange={(e) => change(e.target.value as PhoneApp)}
        className="input w-auto"
        aria-label="App for call and text links"
      >
        {(Object.keys(PHONE_APPS) as PhoneApp[]).map((k) => (
          <option key={k} value={k}>
            {PHONE_APPS[k]}
          </option>
        ))}
      </select>
      <p className="mt-2 text-sm text-muted">{PHONE_APP_HINTS[app]}</p>
    </div>
  );
}
