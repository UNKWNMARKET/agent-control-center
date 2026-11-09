"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Search, X } from "lucide-react";

/** Find a caller fast: phone, email, name or policy number. */
export function CustomerSearch({ initial }: { initial: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState(initial);

  useEffect(() => {
    if (q === initial) return;
    const t = setTimeout(() => {
      router.replace(q ? `${pathname}?q=${encodeURIComponent(q)}` : pathname);
    }, 300);
    return () => clearTimeout(t);
  }, [q, initial, pathname, router]);

  return (
    <div className="relative mb-4 max-w-md">
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by phone, email, name or policy number"
        className="input pl-9 pr-9"
        autoFocus
        aria-label="Search customers"
      />
      {q ? (
        <button
          onClick={() => setQ("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-ink"
          aria-label="Clear search"
        >
          <X size={15} />
        </button>
      ) : null}
    </div>
  );
}
