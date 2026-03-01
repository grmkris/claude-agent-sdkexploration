import type { RouterClient } from "@orpc/server";

import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";

import type { router } from "./procedures";

const link = new RPCLink({
  url:
    typeof window !== "undefined"
      ? `${window.location.origin}/rpc`
      : `http://localhost:${process.env.PORT ?? 41920}/rpc`,
});

export const client: RouterClient<typeof router> = createORPCClient(link);
