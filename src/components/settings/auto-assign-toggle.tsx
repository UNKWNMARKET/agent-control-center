"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setAutoAssign } from "@/app/actions/settings";
import { cn } from "@/lib/utils";

export function AutoAssignToggle({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [pending, start] = useTransition();

  const toggle = () =>
    start(async () => {
      const next = !on;
      setOn(next);
      await setAutoAssign(next);
      router.refresh();
    });

  return (
    <button
      onClick={toggle}
      disabled={pending}
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
