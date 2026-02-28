export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  emoji: string;
  mcpIds: string[];
  skillIds: string[];
  initialPrompt?: string;
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: "blank",
    name: "Blank",
    description: "Start from scratch",
    emoji: "📄",
    mcpIds: [],
    skillIds: [],
  },
  {
    id: "nextjs",
    name: "Next.js",
    description: "Web app with shadcn/ui",
    emoji: "⚡",
    mcpIds: ["shadcn", "context7"],
    skillIds: ["vercel-labs/agent-skills/vercel-react-best-practices"],
    initialPrompt:
      "Set up a Next.js 15 project with TypeScript, Tailwind CSS, and shadcn/ui components.",
  },
  {
    id: "api-service",
    name: "API Service",
    description: "Backend service",
    emoji: "🔌",
    mcpIds: ["filesystem"],
    skillIds: [],
    initialPrompt: "Create a REST API service with TypeScript.",
  },
  {
    id: "ai-agent",
    name: "AI Agent",
    description: "Agent with web access",
    emoji: "🤖",
    mcpIds: ["context7", "browserbase"],
    skillIds: [],
    initialPrompt:
      "Build an AI agent that can search the web and remember information.",
  },
];

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
  /** For http/sse servers: maps env template values into HTTP headers via {{VAR}} interpolation */
  headersTemplate?: Record<string, string>;
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
    command: "bunx",
    args: ["@railway/mcp-server"],
    docsUrl: "https://docs.railway.com/reference/cli-api",
    authNote: "Requires RAILWAY_TOKEN env var",
    envTemplate: { RAILWAY_TOKEN: "" },
  },
  {
    id: "linear",
    name: "Linear",
    description: "Project management & issue tracking",
    emoji: "📐",
    category: "pm",
    transport: "http",
    url: "https://mcp.linear.app/mcp",
    envTemplate: { LINEAR_API_KEY: "" },
    headersTemplate: { Authorization: "Bearer {{LINEAR_API_KEY}}" },
    docsUrl: "https://linear.app/docs",
    authNote: "Requires a Linear API key (Settings → Account → API Keys)",
  },
  {
    id: "shadcn",
    name: "shadcn/ui",
    description: "UI component registry & installation",
    emoji: "🎨",
    category: "design",
    transport: "stdio",
    command: "bunx",
    args: ["shadcn@latest", "mcp"],
    docsUrl: "https://ui.shadcn.com",
  },
  {
    id: "supabase",
    name: "Supabase",
    description: "Database, auth & storage management",
    emoji: "⚡",
    category: "database",
    transport: "stdio",
    command: "bunx",
    args: ["supabase-mcp-server"],
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
    command: "bunx",
    args: ["@sentry/mcp-server"],
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
    command: "bunx",
    args: ["@figma/mcp-server-figma-mcp"],
    envTemplate: { FIGMA_API_TOKEN: "" },
    docsUrl: "https://www.figma.com/developers/api",
  },
  {
    id: "context7",
    name: "Context7",
    description: "Up-to-date docs for any library",
    emoji: "📚",
    category: "docs",
    transport: "stdio",
    command: "bunx",
    args: ["@upstash/context7-mcp@latest"],
    docsUrl: "https://context7.com",
  },
  {
    id: "browserbase",
    name: "Browserbase",
    description: "Cloud browser automation",
    emoji: "🌐",
    category: "ai",
    transport: "stdio",
    command: "bunx",
    args: ["@browserbasehq/mcp"],
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
    command: "bunx",
    args: ["@modelcontextprotocol/server-github"],
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
    command: "bunx",
    args: ["@modelcontextprotocol/server-postgres"],
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
    command: "bunx",
    args: ["@modelcontextprotocol/server-slack"],
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
    command: "bunx",
    args: ["@modelcontextprotocol/server-filesystem"],
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

// --- skills.sh integration ---

export interface SkillsShSkill {
  id: string;
  skillId: string;
  name: string;
  installs: number;
  source: string;
}

export const SUGGESTED_SKILLS: SkillsShSkill[] = [
  {
    id: "vercel-labs/skills/find-skills",
    skillId: "find-skills",
    name: "find-skills",
    installs: 312182,
    source: "vercel-labs/skills",
  },
  {
    id: "vercel-labs/agent-skills/vercel-react-best-practices",
    skillId: "vercel-react-best-practices",
    name: "vercel-react-best-practices",
    installs: 163721,
    source: "vercel-labs/agent-skills",
  },
  {
    id: "vercel-labs/agent-skills/web-design-guidelines",
    skillId: "web-design-guidelines",
    name: "web-design-guidelines",
    installs: 124752,
    source: "vercel-labs/agent-skills",
  },
  {
    id: "remotion-dev/skills/remotion-best-practices",
    skillId: "remotion-best-practices",
    name: "remotion-best-practices",
    installs: 109520,
    source: "remotion-dev/skills",
  },
  {
    id: "anthropics/skills/frontend-design",
    skillId: "frontend-design",
    name: "frontend-design",
    installs: 96060,
    source: "anthropics/skills",
  },
  {
    id: "vercel-labs/agent-skills/vercel-composition-patterns",
    skillId: "vercel-composition-patterns",
    name: "vercel-composition-patterns",
    installs: 55683,
    source: "vercel-labs/agent-skills",
  },
  {
    id: "anthropics/skills/skill-creator",
    skillId: "skill-creator",
    name: "skill-creator",
    installs: 46854,
    source: "anthropics/skills",
  },
  {
    id: "vercel-labs/agent-skills/vercel-react-native-skills",
    skillId: "vercel-react-native-skills",
    name: "vercel-react-native-skills",
    installs: 39210,
    source: "vercel-labs/agent-skills",
  },
  {
    id: "supabase/agent-skills/supabase-postgres-best-practices",
    skillId: "supabase-postgres-best-practices",
    name: "supabase-postgres-best-practices",
    installs: 23747,
    source: "supabase/agent-skills",
  },
  {
    id: "anthropics/skills/pdf",
    skillId: "pdf",
    name: "pdf",
    installs: 20766,
    source: "anthropics/skills",
  },
];
