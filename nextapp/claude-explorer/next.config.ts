import type { NextConfig } from "next";

import path from "path";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@anthropic-ai/claude-agent-sdk"],
  turbopack: {
    // Pin the workspace root to this project directory so Turbopack doesn't
    // walk up to a parent bun.lock and mis-time manifest writes.
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
