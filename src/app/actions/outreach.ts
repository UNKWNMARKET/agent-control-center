"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/auth";
import { getCurrentUser } from "@/lib/auth";

type Channel = "CALL" | "SMS";

/**
 * Records that an agent reached out, fired when they click call or text.
 *
 * Logging was a separate chore and agents did it inconsistently — 106 calls
 * logged by one agent against 1 by another over the same fortnight. Clicking
 * the number is the action; the record should follow from it, not from
 * remembering to write it down afterwards.
 */
export async function logOutreach(leadId: string, channel: Channel): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const lead = await db.lead.findUnique({ where: { id: leadId } });
  if (!lead) return;
  if (user.role !== "ADMIN" && lead.assignedToId !== user.id) return;

  const verb = channel === "CALL" ? "Called" : "Texted";
  const now = new Date();

  // Reaching out moves a new lead to contacted, which is also what schedules
  // the next touch. Anything further along keeps the status it has.
  const advancing = lead.status === "NEW";
  let followUpAt = lead.followUpAt;
  if (advancing && !followUpAt) {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + 2);
    followUpAt = d;
  }

  await db.lead.update({
    where: { id: leadId },
    data: {
      contactedAt: lead.contactedAt ?? now,
      ...(advancing ? { status: "CONTACTED" as const, followUpAt } : {}),
      activities: {
        create: {
          type: channel,
          body: `${verb} from Agent Control Center by ${user.name}`,
          userId: user.id,
        },
      },
    },
  });

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  revalidatePath("/dashboard");
}
