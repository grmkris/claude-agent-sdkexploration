import type { SessionStateEvent } from "@/lib/event-bus";

import { getSessionEventBus } from "@/lib/event-bus";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const bus = getSessionEventBus();

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const onEvent = (event: SessionStateEvent) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          );
        } catch {
          // Stream closed
        }
      };

      bus.on("session:state", onEvent);

      // Keepalive every 30s
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          clearInterval(keepalive);
        }
      }, 30_000);

      // Cleanup on abort
      request.signal.addEventListener("abort", () => {
        bus.off("session:state", onEvent);
        clearInterval(keepalive);
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
