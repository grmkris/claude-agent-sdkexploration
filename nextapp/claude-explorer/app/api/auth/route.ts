import { NextRequest, NextResponse } from "next/server"

function hmacSign(message: string, key: string): string {
  const hasher = new Bun.CryptoHasher("sha256", key)
  hasher.update(message)
  return hasher.digest("hex")
}

const COOKIE_NAME = "auth_session"
const MAX_AGE = 30 * 24 * 60 * 60 // 30 days

export async function POST(req: NextRequest) {
  const password = process.env.AUTH_PASSWORD
  if (!password) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 500 })
  }

  const body = await req.json().catch(() => null)
  if (!body?.password || body.password !== password) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 })
  }

  const token = hmacSign("authenticated", password)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE,
    path: "/",
  })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  })
  return res
}
