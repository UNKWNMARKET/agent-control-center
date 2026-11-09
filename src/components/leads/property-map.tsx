"use client";

import { useState } from "react";
import { Satellite, Map as MapIcon, Maximize2, Minimize2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Satellite view of the lead's address, for sizing up a roof or property
 * while quoting.
 *
 * Uses the Google Maps Embed API when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set.
 * Without a key it falls back to Google's keyless embed, which needs no setup
 * but is unsupported and may change without notice.
 */
export function PropertyMap({ address }: { address: string }) {
  const [satellite, setSatellite] = useState(true);
  const [big, setBig] = useState(false);

  if (!address) return null;

  const q = encodeURIComponent(address);
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const src = key
    ? `https://www.google.com/maps/embed/v1/place?key=${key}&q=${q}&maptype=${satellite ? "satellite" : "roadmap"}&zoom=19`
    : `https://maps.google.com/maps?q=${q}&t=${satellite ? "k" : "m"}&z=19&output=embed`;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-faint">
        <Satellite size={15} />
        Property view
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSatellite((s) => !s)}
            title={satellite ? "Switch to map" : "Switch to satellite"}
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            {satellite ? <MapIcon size={15} /> : <Satellite size={15} />}
          </button>
          <button
            type="button"
            onClick={() => setBig((b) => !b)}
            title={big ? "Shrink map" : "Enlarge map"}
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            {big ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${q}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in Google Maps"
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <ExternalLink size={15} />
          </a>
        </div>
      </div>

      <div
        className={cn(
          "overflow-hidden rounded-xl border border-line bg-surface-2 transition-all",
          big ? "aspect-[16/10] w-full" : "aspect-square w-full max-w-[240px]",
        )}
      >
        <iframe
          key={src}
          src={src}
          title={`Map of ${address}`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
          className="h-full w-full border-0"
        />
      </div>

      <p className="mt-1.5 text-xs text-faint">{address}</p>
    </div>
  );
}
