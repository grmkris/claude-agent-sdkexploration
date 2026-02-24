export type McpCategory =
  | "devops"
  | "pm"
  | "design"
  | "database"
  | "ai"
  | "docs"
  | "other";

export interface McpCatalogEntry {
  id: string;
  name: string;
  description: string;
  emoji: string;
  category: McpCategory;
  transport: "stdio" | "http" | "sse";
  command?: string;
  args?: string[];
  url?: string;
  envTemplate?: Record<string, string>;
  docsUrl?: string;
  authNote?: string;
}

export interface SkillCatalogEntry {
  id: string;
  name: string;
  description: string;
  emoji: string;
  category: string;
  installCommand: string;
  docsUrl?: string;
}

export const MCP_CATEGORIES: { value: McpCategory | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "devops", label: "DevOps" },
  { value: "pm", label: "PM" },
  { value: "design", label: "Design" },
  { value: "database", label: "Database" },
  { value: "ai", label: "AI" },
  { value: "docs", label: "Docs" },
  { value: "other", label: "Other" },
];

export const MCP_CATALOG: McpCatalogEntry[] = [
  {
    id: "railway",
    name: "Railway",
    description: "Deploy & manage Railway services",
    emoji: "🚂",
    category: "devops",
    transport: "stdio",
    command: "npx",
    args: [
      "@anthropic-ai/claude-code@latest",
      "mcp",
      "serve",
      "--name",
      "railway",
    ],
    docsUrl: "https://docs.railway.com/reference/cli-api",
    authNote: "Requires Railway CLI login",
  },
  {
    id: "linear",
    name: "Linear",
    description: "Project management & issue tracking",
    emoji: "📐",
    category: "pm",
    transport: "http",
    url: "https://mcp.linear.app/sse",
    docsUrl: "https://linear.app/docs",
    authNote: "Authenticates via browser on first use",
  },
  {
    id: "shadcn",
    name: "shadcn/ui",
    description: "UI component registry & installation",
    emoji: "🎨",
    category: "design",
    transport: "stdio",
    command: "npx",
    args: [
      "-y",
      "@anthropic-ai/claude-code@latest",
      "mcp",
      "serve",
      "--name",
      "shadcn",
    ],
    docsUrl: "https://ui.shadcn.com",
  },
  {
    id: "supabase",
    name: "Supabase",
    description: "Database, auth & storage management",
    emoji: "⚡",
    category: "database",
    transport: "stdio",
    command: "npx",
    args: ["-y", "supabase-mcp-server"],
    envTemplate: { SUPABASE_ACCESS_TOKEN: "" },
    docsUrl: "https://supabase.com/docs",
  },
  {
    id: "sentry",
    name: "Sentry",
    description: "Error monitoring & performance",
    emoji: "🐛",
    category: "devops",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@sentry/mcp-server"],
    envTemplate: { SENTRY_AUTH_TOKEN: "" },
    docsUrl: "https://docs.sentry.io",
  },
  {
    id: "figma",
    name: "Figma",
    description: "Design file access & inspection",
    emoji: "🖼️",
    category: "design",
    transport: "stdio",
    command: "npx",
    args: [
      "-y",
      "@anthropic-ai/claude-code@latest",
      "mcp",
      "serve",
      "--name",
      "figma",
    ],
    envTemplate: { FIGMA_ACCESS_TOKEN: "" },
    docsUrl: "https://www.figma.com/developers/api",
  },
  {
    id: "context7",
    name: "Context7",
    description: "Up-to-date docs for any library",
    emoji: "📚",
    category: "docs",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@upstash/context7-mcp@latest"],
    docsUrl: "https://context7.com",
  },
  {
    id: "browserbase",
    name: "Browserbase",
    description: "Cloud browser automation",
    emoji: "🌐",
    category: "ai",
    transport: "stdio",
    command: "npx",
    args: [
      "-y",
      "@anthropic-ai/claude-code@latest",
      "mcp",
      "serve",
      "--name",
      "browserbase",
    ],
    envTemplate: { BROWSERBASE_API_KEY: "", BROWSERBASE_PROJECT_ID: "" },
    docsUrl: "https://docs.browserbase.com",
  },
  {
    id: "github",
    name: "GitHub",
    description: "Repos, PRs, issues & actions",
    emoji: "🐙",
    category: "devops",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    envTemplate: { GITHUB_PERSONAL_ACCESS_TOKEN: "" },
    docsUrl: "https://github.com/modelcontextprotocol/servers",
  },
  {
    id: "postgres",
    name: "PostgreSQL",
    description: "Direct PostgreSQL database access",
    emoji: "🐘",
    category: "database",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-postgres"],
    envTemplate: { POSTGRES_CONNECTION_STRING: "" },
    docsUrl: "https://github.com/modelcontextprotocol/servers",
  },
  {
    id: "slack",
    name: "Slack",
    description: "Send messages & manage channels",
    emoji: "💬",
    category: "pm",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-slack"],
    envTemplate: { SLACK_BOT_TOKEN: "" },
    docsUrl: "https://github.com/modelcontextprotocol/servers",
  },
  {
    id: "filesystem",
    name: "Filesystem",
    description: "Sandboxed file system access",
    emoji: "📁",
    category: "other",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem"],
    docsUrl: "https://github.com/modelcontextprotocol/servers",
  },
];

export const SKILL_CATALOG: SkillCatalogEntry[] = [
  {
    id: "better-auth",
    name: "Better Auth",
    description: "Authentication skills for Better Auth",
    emoji: "🔐",
    category: "auth",
    installCommand: "better-auth/skills",
    docsUrl: "https://www.better-auth.com",
  },
];
