import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { buildBackup, backupStamp } from "@/lib/backup";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Download the book on demand. `?file=policies.csv` returns one spreadsheet;
 * without it, a single combined file listing every table one after another,
 * so one click gets everything without needing a zip tool.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return new NextResponse("Admins only", { status: 403 });
  }

  // An admin downloads their own agency's book, never anybody else's.
  const files = await buildBackup(user.agencyId);
  const stamp = backupStamp();
  const wanted = req.nextUrl.searchParams.get("file");

  if (wanted) {
    const file = files.find((f) => f.filename === wanted);
    if (!file) return new NextResponse("No such file in the backup", { status: 404 });
    return new NextResponse(file.csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${stamp}-${file.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const combined = files
    .map((f) => `### ${f.filename}\r\n${f.csv}`)
    .join("\r\n\r\n\r\n");

  return new NextResponse(combined, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="lead-manager-backup-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
