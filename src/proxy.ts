import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "lm_session";
// Paths that never require authentication.
const PUBLIC_PREFIXES = [
  "/login",
  "/accept-invite",
  "/forgot-password",
  "/reset-password",
  "/api/webhooks",
  "/api/cron",
  "/api/sms",
  // The sales pages. A prospect has no account yet, so these cannot be gated.
  "/tour",
  "/tour.html",
  "/welcome.html",
];

async function isValidSession(token: string | undefined): Promise<boolean> {
  if (!token || !process.env.SESSION_SECRET) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(process.env.SESSION_SECRET), {
      algorithms: ["HS256"],
    });
    return true;
  } catch {
    return false;
  }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  // The product tour, under a tidy URL rather than a file name.
  if (pathname === "/tour") {
    return NextResponse.rewrite(new URL("/tour.html", req.url));
  }

  const authed = await isValidSession(req.cookies.get(SESSION_COOKIE)?.value);

  // Signed-in users shouldn't see the login page.
  if (authed && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // The front door. Staff signing in go on to the app (page.tsx sends them to
  // the dashboard); everyone else is a visitor, and gets the sales page at the
  // bare domain instead of a login form for an account they do not have.
  if (!authed && pathname === "/") {
    return NextResponse.rewrite(new URL("/welcome.html", req.url));
  }

  // Everything that isn't public requires a session.
  if (!authed && !isPublic) {
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Run on all routes except Next internals and static asset files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)",
  ],
};
