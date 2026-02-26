import type { NotificationSettings } from "@/lib/types";

import {
  getNotificationSettings,
  updateNotificationSettings,
} from "@/lib/explorer-store";

export async function GET() {
  const settings = await getNotificationSettings();
  return Response.json(settings);
}

export async function PATCH(req: Request) {
  try {
    const patch = (await req.json()) as Partial<NotificationSettings>;
    const updated = await updateNotificationSettings(patch);
    return Response.json(updated);
  } catch (err) {
    console.error("[push/settings] PATCH error:", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
