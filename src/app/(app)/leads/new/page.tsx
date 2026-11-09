import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/auth";
import { PRODUCTS } from "@/lib/leads";
import { createLead } from "@/app/actions/leads";
import { VehiclesEditor } from "@/components/leads/vehicles-editor";

export const metadata: Metadata = { title: "Add lead · Agent Control Center" };

export default async function NewLeadPage() {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const users = isAdmin
    ? await db.user.findMany({
        where: { active: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : [];

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/leads"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
      >
        <ArrowLeft size={16} /> All leads
      </Link>

      <div className="card p-6">
        <h1 className="mb-6 text-xl font-semibold tracking-tight text-ink">
          Add a lead
        </h1>

        <form action={createLead} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <F label="First name" name="firstName" />
          <F label="Last name" name="lastName" />
          <F label="Phone" name="phone" />
          <F label="Email" name="email" type="email" />
          <F label="Address" name="address1" className="sm:col-span-2" />
          <F label="City" name="city" />
          <F label="State" name="state" />
          <F label="ZIP" name="zip" />
          <div>
            <label className="label">Product</label>
            <select name="product" className="input">
              <option value="">—</option>
              {PRODUCTS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div className="border-t border-line pt-4 sm:col-span-2">
            <VehiclesEditor initial={[]} />
          </div>

          {isAdmin ? (
            <div className="sm:col-span-2">
              <label className="label">Assign to</label>
              <select name="assignedToId" className="input">
                <option value="">Unassigned</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="mt-2 flex justify-end gap-2 sm:col-span-2">
            <Link href="/leads" className="btn btn-secondary">
              Cancel
            </Link>
            <button type="submit" className="btn btn-primary">
              Create lead
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function F({
  label,
  name,
  type = "text",
  className,
}: {
  label: string;
  name: string;
  type?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      <input type={type} name={name} className="input" />
    </div>
  );
}
