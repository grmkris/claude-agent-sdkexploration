import {
  removeSubscription,
  saveSubscription,
} from "@/lib/push-subscriptions-db";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { endpoint, keys, userAgent } = body as {
      endpoint: string;
      keys: { p256dh: string; auth: string };
      userAgent?: string;
    };

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return Response.json({ error: "Invalid subscription" }, { status: 400 });
    }

    saveSubscription({ endpoint, keys });
    // userAgent stored for debugging but not in current DB schema — log only
    if (userAgent) {
      console.log("[push/subscribe] userAgent:", userAgent);
    }
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[push/subscribe] Error:", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { endpoint } = (await req.json()) as { endpoint: string };
    if (!endpoint) {
      return Response.json({ error: "endpoint required" }, { status: 400 });
    }
    removeSubscription(endpoint);
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[push/subscribe] DELETE error:", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
