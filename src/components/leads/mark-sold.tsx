"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck, X, Upload, Check, Loader2, AlertTriangle, Info,
} from "lucide-react";
import { markSold } from "@/app/actions/leads";
import { uploadLeadDocument } from "@/app/actions/documents";
import {
  CARRIERS, AAA_LINES, AAA_LINE_LABELS, EXPANDED_MARKET_REMINDER,
  requiredDocs, blockers, type AaaLine, type SoldAnswers,
} from "@/lib/sold-docs";
import { OPEN_SALE_EVENT } from "@/lib/open-sale";

/**
 * Recording the win, one question at a time.
 *
 * The order matters: what was sold decides what's asked, and each answer puts
 * its upload on screen straight away rather than saving them all for the end.
 * Nothing saves until the paperwork is filed and a policy number is in, which
 * is what makes the customer findable later.
 */
export function MarkSold({
  leadId,
  isSold,
  storageReady,
  kindsOnFile = [],
  openOnLoad = false,
  defaults = {},
}: {
  leadId: string;
  isSold: boolean;
  /** File storage has to be working, or the paperwork can't be filed. */
  storageReady: boolean;
  /** Required paperwork already filed against this customer. */
  kindsOnFile?: string[];
  /** Open straight away — used after adding a customer who's already sold. */
  openOnLoad?: boolean;
  defaults?: {
    premium?: string;
    carrier?: string;
    policyNumber?: string;
    effectiveDate?: string;
    product?: string;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(openOnLoad);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [onFile, setOnFile] = useState<string[]>(kindsOnFile);
  const [uploading, setUploading] = useState<string | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const [carrier, setCarrier] = useState<string | null>(
    CARRIERS.find((c) => c === defaults.carrier) ?? null,
  );
  const [line, setLine] = useState<AaaLine | null>(null);
  const [priorAuto, setPriorAuto] = useState<boolean | null>(null);
  const [windMit, setWindMit] = useState<boolean | null>(null);
  const [policyNumber, setPolicyNumber] = useState(defaults.policyNumber ?? "");

  const [premium, setPremium] = useState(defaults.premium ?? "");
  const [effectiveDate, setEffectiveDate] = useState(
    defaults.effectiveDate || new Date().toISOString().slice(0, 10),
  );
  const [termMonths, setTermMonths] = useState("12");

  // Choosing "Sold" from the status dropdown opens these questions too.
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_SALE_EVENT, show);
    return () => window.removeEventListener(OPEN_SALE_EVENT, show);
  }, []);

  if (isSold) {
    return (
      <span className="chip bg-positive-soft text-positive">
        <BadgeCheck size={14} /> Sold
      </span>
    );
  }

  const answers: SoldAnswers = {
    carrier,
    line,
    priorAutoDeclared: priorAuto === true,
    windMitDiscount: windMit === true,
    policyNumber,
  };

  const isAAA = carrier === "AAA";
  const expanded = carrier != null && !isAAA;
  const required = requiredDocs(answers);
  const outstanding = blockers(answers, onFile);
  const ready = storageReady && outstanding.length === 0;

  // Each question only appears once the one before it is answered.
  const showLine = isAAA;
  const showAutoDocs = isAAA && line != null;
  const showPriorAutoQ = showAutoDocs && onFile.includes("VIN_CHECK");
  const showWindMitQ = isAAA && line === "PACKAGE" && priorAuto != null;
  const showPolicyNumber = carrier != null && (!isAAA || line != null);

  const upload = (kind: string, file: File | undefined) => {
    if (!file) return;
    setError(null);
    const data = new FormData();
    data.set("file", file);
    data.set("kind", kind);
    start(async () => {
      setUploading(kind);
      const res = await uploadLeadDocument(leadId, data);
      setUploading(null);
      const input = inputs.current[kind];
      if (input) input.value = "";
      if (!res.ok) {
        setError(res.message ?? "That didn't upload.");
        return;
      }
      if (res.kinds) setOnFile(res.kinds);
      router.refresh();
    });
  };

  const save = () =>
    start(async () => {
      setError(null);
      const res = await markSold(leadId, {
        premium,
        effectiveDate,
        termMonths,
        carrier: carrier ?? "",
        policyNumber,
        line,
        priorAutoDeclared: priorAuto === true,
        windMitDiscount: windMit === true,
      });
      if (!res.ok) {
        setError(res.message ?? "That didn't save.");
        return;
      }
      setOpen(false);
      router.refresh();
    });

  const docRow = (kind: string, label: string, why: string) => {
    const have = onFile.includes(kind);
    return (
      <div key={kind} className="flex items-start gap-2.5 rounded-xl bg-surface-2 p-3">
        <span
          className={
            have
              ? "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-positive-soft text-positive"
              : "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line-strong text-faint"
          }
        >
          {have ? <Check size={13} /> : null}
        </span>
        <div className="min-w-0 flex-1">
          <p className={have ? "text-sm text-ink-2" : "text-sm font-medium text-ink"}>{label}</p>
          <p className="text-xs text-faint">{have ? "On file" : why}</p>
        </div>
        {have ? null : (
          <>
            <input
              ref={(el) => {
                inputs.current[kind] = el;
              }}
              type="file"
              id={`ms-doc-${kind}`}
              className="hidden"
              onChange={(e) => upload(kind, e.target.files?.[0])}
              accept=".pdf,.jpg,.jpeg,.png,.heic,.webp,.doc,.docx,.xls,.xlsx,.txt"
            />
            <label
              htmlFor={`ms-doc-${kind}`}
              className="btn btn-primary shrink-0 cursor-pointer py-1 text-xs"
            >
              {uploading === kind ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Upload size={13} />
              )}
              {uploading === kind ? "Uploading…" : "Upload"}
            </label>
          </>
        )}
      </div>
    );
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn btn-primary">
        <BadgeCheck size={15} /> Mark sold
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="card my-auto w-full max-w-md p-5"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Record the sale"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-ink">Record the sale</h2>
              <button onClick={() => setOpen(false)} className="text-faint hover:text-ink" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5">
              {/* 1 — what was sold */}
              <Step n={1} title="What did you sell?">
                <div className="grid grid-cols-2 gap-1.5">
                  {CARRIERS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        setCarrier(c);
                        setLine(null);
                        setPriorAuto(null);
                        setWindMit(null);
                      }}
                      className={
                        carrier === c
                          ? "btn btn-primary justify-center py-1.5 text-xs"
                          : "btn btn-secondary justify-center py-1.5 text-xs"
                      }
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </Step>

              {/* 2 — AAA: auto or package */}
              {showLine ? (
                <Step n={2} title="AAA — what did you sell?">
                  <div className="flex gap-2">
                    {AAA_LINES.map((l) => (
                      <button
                        key={l}
                        type="button"
                        onClick={() => {
                          setLine(l);
                          setWindMit(null);
                        }}
                        className={
                          line === l
                            ? "btn btn-primary flex-1 justify-center py-1.5 text-sm"
                            : "btn btn-secondary flex-1 justify-center py-1.5 text-sm"
                        }
                      >
                        {AAA_LINE_LABELS[l]}
                      </button>
                    ))}
                  </div>
                </Step>
              ) : null}

              {/* VIN checks, straight away */}
              {showAutoDocs ? (
                <div className="space-y-2">
                  {docRow("VIN_CHECK", "VIN checks", "Upload these before anything else.")}
                </div>
              ) : null}

              {/* Prior auto */}
              {showPriorAutoQ ? (
                <div className="space-y-2">
                  <YesNo
                    label="Did you declare prior auto insurance?"
                    value={priorAuto}
                    onChange={setPriorAuto}
                  />
                  {priorAuto === true
                    ? docRow(
                        "PRIOR_AUTO",
                        "Prior auto declaration page",
                        "Needed because prior auto was declared.",
                      )
                    : null}
                </div>
              ) : null}

              {/* Wind mitigation, package only */}
              {showWindMitQ ? (
                <div className="space-y-2">
                  <YesNo
                    label="Did you give a wind mitigation discount?"
                    value={windMit}
                    onChange={setWindMit}
                  />
                  {windMit === true
                    ? docRow(
                        "WIND_MIT",
                        "Wind mitigation report",
                        "Needed because the discount was given.",
                      )
                    : null}
                </div>
              ) : null}

              {/* Prior home insurance, package only */}
              {isAAA && line === "PACKAGE" && windMit !== null ? (
                <div className="space-y-2">
                  {docRow(
                    "PRIOR_HOME",
                    "Proof of prior home insurance",
                    "Required on every package policy.",
                  )}
                </div>
              ) : null}

              {/* Expanded markets — a nudge, not a gate */}
              {expanded ? (
                <div className="space-y-2">
                  <p className="flex gap-2 rounded-xl bg-accent-soft p-3 text-sm text-accent">
                    <Info size={16} className="mt-0.5 shrink-0" />
                    {EXPANDED_MARKET_REMINDER}
                  </p>
                  {docRow("OTHER", "Documents", "Optional, but file them while you have them.")}
                </div>
              ) : null}

              {/* Policy number — always */}
              {showPolicyNumber ? (
                <Step n={isAAA ? 3 : 2} title="Policy number">
                  <input
                    value={policyNumber}
                    onChange={(e) => setPolicyNumber(e.target.value)}
                    placeholder="As it appears on the policy"
                    className="input"
                    autoFocus
                  />
                  <p className="mt-1.5 text-xs text-faint">
                    Needed on every sale — it&apos;s how this customer gets found later.
                  </p>
                </Step>
              ) : null}

              {/* The rest of the sale */}
              {showPolicyNumber ? (
                <div className="space-y-3 border-t border-line pt-4">
                  <div>
                    <label className="label" htmlFor="ms-premium">Annual premium</label>
                    <input
                      id="ms-premium"
                      value={premium}
                      onChange={(e) => setPremium(e.target.value)}
                      placeholder="1,450"
                      inputMode="decimal"
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="ms-eff">Effective date</label>
                    <input
                      id="ms-eff"
                      type="date"
                      value={effectiveDate}
                      onChange={(e) => setEffectiveDate(e.target.value)}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label">Policy term</label>
                    <div className="flex gap-2">
                      {[
                        { v: "6", label: "6 months" },
                        { v: "12", label: "12 months" },
                      ].map((t) => (
                        <button
                          key={t.v}
                          type="button"
                          onClick={() => setTermMonths(t.v)}
                          className={
                            termMonths === t.v
                              ? "btn btn-primary flex-1 justify-center"
                              : "btn btn-secondary flex-1 justify-center"
                          }
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1.5 text-xs text-faint">
                      Sets the expiration date, which is what puts it on the renewal list.
                    </p>
                  </div>
                </div>
              ) : null}
            </div>

            {!storageReady ? (
              <p className="mt-4 flex gap-2 rounded-xl bg-warning-soft p-3 text-sm text-warning">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                File storage isn&apos;t working, so paperwork can&apos;t be filed and the
                sale can&apos;t be recorded. An admin needs to fix the storage keys.
              </p>
            ) : null}

            {error ? (
              <p className="mt-4 flex gap-2 rounded-xl bg-danger-soft p-3 text-sm text-danger">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                {error}
              </p>
            ) : null}

            {/* What's left, so the greyed-out button is never a mystery */}
            {storageReady && outstanding.length > 0 && carrier ? (
              <ul className="mt-4 space-y-1 rounded-xl bg-surface-2 p-3">
                {outstanding.map((o) => (
                  <li key={o} className="flex gap-2 text-xs text-muted">
                    <span className="text-faint">•</span>
                    {o}
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="mt-4 flex items-center justify-between gap-2">
              <span className="text-xs text-faint">
                {required.length > 0
                  ? `${required.filter((r) => onFile.includes(r.kind)).length} of ${required.length} files on file`
                  : ""}
              </span>
              <div className="flex gap-2">
                <button onClick={() => setOpen(false)} disabled={pending} className="btn btn-secondary">
                  Cancel
                </button>
                <button
                  onClick={save}
                  disabled={pending || !ready}
                  className="btn btn-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pending ? "Saving…" : "Mark sold"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-ink">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-soft text-[11px] text-accent">
          {n}
        </span>
        {title}
      </p>
      {children}
    </div>
  );
}

function YesNo({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-[13px] font-medium text-ink">{label}</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange(true)}
          className={
            value === true
              ? "btn btn-primary flex-1 justify-center py-1.5 text-sm"
              : "btn btn-secondary flex-1 justify-center py-1.5 text-sm"
          }
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={
            value === false
              ? "btn btn-primary flex-1 justify-center py-1.5 text-sm"
              : "btn btn-secondary flex-1 justify-center py-1.5 text-sm"
          }
        >
          No
        </button>
      </div>
    </div>
  );
}
