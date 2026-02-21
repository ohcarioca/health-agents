import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Routes accessible without authentication
const PUBLIC_ROUTES = ["/", "/login", "/signup", "/auth/callback"];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) =>
    route === "/" ? pathname === "/" : pathname.startsWith(route)
  );
}

// Routes that authenticated users are redirected away from
const AUTH_ROUTES = ["/", "/login", "/signup", "/auth/callback"];

function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.some((route) =>
    route === "/" ? pathname === "/" : pathname.startsWith(route)
  );
}

async function getSubscriptionStatus(
  supabase: ReturnType<typeof createServerClient>,
  userId: string
): Promise<string | null> {
  const { data: clinicUser } = await supabase
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", userId)
    .limit(1)
    .single();

  if (!clinicUser) return null;

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("status")
    .eq("clinic_id", clinicUser.clinic_id)
    .single();

  return sub?.status ?? null;
}

export async function proxy(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !publishableKey) {
    throw new Error(
      "missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
    );
  }

  const response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Unauthenticated user trying to access protected route → redirect to login
  // API routes handle their own auth — skip redirect for them
  if (!user && !isPublicRoute(pathname) && !pathname.startsWith("/api/")) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated user on login/signup → redirect to dashboard
  if (user && isAuthRoute(pathname)) {
    const dashboardUrl = new URL("/dashboard", request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  // Subscription gating: block API mutations when expired/cancelled
  if (user && pathname.startsWith("/api/") && request.method !== "GET") {
    // Exempt routes that must work regardless of subscription
    const exemptPrefixes = ["/api/auth", "/api/subscriptions", "/api/plans", "/api/webhooks", "/api/cron"];
    const isExempt = exemptPrefixes.some((prefix) => pathname.startsWith(prefix));

    if (!isExempt) {
      const subStatus = await getSubscriptionStatus(supabase, user.id);
      if (subStatus === "expired" || subStatus === "cancelled") {
        return NextResponse.json(
          { error: "subscription_required" },
          { status: 403 }
        );
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!c/|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
