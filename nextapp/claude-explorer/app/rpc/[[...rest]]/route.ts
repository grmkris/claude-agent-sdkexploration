import { RPCHandler } from "@orpc/server/fetch";

import { router } from "@/lib/procedures";

const handler = new RPCHandler(router);

async function handleRequest(request: Request) {
  const { response } = await handler.handle(request, { prefix: "/rpc" });
  return response ?? new Response("Not found", { status: 404 });
}

export const GET = handleRequest;
export const POST = handleRequest;
