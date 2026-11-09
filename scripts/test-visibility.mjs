/**
 * Who can see whose records.
 *
 * Run: node scripts/test-visibility.mjs
 */

// Mirrored from src/lib/visibility.ts.
const isSharedCustomer = (status) => status === "SOLD";
function canViewLead(viewer, lead) {
  if (viewer.role === "ADMIN") return true;
  if (lead.assignedToId === viewer.id) return true;
  return isSharedCustomer(lead.status);
}

const ayat = { id: "ayat", role: "AGENT" };
const henry = { id: "henry", role: "AGENT" };
const jesse = { id: "jesse", role: "ADMIN" };

const lead = (status, assignedToId = "ayat") => ({ status, assignedToId });

let failed = 0;
const check = (name, got, want) => {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (got ${got}, expected ${want})`}`);
};

console.log("A prospect belongs to the agent on it\n");
for (const status of ["NEW", "CONTACTED", "QUOTED", "LOST", "DNC"]) {
  check(`Ayat sees her own ${status} record`, canViewLead(ayat, lead(status)), true);
  check(`Henry cannot see Ayat's ${status} record`, canViewLead(henry, lead(status)), false);
  check(`Jesse (admin) sees Ayat's ${status} record`, canViewLead(jesse, lead(status)), true);
}

console.log("\nSelling shares the household with the agency\n");
check("Ayat sees her own sold customer", canViewLead(ayat, lead("SOLD")), true);
check("Henry can look up Ayat's sold customer", canViewLead(henry, lead("SOLD")), true);
check("Jesse (admin) sees it too", canViewLead(jesse, lead("SOLD")), true);

console.log("\nEdge cases\n");
check(
  "an unassigned prospect is not visible to an agent",
  canViewLead(henry, lead("QUOTED", null)),
  false,
);
check(
  "an unassigned sold customer is visible to every agent",
  canViewLead(henry, lead("SOLD", null)),
  true,
);
check(
  "a customer added directly, before the sale is recorded, stays private",
  canViewLead(henry, lead("QUOTED")),
  false,
);
check(
  "a lost lead never becomes shared",
  canViewLead(henry, lead("LOST")),
  false,
);

// Serving a customer — notes, call logs and document uploads — uses the same
// rule, so an agent who takes the call can put it on the record.
console.log("\nServing a sold customer\n");
const canServe = canViewLead;
check(
  "Henry can note a call on Ayat's sold customer",
  canServe(henry, lead("SOLD")),
  true,
);
check(
  "Henry can file a document on Ayat's sold customer",
  canServe(henry, lead("SOLD")),
  true,
);
check(
  "Henry cannot note or file on Ayat's prospect",
  canServe(henry, lead("QUOTED")),
  false,
);
check(
  "Henry cannot open a document on Ayat's prospect",
  canServe(henry, lead("CONTACTED")),
  false,
);

console.log(failed === 0 ? "\nAll checks passed." : `\n${failed} check(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
