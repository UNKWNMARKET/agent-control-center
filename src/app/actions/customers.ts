"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/auth";
import { getCurrentUser } from "@/lib/auth";
import { parseVehicles, cleanVehicles } from "@/lib/vehicles";
import { parseDrivers, cleanDrivers } from "@/lib/drivers";
import { scrubFields } from "@/lib/dnc";

async function authUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  return user;
}

function str(f: FormData, key: string): string | null {
  const v = f.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function jsonList(f: FormData, key: string, kind: "vehicles" | "drivers"): Prisma.InputJsonValue | undefined {
  const raw = f.get(key);
  if (typeof raw !== "string") return undefined;
  try {
    const parsed = JSON.parse(raw);
    const cleaned = kind === "vehicles" ? cleanVehicles(parseVehicles(parsed)) : cleanDrivers(parseDrivers(parsed));
    return cleaned as unknown as Prisma.InputJsonValue;
  } catch {
    return undefined;
  }
}

/**
 * Adds someone who is already a customer — sold elsewhere, or inherited with
 * the book — without pretending they came through the lead pipeline.
 *
 * They become searchable straight away, but the sale itself isn't recorded
 * here. The record opens with Record the sale already up, so adding a sold
 * customer goes through exactly the same questions and uploads as selling
 * one in the pipeline. Anything else would be a way round the paperwork.
 */
export async function createCustomer(formData: FormData): Promise<void> {
  const user = await authUser();
  const phone = str(formData, "phone");
  const dnc = await scrubFields(phone);

  const customer = await db.lead.create({
    data: {
      firstName: str(formData, "firstName"),
      lastName: str(formData, "lastName"),
      dob: str(formData, "dob"),
      email: str(formData, "email"),
      phone,
      phoneSecondary: str(formData, "phoneSecondary"),
      address1: str(formData, "address1"),
      address2: str(formData, "address2"),
      city: str(formData, "city"),
      state: str(formData, "state") ?? "FL",
      zip: str(formData, "zip"),
      product: str(formData, "product"),
      carrier: str(formData, "carrier"),
      currentCarrier: str(formData, "currentCarrier"),
      notes: str(formData, "notes"),
      vehicles: jsonList(formData, "vehicles", "vehicles"),
      drivers: jsonList(formData, "drivers", "drivers"),
      isCustomer: true,
      // Not SOLD yet — Record the sale does that, once the paperwork is in.
      status: "QUOTED",
      // Kept distinct from purchased leads so conversion reporting stays honest.
      source: "Added directly",
      contactedAt: new Date(),
      assignedToId: str(formData, "assignedToId") ?? user.id,
      ...dnc,
      activities: {
        create: {
          type: "CREATED",
          body: `Customer added directly by ${user.name} — sale not recorded yet`,
          userId: user.id,
        },
      },
    },
  });

  revalidatePath("/customers");
  revalidatePath("/leads");
  // `sell=1` opens Record the sale straight away, so the agent finishes the
  // job they came to do instead of having to find the button.
  redirect(`/leads/${customer.id}?from=%2Fcustomers&sell=1`);
}

/**
 * A permanent note on the record: stamped with who wrote it and when, and
 * never editable or removable. Service history has to be trustworthy.
 */
export async function addCustomerNote(leadId: string, body: string): Promise<void> {
  const user = await authUser();
  const text = body.trim();
  if (!text) return;

  // Deliberately no ownership check: any agent can note a customer they help.
  await db.activity.create({
    data: { leadId, type: "NOTE", body: text, userId: user.id },
  });

  revalidatePath(`/leads/${leadId}`);
}
