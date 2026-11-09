"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { setSetting } from "@/lib/settings";
import { asMailClient, type MailClient } from "@/lib/mail";
import { asPhoneApp, type PhoneApp } from "@/lib/phone";
import type { ActionState } from "./users";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") throw new Error("Admins only");
  return user;
}

export async function setAutoAssign(on: boolean): Promise<void> {
  await requireAdmin();
  await setSetting("auto_assign", on ? "on" : "off");
  revalidatePath("/settings");
}

export async function setEmailClient(client: MailClient): Promise<void> {
  await requireAdmin();
  await setSetting("email_client", asMailClient(client));
  revalidatePath("/settings");
  revalidatePath("/leads");
}

export async function setPhoneApp(app: PhoneApp): Promise<void> {
  await requireAdmin();
  await setSetting("phone_app", asPhoneApp(app));
  revalidatePath("/settings");
  revalidatePath("/leads");
}

export async function setSmsAutomation(on: boolean): Promise<void> {
  await requireAdmin();
  await setSetting("sms_automation", on ? "on" : "off");
  revalidatePath("/settings");
}

export async function saveSmsSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const agency = String(formData.get("agency_name") ?? "").trim();
  const initial = String(formData.get("sms_template_initial") ?? "").trim();
  const followup = String(formData.get("sms_template_followup") ?? "").trim();
  await setSetting("agency_name", agency);
  await setSetting("sms_template_initial", initial);
  await setSetting("sms_template_followup", followup);
  revalidatePath("/settings");
  return { ok: true, message: "SMS settings saved." };
}
