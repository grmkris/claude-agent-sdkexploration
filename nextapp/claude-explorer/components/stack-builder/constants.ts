import type {
  CategoryConfig,
  PresetStack,
  StackState,
  TechCategory,
  TechOption,
} from "./types";

export const CATEGORY_ORDER: CategoryConfig[] = [
  { key: "webFrontend", label: "Web Frontend", multiSelect: false },
  { key: "backend", label: "Backend", multiSelect: false },
  { key: "runtime", label: "Runtime", multiSelect: false },
  { key: "api", label: "API", multiSelect: false },
  { key: "database", label: "Database", multiSelect: false },
  { key: "orm", label: "ORM", multiSelect: false },
  { key: "dbSetup", label: "DB Setup", multiSelect: false },
  { key: "auth", label: "Auth", multiSelect: false },
  { key: "payments", label: "Payments", multiSelect: false },
  { key: "packageManager", label: "Package Manager", multiSelect: false },
  { key: "addons", label: "Addons", multiSelect: true },
];

export const TECH_OPTIONS: Record<TechCategory, TechOption[]> = {
  webFrontend: [
    {
      id: "tanstack-router",
      name: "TanStack Router",
      description: "Modern type-safe router for React",
      icon: "🟡",
      isDefault: true,
    },
    {
      id: "react-router",
      name: "React Router",
      description: "Declarative routing for React",
      icon: "▶️",
    },
    {
      id: "tanstack-start",
      name: "TanStack Start",
      description: "Full-stack React and Solid framework",
      icon: "🟡",
    },
    {
      id: "next",
      name: "Next.js",
      description: "React framework with hybrid rendering",
      icon: "⬛",
    },
    {
      id: "nuxt",
      name: "Nuxt",
      description: "Vue full-stack framework (SSR, SSG, hybrid)",
      icon: "💚",
    },
    {
      id: "svelte",
      name: "Svelte",
      description: "Cybernetically enhanced web apps",
      icon: "🟠",
    },
    {
      id: "solid",
      name: "Solid",
      description: "Simple and performant reactivity for building UIs",
      icon: "🔵",
    },
    {
      id: "astro",
      name: "Astro",
      description: "The web framework for content-driven websites",
      icon: "🟣",
    },
    {
      id: "none",
      name: "No Web Frontend",
      description: "No web-based frontend",
      icon: "⊘",
    },
  ],
  backend: [
    {
      id: "hono",
      name: "Hono",
      description: "Ultrafast web framework",
      icon: "🔥",
      isDefault: true,
    },
    {
      id: "elysia",
      name: "Elysia",
      description: "TypeScript web framework",
      icon: "🦊",
    },
    {
      id: "express",
      name: "Express",
      description: "Popular Node.js framework",
      icon: "eX",
    },
    {
      id: "fastify",
      name: "Fastify",
      description: "Fast, low-overhead web framework for Node.js",
      icon: "⚡",
    },
    {
      id: "convex",
      name: "Convex",
      description: "Reactive backend-as-a-service",
      icon: "🟠",
    },
    {
      id: "self-next",
      name: "Fullstack Next.js",
      description: "Use Next.js built-in API routes",
      icon: "⬛",
    },
    {
      id: "self-tanstack-start",
      name: "Fullstack TanStack Start",
      description: "Use TanStack Start server functions",
      icon: "🟡",
    },
    {
      id: "self-nuxt",
      name: "Fullstack Nuxt",
      description: "Use Nuxt server routes",
      icon: "💚",
    },
    {
      id: "self-astro",
      name: "Fullstack Astro",
      description: "Use Astro API routes",
      icon: "🟣",
    },
    {
      id: "none",
      name: "No Backend",
      description: "No server-side backend",
      icon: "⊘",
    },
  ],
  runtime: [
    {
      id: "bun",
      name: "Bun",
      description: "All-in-one JavaScript runtime",
      icon: "🟤",
      isDefault: true,
    },
    {
      id: "node",
      name: "Node.js",
      description: "JavaScript runtime built on V8",
      icon: "🟢",
    },
    {
      id: "workers",
      name: "Cloudflare Workers",
      description: "Serverless edge runtime",
      icon: "☁️",
    },
    {
      id: "none",
      name: "No Runtime",
      description: "No dedicated runtime",
      icon: "⊘",
    },
  ],
  api: [
    {
      id: "trpc",
      name: "tRPC",
      description: "End-to-end typesafe APIs",
      icon: "🔷",
      isDefault: true,
    },
    {
      id: "orpc",
      name: "oRPC",
      description: "Type-safe API layer for TypeScript",
      icon: "🟢",
    },
    { id: "none", name: "No API", description: "No API layer", icon: "⊘" },
  ],
  database: [
    {
      id: "sqlite",
      name: "SQLite",
      description: "Lightweight embedded database",
      icon: "🗄️",
      isDefault: true,
    },
    {
      id: "postgres",
      name: "PostgreSQL",
      description: "Advanced open source relational database",
      icon: "🐘",
    },
    {
      id: "mysql",
      name: "MySQL",
      description: "Popular open source relational database",
      icon: "🐬",
    },
    {
      id: "mongodb",
      name: "MongoDB",
      description: "Document-oriented NoSQL database",
      icon: "🍃",
    },
    { id: "none", name: "No Database", description: "No database", icon: "⊘" },
  ],
  orm: [
    {
      id: "drizzle",
      name: "Drizzle",
      description: "TypeScript ORM with SQL-like syntax",
      icon: "💧",
      isDefault: true,
    },
    {
      id: "prisma",
      name: "Prisma",
      description: "Next-generation Node.js and TypeScript ORM",
      icon: "△",
    },
    {
      id: "mongoose",
      name: "Mongoose",
      description: "MongoDB object modeling for Node.js",
      icon: "🍃",
    },
    { id: "none", name: "No ORM", description: "No ORM", icon: "⊘" },
  ],
  dbSetup: [
    {
      id: "none",
      name: "Basic Setup",
      description: "Default database configuration",
      icon: "📦",
      isDefault: true,
    },
    {
      id: "turso",
      name: "Turso",
      description: "SQLite for production (libSQL)",
      icon: "🟩",
    },
    {
      id: "d1",
      name: "Cloudflare D1",
      description: "SQLite at the edge",
      icon: "☁️",
    },
    {
      id: "neon",
      name: "Neon Postgres",
      description: "Serverless PostgreSQL",
      icon: "🟢",
    },
    {
      id: "prisma-postgres",
      name: "Prisma PostgreSQL",
      description: "Prisma managed PostgreSQL",
      icon: "△",
    },
    {
      id: "mongodb-atlas",
      name: "MongoDB Atlas",
      description: "Cloud-hosted MongoDB",
      icon: "🍃",
    },
    {
      id: "supabase",
      name: "Supabase",
      description: "Open source Firebase alternative",
      icon: "⚡",
    },
    {
      id: "planetscale",
      name: "PlanetScale",
      description: "Serverless MySQL platform",
      icon: "🪐",
    },
    {
      id: "docker",
      name: "Docker",
      description: "Local database via Docker",
      icon: "🐳",
    },
  ],
  auth: [
    {
      id: "better-auth",
      name: "Better-Auth",
      description: "TypeScript-first authentication library",
      icon: "🔐",
      isDefault: true,
    },
    {
      id: "clerk",
      name: "Clerk",
      description: "Drop-in authentication and user management",
      icon: "🔑",
    },
    {
      id: "none",
      name: "No Auth",
      description: "No authentication",
      icon: "⊘",
    },
  ],
  payments: [
    {
      id: "none",
      name: "No Payments",
      description: "No payment integration",
      icon: "⊘",
      isDefault: true,
    },
    {
      id: "polar",
      name: "Polar",
      description: "Open-source billing for developers",
      icon: "❄️",
    },
  ],
  packageManager: [
    {
      id: "bun",
      name: "bun",
      description: "Fast all-in-one package manager",
      icon: "🟤",
      isDefault: true,
    },
    {
      id: "pnpm",
      name: "pnpm",
      description: "Fast, disk space efficient package manager",
      icon: "🟡",
    },
    { id: "npm", name: "npm", description: "Node package manager", icon: "🔴" },
  ],
  addons: [
    {
      id: "turborepo",
      name: "Turborepo",
      description: "High-performance build system for monorepos",
      icon: "⚡",
      isDefault: true,
    },
    {
      id: "biome",
      name: "Biome",
      description: "Toolchain for web projects (linter + formatter)",
      icon: "🌿",
    },
    {
      id: "oxlint",
      name: "Oxlint",
      description: "Blazingly fast JavaScript linter",
      icon: "⚙️",
    },
    {
      id: "husky",
      name: "Husky",
      description: "Git hooks made easy",
      icon: "🐶",
    },
    {
      id: "lefthook",
      name: "Lefthook",
      description: "Fast and powerful Git hooks manager",
      icon: "🪝",
    },
    {
      id: "pwa",
      name: "PWA",
      description: "Progressive Web App support",
      icon: "📱",
    },
    {
      id: "tauri",
      name: "Tauri",
      description: "Build desktop apps with web technologies",
      icon: "🦀",
    },
    {
      id: "starlight",
      name: "Starlight",
      description: "Astro-powered documentation site",
      icon: "⭐",
    },
    {
      id: "fumadocs",
      name: "Fumadocs",
      description: "Next.js documentation framework",
      icon: "📚",
    },
  ],
};

export const DEFAULT_STACK: StackState = {
  projectName: "my-app",
  webFrontend: "tanstack-router",
  runtime: "bun",
  backend: "hono",
  database: "sqlite",
  orm: "drizzle",
  dbSetup: "none",
  auth: "better-auth",
  payments: "none",
  packageManager: "bun",
  addons: ["turborepo"],
  api: "trpc",
};

export const PRESET_STACKS: PresetStack[] = [
  {
    id: "default",
    name: "Default",
    description: "TanStack Router + Hono + tRPC + SQLite",
    icon: "🟡",
    stack: { ...DEFAULT_STACK },
  },
  {
    id: "mern",
    name: "MERN",
    description: "MongoDB + Express + React Router + Node.js",
    icon: "🍃",
    stack: {
      webFrontend: "react-router",
      backend: "express",
      runtime: "node",
      database: "mongodb",
      orm: "mongoose",
      api: "none",
      auth: "none",
      dbSetup: "mongodb-atlas",
      packageManager: "npm",
      addons: [],
    },
  },
  {
    id: "pern",
    name: "PERN",
    description: "PostgreSQL + Express + React Router + Node.js",
    icon: "🐘",
    stack: {
      webFrontend: "react-router",
      backend: "express",
      runtime: "node",
      database: "postgres",
      orm: "prisma",
      api: "none",
      auth: "none",
      dbSetup: "none",
      packageManager: "npm",
      addons: [],
    },
  },
  {
    id: "t3",
    name: "T3 Stack",
    description: "Next.js + tRPC + Prisma + PostgreSQL",
    icon: "⬛",
    stack: {
      webFrontend: "next",
      backend: "self-next",
      runtime: "node",
      database: "postgres",
      orm: "prisma",
      api: "trpc",
      auth: "better-auth",
      dbSetup: "none",
      packageManager: "pnpm",
      addons: [],
    },
  },
];

/**
 * Given a stack state, infer which MCPs should be auto-installed.
 * Maps stack choices → MCP catalog IDs (from lib/mcp-catalog.ts).
 */
export function inferMcpsForStack(stack: StackState): string[] {
  const mcps = new Set<string>();

  // React-based frontends benefit from shadcn
  const reactFrontends = [
    "tanstack-router",
    "react-router",
    "tanstack-start",
    "next",
  ];
  if (reactFrontends.includes(stack.webFrontend)) {
    mcps.add("shadcn");
  }

  // Context7 for docs on any non-trivial framework
  if (stack.webFrontend !== "none" || stack.backend !== "none") {
    mcps.add("context7");
  }

  // Database MCPs
  if (
    stack.database === "postgres" ||
    stack.dbSetup === "neon" ||
    stack.dbSetup === "supabase"
  ) {
    mcps.add("postgres");
  }
  if (stack.dbSetup === "supabase") {
    mcps.add("supabase");
  }

  return [...mcps];
}

/**
 * Given a stack state, infer which skills should be auto-installed.
 * Maps stack choices → skill IDs.
 */
export function inferSkillsForStack(stack: StackState): string[] {
  const skills = new Set<string>();

  // React-based frontends
  const reactFrontends = [
    "tanstack-router",
    "react-router",
    "tanstack-start",
    "next",
  ];
  if (reactFrontends.includes(stack.webFrontend)) {
    skills.add("vercel-labs/agent-skills/vercel-react-best-practices");
    skills.add("vercel-labs/agent-skills/web-design-guidelines");
  }

  // Next.js specific
  if (stack.webFrontend === "next" || stack.backend === "self-next") {
    skills.add("vercel-labs/agent-skills/vercel-composition-patterns");
  }

  // Frontend design skill for any web frontend
  if (stack.webFrontend !== "none") {
    skills.add("anthropics/skills/frontend-design");
  }

  // Supabase
  if (stack.dbSetup === "supabase") {
    skills.add("supabase/agent-skills/supabase-postgres-best-practices");
  }

  return [...skills];
}

/**
 * Generate a context prompt for Claude based on the selected stack.
 * Used as the initial prompt when creating a project via the stack builder.
 */
export function generateStackContextPrompt(stack: StackState): string {
  const parts: string[] = [];

  const feOpt = TECH_OPTIONS.webFrontend.find(
    (o) => o.id === stack.webFrontend
  );
  if (feOpt && stack.webFrontend !== "none")
    parts.push(`**Frontend:** ${feOpt.name}`);

  const beOpt = TECH_OPTIONS.backend.find((o) => o.id === stack.backend);
  if (beOpt && stack.backend !== "none")
    parts.push(`**Backend:** ${beOpt.name}`);

  const rtOpt = TECH_OPTIONS.runtime.find((o) => o.id === stack.runtime);
  if (rtOpt && stack.runtime !== "none")
    parts.push(`**Runtime:** ${rtOpt.name}`);

  const apiOpt = TECH_OPTIONS.api.find((o) => o.id === stack.api);
  if (apiOpt && stack.api !== "none") parts.push(`**API:** ${apiOpt.name}`);

  const dbOpt = TECH_OPTIONS.database.find((o) => o.id === stack.database);
  const ormOpt = TECH_OPTIONS.orm.find((o) => o.id === stack.orm);
  if (dbOpt && stack.database !== "none") {
    const ormPart = ormOpt && stack.orm !== "none" ? ` + ${ormOpt.name}` : "";
    parts.push(`**Database:** ${dbOpt.name}${ormPart}`);
  }

  const setupOpt = TECH_OPTIONS.dbSetup.find((o) => o.id === stack.dbSetup);
  if (setupOpt && stack.dbSetup !== "none")
    parts.push(`**DB Provider:** ${setupOpt.name}`);

  const authOpt = TECH_OPTIONS.auth.find((o) => o.id === stack.auth);
  if (authOpt && stack.auth !== "none") parts.push(`**Auth:** ${authOpt.name}`);

  const payOpt = TECH_OPTIONS.payments.find((o) => o.id === stack.payments);
  if (payOpt && stack.payments !== "none")
    parts.push(`**Payments:** ${payOpt.name}`);

  const pmOpt = TECH_OPTIONS.packageManager.find(
    (o) => o.id === stack.packageManager
  );
  if (pmOpt) parts.push(`**Package Manager:** ${pmOpt.name}`);

  if (stack.addons.length > 0) {
    const addonNames = stack.addons
      .map((id) => TECH_OPTIONS.addons.find((o) => o.id === id)?.name ?? id)
      .join(", ");
    parts.push(`**Addons:** ${addonNames}`);
  }

  const stackList = parts.join("\n");

  // Build framework-specific setup instructions
  const instructions = getSetupInstructions(stack);

  const pm =
    stack.packageManager === "npm"
      ? "npm"
      : stack.packageManager === "pnpm"
        ? "pnpm"
        : "bun";

  return [
    `This is a freshly scaffolded Better T Stack project with the following stack:`,
    "",
    stackList,
    "",
    "The project was just created with `bun create better-t-stack@latest`.",
    "Dependencies have **not** been installed yet (`--no-install` was used).",
    "",
    "## Next Steps",
    "",
    `1. Install dependencies with \`${pm} install\`.`,
    "2. Review the project structure and verify everything looks correct.",
    ...instructions.map((line) => `   ${line}`),
    "3. Make sure the project builds and runs successfully.",
  ].join("\n");
}

/**
 * Generate framework-specific setup instructions for the prompt.
 */
function getSetupInstructions(stack: StackState): string[] {
  const instructions: string[] = [];

  // Frontend setup
  switch (stack.webFrontend) {
    case "next":
      instructions.push(
        "- Configure Next.js with the App Router and TypeScript."
      );
      break;
    case "tanstack-router":
      instructions.push("- Set up TanStack Router with type-safe routing.");
      break;
    case "nuxt":
      instructions.push(
        "- Configure Nuxt 3 with auto-imports and pages/directory routing."
      );
      break;
    case "svelte":
      instructions.push("- Set up SvelteKit with TypeScript.");
      break;
  }

  // Backend setup
  switch (stack.backend) {
    case "hono":
      instructions.push("- Configure Hono with typed route groups.");
      break;
    case "express":
      instructions.push(
        "- Set up Express with TypeScript and proper middleware."
      );
      break;
    case "convex":
      instructions.push("- Set up Convex functions and schema.");
      break;
  }

  // Database + ORM
  if (stack.database !== "none" && stack.orm !== "none") {
    const ormName =
      TECH_OPTIONS.orm.find((o) => o.id === stack.orm)?.name ?? stack.orm;
    const dbName =
      TECH_OPTIONS.database.find((o) => o.id === stack.database)?.name ??
      stack.database;
    instructions.push(
      `- Configure ${ormName} with ${dbName} and create an initial schema.`
    );
  }

  // Auth
  switch (stack.auth) {
    case "better-auth":
      instructions.push(
        "- Set up Better Auth with email/password authentication."
      );
      break;
    case "clerk":
      instructions.push("- Configure Clerk for authentication.");
      break;
  }

  // API
  switch (stack.api) {
    case "trpc":
      instructions.push(
        "- Set up tRPC with a typed router and sample procedures."
      );
      break;
    case "orpc":
      instructions.push("- Set up oRPC with typed procedures.");
      break;
  }

  return instructions;
}
