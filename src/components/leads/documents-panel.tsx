"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, Upload, Trash2, FileText, Image as ImageIcon, Loader2 } from "lucide-react";
import { uploadLeadDocument, getDocumentUrl, deleteDocument } from "@/app/actions/documents";
import { DOC_KINDS, DOC_LABELS, isDocKind } from "@/lib/sold-docs";

export type DocumentRow = {
  id: string;
  filename: string;
  kind: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  uploadedAt: string;
  uploadedBy: string | null;
};

const size = (b: number | null) =>
  b == null ? "" : b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

/**
 * Documents on a customer: dec pages, applications, VIN checks, ID cards.
 *
 * Files are tagged with what they are, because the sale won't save until the
 * paperwork underwriting wants is on the record — and a tag is the only way
 * to know a file is the prior auto dec page rather than a photo of a car.
 *
 * They open through a link that expires in minutes rather than a public URL,
 * so a pasted link stops working almost immediately.
 */
export function DocumentsPanel({
  leadId,
  documents,
  configured,
}: {
  leadId: string;
  documents: DocumentRow[];
  configured: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [kind, setKind] = useState<string>("OTHER");

  const onPick = (file: File | undefined) => {
    if (!file) return;
    setMessage(null);
    const data = new FormData();
    data.set("file", file);
    data.set("kind", kind);
    start(async () => {
      const res = await uploadLeadDocument(leadId, data);
      if (!res.ok) setMessage(res.message ?? "That didn't upload.");
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    });
  };

  const open = (id: string) =>
    start(async () => {
      setOpening(id);
      const url = await getDocumentUrl(id);
      setOpening(null);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      else setMessage("Couldn't open that file.");
    });

  const remove = (id: string, name: string) =>
    start(async () => {
      if (!confirm(`Remove ${name}? This deletes the file.`)) return;
      const res = await deleteDocument(id);
      if (!res.ok) setMessage(res.message ?? "Couldn't remove that.");
      router.refresh();
    });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
          <Paperclip size={16} className="text-faint" />
          Documents
          {documents.length > 0 ? (
            <span className="font-normal text-faint">· {documents.length}</span>
          ) : null}
        </h2>

        {configured ? (
          <div className="ml-auto flex items-center gap-2">
            <label className="sr-only" htmlFor={`doc-kind-${leadId}`}>
              What is this file?
            </label>
            <select
              id={`doc-kind-${leadId}`}
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className="input w-auto py-1.5 text-xs"
            >
              {DOC_KINDS.map((k) => (
                <option key={k} value={k}>
                  {DOC_LABELS[k]}
                </option>
              ))}
            </select>
            <input
              ref={inputRef}
              type="file"
              id={`doc-${leadId}`}
              className="hidden"
              onChange={(e) => onPick(e.target.files?.[0])}
              accept=".pdf,.jpg,.jpeg,.png,.heic,.webp,.doc,.docx,.xls,.xlsx,.txt"
            />
            <label htmlFor={`doc-${leadId}`} className="btn btn-secondary cursor-pointer py-1.5">
              {pending ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {pending ? "Uploading…" : "Upload"}
            </label>
          </div>
        ) : null}
      </div>

      {!configured ? (
        <p className="text-sm text-muted">
          File storage isn&apos;t switched on yet. Once the Supabase keys are in Vercel,
          dec pages and applications can be filed here.
        </p>
      ) : documents.length === 0 ? (
        <p className="text-sm text-muted">
          Nothing filed yet — pick what the file is, then upload. VIN checks, dec pages,
          proof of home ownership, applications and ID cards all belong here.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {documents.map((d) => (
            <li key={d.id} className="flex items-center gap-2 text-sm">
              {d.contentType?.startsWith("image/") ? (
                <ImageIcon size={14} className="shrink-0 text-faint" />
              ) : (
                <FileText size={14} className="shrink-0 text-faint" />
              )}
              <button
                onClick={() => open(d.id)}
                disabled={pending}
                className="min-w-0 flex-1 truncate text-left text-ink-2 hover:text-accent hover:underline"
                title={d.filename}
              >
                {opening === d.id ? "Opening…" : d.filename}
              </button>
              {isDocKind(d.kind) && d.kind !== "OTHER" ? (
                <span className="chip shrink-0 bg-accent-soft text-xs text-accent">
                  {DOC_LABELS[d.kind]}
                </span>
              ) : null}
              <span className="shrink-0 text-xs text-faint">{size(d.sizeBytes)}</span>
              <span className="hidden shrink-0 text-xs text-faint sm:inline">
                {new Date(d.uploadedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                {d.uploadedBy ? ` · ${d.uploadedBy}` : ""}
              </span>
              <button
                onClick={() => remove(d.id, d.filename)}
                disabled={pending}
                aria-label={`Remove ${d.filename}`}
                className="shrink-0 rounded p-1 text-faint hover:bg-danger-soft hover:text-danger"
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {message ? <p className="mt-2 text-sm text-warning">{message}</p> : null}
    </div>
  );
}
