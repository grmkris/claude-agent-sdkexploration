import { RPCHandler } from "@orpc/server/fetch";

import { router } from "@/lib/procedures";

const handler = new RPCHandler(router);

async function handleRequest(request: Request) {
  try {
    const { response } = await handler.handle(request, { prefix: "/rpc" });
    return response ?? new Response("Not found", { status: 404 });
  } catch (e) {
    // Safety net — handler.handle() should never throw (it catches internally),
    // but if something truly unexpected happens, log it and return a 500.
    console.error("[rpc] Unhandled error in RPCHandler:", e);
    return new Response(JSON.stringify({ message: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export const GET = handleRequest;
export const POST = handleRequest;
