import type { LeadStatus, Role, Prisma } from "@prisma/client";

/**
 * Who can see whose records.
 *
 * Until a record is sold it belongs to the agent on it. Nobody else should
 * turn it up in a search or reach it by pasting the URL — an agent's working
 * pipeline is their own, and a half-worked prospect isn't the agency's to
 * hand round.
 *
 * Selling changes that. The household is now the agency's book: whoever picks
 * up the phone has to be able to find them by number, email, name or policy
 * number, whether or not they wrote the policy.
 *
 * Admins see everything, as they always have.
 */

export const isSharedCustomer = (status: LeadStatus) => status === "SOLD";

/** The filter for the shared customer book. */
export const CUSTOMER_WHERE: Prisma.LeadWhereInput = { status: "SOLD" };

export function canViewLead(
  viewer: { id: string; role: Role },
  lead: { assignedToId: string | null; status: LeadStatus },
): boolean {
  if (viewer.role === "ADMIN") return true;
  if (lead.assignedToId === viewer.id) return true;
  return isSharedCustomer(lead.status);
}
