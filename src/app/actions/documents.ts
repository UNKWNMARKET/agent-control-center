"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/auth";
import { getCurrentUser } from "@/lib/auth";
import {
  uploadDocument, removeDocument, signedUrlFor, storagePathFor,
  storageConfigured, MAX_UPLOAD_BYTES, ALLOWED_TYPES,
} from "@/lib/storage";
import { isDocKind, DOC_LABELS } from "@/lib/sold-docs";
import { canViewLead } from "@/lib/visibility";

export type UploadResult = {
  ok: boolean;
  message?: string;
  /** Which required-paperwork kinds are now on this customer's record. */
  kinds?: string[];
};

/** The tagged paperwork already filed against a customer. */
export async function leadDocumentKinds(leadId: string): Promise<string[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const rows = await db.policyDocument.findMany({
    where: { leadId, kind: { not: null } },
    select: { kind: true },
  });
  return rows.map((r) => r.kind as string);
}

/**
 * Files a document against a customer. Any agent may file one — whoever is
 * helping the customer is the one holding the paperwork.
 */
export async function uploadLeadDocument(
  leadId: string,
  formData: FormData,
): Promise<UploadResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Not signed in." };
  if (!storageConfigured()) {
    return { ok: false, message: "File storage isn't set up yet — add the Supabase keys in Vercel." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a file first." };
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, message: `That file is ${Math.round(file.size / 1024 / 1024)}MB. The limit is 20MB.` };
  }
  if (file.type && !ALLOWED_TYPES.includes(file.type)) {
    return { ok: false, message: "PDFs, photos, Word and Excel files only." };
  }

  const lead = await db.lead.findUnique({
    where: { id: leadId },
    select: { id: true, status: true, assignedToId: true },
  });
  if (!lead) return { ok: false, message: "That customer no longer exists." };
  // Any agent can file against a sold customer — whoever is helping them is
  // the one holding the paperwork. A prospect stays with the agent on it.
  if (!canViewLead(user, lead)) {
    return { ok: false, message: "That record belongs to another agent." };
  }

  const path = storagePathFor(leadId, file.name);
  const result = await uploadDocument(path, await file.arrayBuffer(), file.type || null);
  if (!result.ok) return { ok: false, message: result.error };

  const policyId = (formData.get("policyId") as string) || null;
  // Tagging what a file is lets the sale check whether underwriting's
  // paperwork is actually on the record, rather than trusting a filename.
  const rawKind = formData.get("kind");
  const kind = isDocKind(rawKind) ? rawKind : null;

  await db.policyDocument.create({
    data: {
      leadId,
      policyId: policyId || null,
      kind,
      filename: file.name,
      storagePath: path,
      contentType: file.type || null,
      sizeBytes: file.size,
      uploadedById: user.id,
    },
  });

  // Documents are part of the service record, so the timeline notes them.
  const tag = kind && kind !== "OTHER" ? `${DOC_LABELS[kind]} — ` : "";
  await db.activity.create({
    data: { leadId, type: "NOTE", body: `Uploaded document: ${tag}${file.name}`, userId: user.id },
  });

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/agency");
  return { ok: true, kinds: await leadDocumentKinds(leadId) };
}

/** A link good for a few minutes, so documents can't be shared by URL. */
export async function getDocumentUrl(documentId: string): Promise<string | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const doc = await db.policyDocument.findUnique({
    where: { id: documentId },
    include: { lead: { select: { status: true, assignedToId: true } } },
  });
  if (!doc) return null;
  // Being signed in isn't enough: the file has to be on a record this agent
  // is allowed to see.
  if (doc.lead && !canViewLead(user, doc.lead)) return null;
  return signedUrlFor(doc.storagePath);
}

export async function deleteDocument(documentId: string): Promise<UploadResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Not signed in." };

  const doc = await db.policyDocument.findUnique({ where: { id: documentId } });
  if (!doc) return { ok: false, message: "Already gone." };
  // Only the person who filed it, or an admin, can remove it.
  if (user.role !== "ADMIN" && doc.uploadedById !== user.id) {
    return { ok: false, message: "Only the agent who uploaded this, or an admin, can remove it." };
  }

  await removeDocument(doc.storagePath);
  await db.policyDocument.delete({ where: { id: documentId } });

  if (doc.leadId) {
    await db.activity.create({
      data: { leadId: doc.leadId, type: "NOTE", body: `Removed document: ${doc.filename}`, userId: user.id },
    });
    revalidatePath(`/leads/${doc.leadId}`);
  }
  return { ok: true };
}
