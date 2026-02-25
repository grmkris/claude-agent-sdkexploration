import { after } from "next/server";

import { ensureBotReady } from "@/lib/chat/bot";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { platform } = await params;
  const bot = await ensureBotReady();

  const handler = bot.webhooks[platform as keyof typeof bot.webhooks];
  if (!handler) {
    return new Response(`Unknown platform: ${platform}`, { status: 404 });
  }

  return handler(request, {
    waitUntil: (task: Promise<unknown>) => after(() => task),
  });
}
