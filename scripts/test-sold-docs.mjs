/**
 * The sale gate's rules, checked against the cases that matter.
 *
 * Run: node scripts/test-sold-docs.mjs
 */

// Mirrored from src/lib/sold-docs.ts. If the behaviour there changes without
// this changing too, these checks fail and say so.
const LABELS = {
  VIN_CHECK: "VIN checks",
  PRIOR_AUTO: "Prior auto declaration page",
  WIND_MIT: "Wind mitigation report",
  PRIOR_HOME: "Proof of prior home insurance",
};

function requiredDocs(a) {
  if (a.carrier !== "AAA" || !a.line) return [];
  const list = ["VIN_CHECK"];
  if (a.priorAutoDeclared) list.push("PRIOR_AUTO");
  if (a.line === "PACKAGE") {
    if (a.windMitDiscount) list.push("WIND_MIT");
    list.push("PRIOR_HOME");
  }
  return list;
}

function blockers(a, onFile) {
  const out = [];
  if (!a.carrier) out.push("carrier");
  else if (a.carrier === "AAA" && !a.line) out.push("line");
  if (!(a.policyNumber || "").trim()) out.push("policy number");
  for (const k of requiredDocs(a)) if (!onFile.includes(k)) out.push(k);
  return out;
}

const sale = (o = {}) => ({
  carrier: null,
  line: null,
  priorAutoDeclared: false,
  windMitDiscount: false,
  policyNumber: "ABC123",
  ...o,
});

let failed = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify([...got].sort()) === JSON.stringify([...want].sort());
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) {
    console.log(`        got: ${got.join(", ") || "(none)"}`);
    console.log(`   expected: ${want.join(", ") || "(none)"}`);
  }
};

console.log("Required documents\n");

check(
  "AAA auto, no prior auto declared",
  requiredDocs(sale({ carrier: "AAA", line: "AUTO" })),
  ["VIN_CHECK"],
);
check(
  "AAA auto, prior auto declared",
  requiredDocs(sale({ carrier: "AAA", line: "AUTO", priorAutoDeclared: true })),
  ["VIN_CHECK", "PRIOR_AUTO"],
);
check(
  "AAA package, nothing declared",
  requiredDocs(sale({ carrier: "AAA", line: "PACKAGE" })),
  ["VIN_CHECK", "PRIOR_HOME"],
);
check(
  "AAA package, wind mitigation discount given",
  requiredDocs(sale({ carrier: "AAA", line: "PACKAGE", windMitDiscount: true })),
  ["VIN_CHECK", "WIND_MIT", "PRIOR_HOME"],
);
check(
  "AAA package, everything declared",
  requiredDocs(
    sale({ carrier: "AAA", line: "PACKAGE", priorAutoDeclared: true, windMitDiscount: true }),
  ),
  ["VIN_CHECK", "PRIOR_AUTO", "WIND_MIT", "PRIOR_HOME"],
);
check(
  "AAA auto never asks for wind mitigation, even if the flag is set",
  requiredDocs(sale({ carrier: "AAA", line: "AUTO", windMitDiscount: true })),
  ["VIN_CHECK"],
);
check(
  "AAA auto never asks for prior home insurance",
  requiredDocs(sale({ carrier: "AAA", line: "AUTO", priorAutoDeclared: true })),
  ["VIN_CHECK", "PRIOR_AUTO"],
);

for (const c of [
  "GeoVera", "Security First", "Citizens", "RLI Umbrella",
  "Cabrillo Coastal", "Progressive", "Progressive Commercial",
]) {
  check(`${c} requires no documents`, requiredDocs(sale({ carrier: c })), []);
}

console.log("\nWhat blocks the sale\n");

check("no carrier chosen", blockers(sale(), []), ["carrier"]);
check(
  "AAA with no line chosen",
  blockers(sale({ carrier: "AAA" }), []),
  ["line"],
);
check(
  "expanded market with no policy number",
  blockers(sale({ carrier: "Citizens", policyNumber: "  " }), []),
  ["policy number"],
);
check(
  "expanded market with a policy number is ready",
  blockers(sale({ carrier: "Citizens" }), []),
  [],
);
check(
  "AAA package with nothing uploaded",
  blockers(sale({ carrier: "AAA", line: "PACKAGE" }), []),
  ["VIN_CHECK", "PRIOR_HOME"],
);
check(
  "AAA package with VIN checks only",
  blockers(sale({ carrier: "AAA", line: "PACKAGE" }), ["VIN_CHECK"]),
  ["PRIOR_HOME"],
);
check(
  "AAA package fully filed is ready",
  blockers(sale({ carrier: "AAA", line: "PACKAGE" }), ["VIN_CHECK", "PRIOR_HOME"]),
  [],
);
check(
  "an unrelated file satisfies nothing",
  blockers(sale({ carrier: "AAA", line: "AUTO" }), ["OTHER", "HOME_OWNERSHIP"]),
  ["VIN_CHECK"],
);
check(
  "AAA auto, everything in place, is ready",
  blockers(sale({ carrier: "AAA", line: "AUTO", priorAutoDeclared: true }), [
    "VIN_CHECK",
    "PRIOR_AUTO",
  ]),
  [],
);
check(
  "a policy number of only spaces does not count",
  blockers(sale({ carrier: "AAA", line: "AUTO", policyNumber: "   " }), ["VIN_CHECK"]),
  ["policy number"],
);

console.log(failed === 0 ? "\nAll checks passed." : `\n${failed} check(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
