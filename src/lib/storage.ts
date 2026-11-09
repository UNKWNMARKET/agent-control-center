import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * File storage for customer documents — dec pages, applications, ID cards.
 *
 * The bucket is private. Files are never served by a public URL; the app hands
 * a signed-in agent a link that expires in minutes, so a copied URL is useless
 * shortly after. Uploads go through the server with the service role, which is
 * why that key must never reach the browser.
 */

const BUCKET = "policy-docs";
const SIGNED_URL_SECONDS = 300;

export const storageConfigured = () =>
  Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

let client: SupabaseClient | null = null;
function storage(): SupabaseClient | null {
  if (!storageConfigured()) return null;
  client ??= createClient(
    process.env.SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  );
  return client;
}

/** Keeps a readable name while making the stored path unguessable and unique. */
export function storagePathFor(leadId: string, filename: string): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-80).replace(/^-+/, "");
  return `${leadId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe || "document"}`;
}

export async function uploadDocument(
  path: string,
  body: ArrayBuffer,
  contentType: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = storage();
  if (!s) return { ok: false, error: "File storage isn't configured yet." };

  const { error } = await s.storage.from(BUCKET).upload(path, body, {
    contentType: contentType || "application/octet-stream",
    upsert: false,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** A link that works for a few minutes, for the agent who asked for it. */
export async function signedUrlFor(path: string): Promise<string | null> {
  const s = storage();
  if (!s) return null;
  const { data, error } = await s.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
  return error ? null : (data?.signedUrl ?? null);
}

export async function removeDocument(path: string): Promise<boolean> {
  const s = storage();
  if (!s) return false;
  const { error } = await s.storage.from(BUCKET).remove([path]);
  return !error;
}

/** Guards against someone filing a 2GB video on a customer record. */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export const ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
];
