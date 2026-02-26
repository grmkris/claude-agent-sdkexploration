export function GET() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return Response.json(
      { error: "Push notifications not configured (VAPID_PUBLIC_KEY missing)" },
      { status: 503 }
    );
  }
  return Response.json({ publicKey });
}
