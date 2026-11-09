/**
 * Stands up the platform's first agency and invites its owner.
 *
 * Run once, against an empty database:
 *   node scripts/bootstrap-owner.mjs "Agency Name" "Your Name" you@example.com
 *
 * It prints an invitation link. Follow it, choose a password, and that
 * account becomes the platform owner — the one that can see the Agencies
 * console. No password is set here and none is emailed, so the password is
 * never known to this script, to the database, or to anyone but you.
 */

import { PrismaClient } from "@prisma/client";
import { randomBytes, createHash } from "crypto";

const [, , agencyName, ownerName, ownerEmail] = process.argv;

if (!agencyName || !ownerName || !ownerEmail) {
  console.error('Usage: node scripts/bootstrap-owner.mjs "Agency Name" "Your Name" you@example.com');
  process.exit(1);
}

const db = new PrismaClient();

const slugify = (s) =>
  s.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) ||
  "agency";

try {
  const existing = await db.user.count();
  if (existing > 0) {
    console.error(
      `This platform already has ${existing} user(s). Bootstrapping is for an empty database — ` +
        "create further agencies from the owner console instead.",
    );
    process.exit(2);
  }

  let slug = slugify(agencyName);
  for (let i = 2; await db.agency.findUnique({ where: { slug } }); i++) {
    slug = `${slugify(agencyName)}-${i}`;
  }

  const agency = await db.agency.create({ data: { name: agencyName, slug } });

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 14);

  await db.invite.create({
    data: {
      agencyId: agency.id,
      email: ownerEmail.toLowerCase(),
      name: ownerName,
      role: "ADMIN",
      tokenHash,
      expiresAt,
    },
  });

  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

  console.log(`\nAgency created: ${agency.name}  (${agency.slug})`);
  console.log(`Owner invited:  ${ownerName} <${ownerEmail}>`);
  console.log(`\nOpen this to set your password:\n\n  ${base}/accept-invite/${token}\n`);
  console.log("The link works once and expires in 14 days. Don't share it.\n");
} finally {
  await db.$disconnect();
}
