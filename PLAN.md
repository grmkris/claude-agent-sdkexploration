# Plan: Stack Builder Integration

## Overview

Add a **"Stack Builder"** tab to the project creation form on the dashboard, inspired by [Better T Stack's builder UI](https://www.better-t-stack.dev/new). Users select technologies across categories (frontend, backend, database, auth, etc.), and the app generates and executes the corresponding `bun create better-t-stack@latest ...` CLI command to scaffold the project — then hands off to a Claude session.

This becomes a third bootstrapping mode alongside "Templates" and "Clone from GitHub".

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│ NewProjectForm (page.tsx)                       │
│ ┌─────────┐  ┌──────────────┐  ┌─────────────┐ │
│ │Templates│  │ Stack Builder│  │ Clone GitHub │ │
│ │ (exist) │  │   (NEW)      │  │   (exist)   │ │
│ └─────────┘  └──────┬───────┘  └─────────────┘ │
│                      │                          │
│    User selects tech categories & options       │
│    ↓                                            │
│    Generated CLI cmd shown + project name       │
│    ↓                                            │
│    "Create" → POST to createProjectProc         │
└──────────────────────┬──────────────────────────┘
                       │
  ┌────────────────────▼─────────────────────┐
  │ createProjectProc (procedures.ts)        │
  │                                          │
  │ 1. (skip mkdir — CLI creates the dir)    │
  │ 2. Run: bun create better-t-stack@latest │
  │    projectName --yes [flags...]          │
  │    cwd: parentDir                        │
  │ 3. Register with Claude CLI              │
  │ 4. Install MCPs + Skills                 │
  │ 5. Return slug                           │
  └────────────────────┬─────────────────────┘
                       │
  Navigate to /project/{slug}/chat?prompt=...
```

---

## Files to Create/Modify

### New Files

| File | Purpose |
|------|---------|
| `lib/stack-builder-options.ts` | Tech category definitions, options, defaults, compatibility rules, CLI command generation |
| `components/stack-builder.tsx` | The `<StackBuilder>` UI component with category grid, selected badges, and CLI preview |

### Modified Files

| File | Change |
|------|--------|
| `app/page.tsx` | Add "Stack Builder" mode toggle alongside Templates/Clone, render `<StackBuilder>` when active |
| `lib/procedures.ts` | Extend `createProjectProc` input with `bootstrapCommand?: { command: string; args: string[] }` and execute it |

---

## Step-by-Step Implementation

### Step 1: Create `lib/stack-builder-options.ts`

Define the tech catalog, modeled after Better T Stack's `constant.ts` but adapted to our needs.

**Core types:**
```typescript
export type TechCategory =
  | "webFrontend" | "backend" | "runtime" | "api"
  | "database" | "orm" | "auth" | "packageManager" | "addons";

export interface TechOption {
  id: string;
  name: string;
  description: string;
  emoji: string;
  isDefault?: boolean;
}

export interface StackState {
  projectName: string;
  webFrontend: string;
  backend: string;
  runtime: string;
  api: string;
  database: string;
  orm: string;
  auth: string;
  packageManager: string;
  addons: string[];
}
```

**TECH_OPTIONS**: Record mapping each `TechCategory` to an array of `TechOption`. Includes all major options from Better T Stack:
- **Web Frontend**: TanStack Router (default), React Router, Next.js, Nuxt, Svelte, Solid, Astro, None
- **Backend**: Hono (default), Elysia, Express, Fastify, None
- **Runtime**: Bun (default), Node.js
- **API**: tRPC (default), oRPC, None
- **Database**: SQLite (default), PostgreSQL, MySQL, MongoDB, None
- **ORM**: Drizzle (default), Prisma, None
- **Auth**: Better Auth (default), None
- **Package Manager**: bun (default), pnpm, npm
- **Addons**: Turborepo, Biome, Husky, PWA, Tauri, Starlight (multi-select)

**`generateCliCommand(stack)`**: Converts `StackState` → `{ command: "bun", args: [...] }` for the `bun create better-t-stack@latest` CLI.

**`formatCliString(stack)`**: Returns the human-readable command string for display + copy.

**`getDisabledReason(stack, category, optionId)`**: Basic compatibility rules:
- MongoDB requires Prisma ORM
- Nuxt/Svelte/Solid/Astro frontends require oRPC (not tRPC)
- (We mirror a subset of Better T Stack's compatibility engine)

**`getRecommendedMcps(stack)`**: Auto-maps stack selections to MCP recommendations:
- PostgreSQL → `postgres` MCP
- React-based frontends → `shadcn` MCP

### Step 2: Create `components/stack-builder.tsx`

The interactive UI component. Compact single-column layout that fits inside the existing `NewProjectForm` container.

```
┌─────────────────────────────────────────────┐
│ Selected: 🟡 TanStack Router × 🔥 Hono ×  │
│           🍞 Bun × 🔷 tRPC × ...          │
├─────────────────────────────────────────────┤
│ ▸ Web Frontend                              │
│ [TanStack Router✓] [React Router] [Next.js] │
│ [Nuxt] [Svelte] [Solid] [Astro] [None]     │
│                                             │
│ ▸ Backend                                   │
│ [Hono ✓] [Elysia] [Express] [Fastify]      │
│                                             │
│ ▸ Runtime                                   │
│ [Bun ✓] [Node.js]                          │
│                                             │
│ ... (more categories, collapsible)          │
├─────────────────────────────────────────────┤
│ CLI: bun create better-t-stack@latest       │
│      my-app --yes --frontend tanstack-...   │
│                                    [Copy]   │
└─────────────────────────────────────────────┘
```

**Props:**
```typescript
interface StackBuilderProps {
  state: StackState;
  onChange: (state: StackState) => void;
  projectName: string;
}
```

**Key features:**
- Each tech option is a small button showing emoji + name
- Selected option gets `border-primary bg-primary/10` ring (matches existing style from `NewProjectForm`)
- Disabled options show tooltip with reason via `getDisabledReason()`
- Categories are collapsible sections (using existing `Collapsible` component)
- Selected stack shown as removable `Badge` chips at the top
- CLI command shown at bottom with `CopyButton` (existing component)
- Addons category supports multi-select; all others are single-select
- Uses existing UI components: `Badge`, `Collapsible`, `Button`, `Tooltip`

### Step 3: Modify `app/page.tsx` — Add Stack Builder Mode

Add a third creation mode toggle button to `NewProjectForm`.

**New state:**
```typescript
const [builderEnabled, setBuilderEnabled] = useState(false);
const [stackState, setStackState] = useState<StackState>(DEFAULT_STACK);
```

**New toggle button** (same style as the existing "Clone from GitHub" button):
```tsx
<button onClick={handleToggleBuilder} className={...}>
  🏗 Stack Builder
</button>
```

**When builder is enabled:**
- Template selector is visually dimmed (builder replaces template logic)
- Clone toggle is disabled (mutually exclusive modes)
- The `StackBuilder` component renders inline
- Auto-generates initial prompt: "I just scaffolded this project using Better T Stack with [selections]. Help me understand the codebase and get started."
- Auto-recommends MCPs via `getRecommendedMcps(stackState)`

**Mutation change** — the `createProject.mutate()` call branches:
```typescript
if (builderEnabled) {
  const { command, args } = generateCliCommand({ ...stackState, projectName: name });
  return client.projects.create({
    ...base,
    bootstrapCommand: { command, args },
  });
}
```

### Step 4: Modify `lib/procedures.ts` — Execute Bootstrap Command

Extend `createProjectProc` input schema and handler.

**Input schema addition:**
```typescript
bootstrapCommand: z.object({
  command: z.string(),
  args: z.array(z.string()),
}).optional(),
```

**New handler branch** (between clone and empty-dir paths):
```typescript
} else if (input.bootstrapCommand) {
  // Security: only allow known bootstrap commands
  const ALLOWED_COMMANDS = ["bun", "npx", "pnpm"];
  if (!ALLOWED_COMMANDS.includes(input.bootstrapCommand.command)) {
    throw new Error(`Bootstrap command not allowed: ${input.bootstrapCommand.command}`);
  }

  // Run in parentDir — the CLI creates projectName/ itself
  const proc = Bun.spawn(
    [input.bootstrapCommand.command, ...input.bootstrapCommand.args],
    {
      cwd: input.parentDir,
      stdout: "pipe",
      stderr: "pipe",
      env: process.env,
    }
  );
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`Bootstrap failed (exit ${exitCode}): ${stderr || stdout}`);
  }
} else {
```

**Key detail**: `bun create better-t-stack@latest my-app` creates the `my-app/` directory inside cwd. So we run in `parentDir` (e.g., `/home/bun/projects`), NOT inside a pre-created project directory. We skip `createProjectDirectory()` for this path.

---

## Security Considerations

- **Command allowlist**: Only `bun`, `npx`, `pnpm` allowed (validated server-side in procedure)
- **No shell injection**: `Bun.spawn()` takes an array, no shell interpolation
- **Project name validation**: Existing path traversal checks still apply
- **No secrets needed**: Bootstrap commands don't require tokens (unlike git clone)

## UX Flow

1. User clicks "+ New Project" on dashboard
2. Sees template cards + "Clone from GitHub" + **"🏗 Stack Builder"** buttons
3. Clicks "Stack Builder" → categories expand inline with defaults pre-selected
4. Picks tech from each category (click to change)
5. Sees live CLI command at bottom + selected badges at top
6. Types project name, optionally edits initial prompt
7. Clicks "Create" → backend runs CLI → project scaffolded (~10-30s)
8. Redirected to chat session with auto-prompt about the scaffolded stack

## Summary of Changes

| # | What | Where | Size |
|---|------|-------|------|
| 1 | Tech options data model + CLI generation + compatibility | `lib/stack-builder-options.ts` (new) | ~200 lines |
| 2 | Stack builder UI component | `components/stack-builder.tsx` (new) | ~250 lines |
| 3 | Wire into NewProjectForm with mode toggle | `app/page.tsx` (modify) | ~50 lines changed |
| 4 | Accept + execute bootstrap command | `lib/procedures.ts` (modify) | ~25 lines added |

**Total**: 2 new files, 2 modified files, ~525 lines of new code.
