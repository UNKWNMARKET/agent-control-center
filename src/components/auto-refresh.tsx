"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Re-runs the page's server queries on a timer so live numbers (like RingCentral
// call counts) stay current without a manual reload. Skips while the tab is hidden.
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => window.clearInterval(id);
  }, [router, seconds]);

  return null;
}
