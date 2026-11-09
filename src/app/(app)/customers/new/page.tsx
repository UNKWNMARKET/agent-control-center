import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, User, MapPin, FileText } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/auth";
import { PRODUCTS } from "@/lib/leads";
import { CARRIERS } from "@/lib/sold-docs";
import { createCustomer } from "@/app/actions/customers";
import { VehiclesEditor } from "@/components/leads/vehicles-editor";
import { DriversEditor } from "@/components/leads/drivers-editor";

export const metadata: Metadata = { title: "Add customer · Agent Control Center" };

/** For customers sold elsewhere, or inherited with the book. */
export default async function NewCustomerPage() {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const users = isAdmin
    ? await db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } })
    : [];

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/customers" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
        <ArrowLeft size={16} /> All customers
      </Link>

      <div className="card p-6">
        <h1 className="text-xl font-semibold tracking-tight text-ink">Add a customer</h1>
        <p className="mt-1 text-sm text-muted">
          Someone already insured with you who never came through the lead pipeline.
          Recording their sale puts them in the shared customer book.
        </p>

        <form action={createCustomer} className="mt-6 space-y-6">
          <Section title="Customer" icon={<User size={15} />}>
            <F label="First name" name="firstName" required />
            <F label="Last name" name="lastName" required />
            <F label="Date of birth" name="dob" placeholder="MM/DD/YYYY" />
            <F label="Email" name="email" type="email" />
            <F label="Phone" name="phone" type="tel" />
            <F label="Second phone" name="phoneSecondary" type="tel" />
          </Section>

          <Section title="Address" icon={<MapPin size={15} />}>
            <F label="Address" name="address1" className="sm:col-span-2" />
            <F label="Apt / Unit" name="address2" />
            <F label="City" name="city" />
            <F label="State" name="state" defaultValue="FL" />
            <F label="ZIP" name="zip" />
          </Section>

          <div className="border-t border-line pt-5">
            <VehiclesEditor initial={[]} />
          </div>

          <div className="border-t border-line pt-5">
            <DriversEditor initial={[]} />
          </div>

          <Section title="Policy" icon={<FileText size={15} />}>
            <div>
              <label className="label">Product</label>
              <select name="product" className="input">
                <option value="">—</option>
                {PRODUCTS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Carrier</label>
              <select name="carrier" className="input" defaultValue="">
                <option value="">—</option>
                {CARRIERS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            {isAdmin ? (
              <div>
                <label className="label">Assigned to</label>
                <select name="assignedToId" className="input" defaultValue={user.id}>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="sm:col-span-2">
              <label className="label">Notes</label>
              <textarea name="notes" rows={3} className="input resize-y" placeholder="Anything worth knowing about this household…" />
            </div>
          </Section>

          <p className="rounded-xl bg-accent-soft p-3 text-sm text-accent">
            Saving opens Record the sale on their new record, which collects the
            policy number and any paperwork the carrier needs. They join the
            shared customer book once that sale is recorded — until then the
            record is yours alone.
          </p>

          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Link href="/customers" className="btn btn-secondary">Cancel</Link>
            <button type="submit" className="btn btn-primary">Add customer</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-faint">
        {icon}
        {title}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function F({
  label, name, type = "text", className, placeholder, required, defaultValue,
}: {
  label: string; name: string; type?: string; className?: string;
  placeholder?: string; required?: boolean; defaultValue?: string;
}) {
  return (
    <div className={className}>
      <label className="label" htmlFor={`nc-${name}`}>
        {label}{required ? " *" : ""}
      </label>
      <input
        id={`nc-${name}`}
        type={type}
        name={name}
        placeholder={placeholder}
        required={required}
        defaultValue={defaultValue}
        className="input"
      />
    </div>
  );
}
