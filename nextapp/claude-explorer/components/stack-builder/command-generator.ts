import type { StackState } from "./types";

/**
 * Generates a structured CLI command from the stack state.
 * Returns command + args array for safe execution via Bun.spawn().
 */
export function generateCliCommand(stack: StackState): {
  command: "bun" | "npx" | "pnpm";
  args: string[];
} {
  const args: string[] = [];

  // Base: create better-t-stack@latest <project-name>
  switch (stack.packageManager) {
    case "bun":
      args.push("create", "better-t-stack@latest");
      break;
    case "pnpm":
      args.push("create", "better-t-stack@latest");
      break;
    case "npm":
      // npx uses a different syntax
      args.push("create-better-t-stack@latest");
      break;
  }

  args.push(stack.projectName || "my-app");

  // Frontend
  if (stack.webFrontend && stack.webFrontend !== "tanstack-router") {
    args.push("--frontend", stack.webFrontend);
  }

  // Backend — map self-* to "self" for CLI
  if (stack.backend !== "hono") {
    const backendValue = stack.backend.startsWith("self-")
      ? "self"
      : stack.backend;
    args.push("--backend", backendValue);
  }

  // Runtime
  if (stack.runtime !== "bun") {
    args.push("--runtime", stack.runtime);
  }

  // API
  if (stack.api !== "trpc") {
    args.push("--api", stack.api);
  }

  // Auth
  if (stack.auth !== "better-auth") {
    args.push("--auth", stack.auth);
  }

  // Payments
  if (stack.payments !== "none") {
    args.push("--payments", stack.payments);
  }

  // Database
  if (stack.database !== "sqlite") {
    args.push("--database", stack.database);
  }

  // ORM
  if (stack.orm !== "drizzle") {
    args.push("--orm", stack.orm);
  }

  // DB Setup
  if (stack.dbSetup !== "none") {
    args.push("--db-setup", stack.dbSetup);
  }

  // Package Manager
  if (stack.packageManager !== "bun") {
    args.push("--package-manager", stack.packageManager);
  }

  // Git — always enabled
  args.push("--git");

  // Addons
  if (stack.addons.length > 0) {
    args.push("--addons", ...stack.addons);
  } else {
    args.push("--addons", "none");
  }

  // No install — let the user decide in the project
  args.push("--no-install");

  const command: "bun" | "npx" | "pnpm" =
    stack.packageManager === "npm"
      ? "npx"
      : (stack.packageManager as "bun" | "pnpm");
  return { command, args };
}

/**
 * Generates a human-readable CLI command string for display and copy.
 */
export function generateCliString(stack: StackState): string {
  const { command, args } = generateCliCommand(stack);
  // Quote args with spaces (shouldn't happen but be safe)
  const escaped = args.map((a) => (a.includes(" ") ? `"${a}"` : a));
  return `${command} ${escaped.join(" ")}`;
}
