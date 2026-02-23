import { NextRequest, NextResponse } from "next/server"

function hmacSign(message: string, key: string): string {
  const encoder = new TextEncoder()
  // Use Web Crypto for edge runtime compatibility
  // But middleware in Next.js with Bun can use Bun APIs
  const hasher = new Bun.CryptoHasher("sha256", key)
  hasher.update(message)
  return hasher.digest("hex")
}

const PUBLIC_PATHS = ["/login", "/api/auth", "/api/webhooks"]
const COOKIE_NAME = "auth_session"

export function middleware(req: NextRequest) {
  const password = process.env.AUTH_PASSWORD
  // No password set → skip auth entirely
  if (!password) return NextResponse.next()

  const { pathname } = req.nextUrl

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Allow static assets and Next.js internals
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return NextResponse.next()
  }

  // Check auth cookie
  const cookie = req.cookies.get(COOKIE_NAME)?.value
  const expected = hmacSign("authenticated", password)

  if (cookie === expected) {
    return NextResponse.next()
  }

  // Redirect to login
  const loginUrl = new URL("/login", req.url)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
