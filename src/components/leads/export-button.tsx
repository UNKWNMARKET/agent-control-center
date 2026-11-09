"use client";

import { useSearchParams } from "next/navigation";
import { Download } from "lucide-react";

export function ExportButton() {
  const params = useSearchParams();
  const qs = params.toString();
  const href = `/api/leads/export${qs ? `?${qs}` : ""}`;
  return (
    <a href={href} className="btn btn-secondary" download>
      <Download size={16} /> Export
    </a>
  );
}
