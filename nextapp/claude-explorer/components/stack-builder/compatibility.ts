import type { CompatibilityResult, StackState, TechCategory } from "./types";

import { TECH_OPTIONS } from "./constants";

/**
 * Returns a human-readable reason why an option is disabled for the given
 * stack state, or null if it is selectable.
 */
export function getDisabledReason(
  stack: StackState,
  category: TechCategory,
  optionId: string
): string | null {
  // --- Backend constraints ---
  if (category === "backend") {
    if (optionId === "self-next" && stack.webFrontend !== "next")
      return "Requires Next.js frontend";
    if (
      optionId === "self-tanstack-start" &&
      stack.webFrontend !== "tanstack-start"
    )
      return "Requires TanStack Start frontend";
    if (optionId === "self-nuxt" && stack.webFrontend !== "nuxt")
      return "Requires Nuxt frontend";
    if (optionId === "self-astro" && stack.webFrontend !== "astro")
      return "Requires Astro frontend";
    if (optionId === "elysia" && stack.runtime === "workers")
      return "Incompatible with Cloudflare Workers";
    if (optionId === "express" && stack.runtime === "workers")
      return "Incompatible with Cloudflare Workers";
    if (optionId === "fastify" && stack.runtime === "workers")
      return "Incompatible with Cloudflare Workers";
  }

  // --- Runtime constraints ---
  if (category === "runtime") {
    if (stack.backend === "convex") return "Convex manages its own runtime";
    if (
      optionId === "workers" &&
      stack.backend !== "hono" &&
      stack.backend !== "none"
    )
      return "Workers requires Hono backend";
  }

  // --- Database constraints ---
  if (category === "database") {
    if (stack.backend === "convex") return "Convex has built-in database";
    if (optionId === "mongodb" && stack.runtime === "workers")
      return "MongoDB incompatible with Workers";
    if (optionId === "sqlite" && stack.dbSetup === "neon")
      return "Neon requires PostgreSQL";
    if (optionId === "sqlite" && stack.dbSetup === "prisma-postgres")
      return "Prisma Postgres requires PostgreSQL";
  }

  // --- ORM constraints ---
  if (category === "orm") {
    if (stack.backend === "convex") return "Convex has built-in data layer";
    if (stack.database === "none") return "No database selected";
    if (optionId === "mongoose" && stack.database !== "mongodb")
      return "Mongoose requires MongoDB";
    if (optionId === "drizzle" && stack.database === "mongodb")
      return "Drizzle doesn't support MongoDB";
    if (
      optionId === "prisma" &&
      stack.database === "mongodb" &&
      stack.runtime === "workers"
    )
      return "Prisma+MongoDB incompatible with Workers";
  }

  // --- DB Setup constraints ---
  if (category === "dbSetup") {
    if (stack.backend === "convex") return "Convex manages its own database";
    if (stack.database === "none") return "No database selected";
    if (optionId === "turso" && stack.database !== "sqlite")
      return "Turso requires SQLite";
    if (optionId === "d1" && stack.database !== "sqlite")
      return "D1 requires SQLite";
    if (optionId === "d1" && stack.runtime !== "workers")
      return "D1 requires Cloudflare Workers";
    if (optionId === "neon" && stack.database !== "postgres")
      return "Neon requires PostgreSQL";
    if (optionId === "prisma-postgres" && stack.database !== "postgres")
      return "Requires PostgreSQL";
    if (optionId === "prisma-postgres" && stack.orm !== "prisma")
      return "Requires Prisma ORM";
    if (optionId === "mongodb-atlas" && stack.database !== "mongodb")
      return "Requires MongoDB";
    if (optionId === "supabase" && stack.database !== "postgres")
      return "Supabase requires PostgreSQL";
    if (optionId === "planetscale" && stack.database !== "mysql")
      return "PlanetScale requires MySQL";
    if (optionId === "docker" && stack.runtime === "workers")
      return "Docker incompatible with Workers";
  }

  // --- API constraints ---
  if (category === "api") {
    if (stack.backend === "convex") return "Convex has built-in API layer";
    if (stack.backend === "none" && optionId !== "none")
      return "No backend selected";
    // tRPC requires React-compatible frontend or no frontend
    const nonReactFrontends = ["nuxt", "svelte", "solid", "astro"];
    if (optionId === "trpc" && nonReactFrontends.includes(stack.webFrontend)) {
      return `tRPC requires React frontend (use oRPC with ${TECH_OPTIONS.webFrontend.find((o) => o.id === stack.webFrontend)?.name ?? stack.webFrontend})`;
    }
  }

  // --- Auth constraints ---
  if (category === "auth") {
    if (optionId === "clerk" && stack.backend !== "convex")
      return "Clerk requires Convex backend";
    if (optionId === "better-auth" && stack.backend === "convex")
      return "Use Clerk with Convex";
  }

  // --- Payments constraints ---
  if (category === "payments") {
    if (optionId === "polar" && stack.auth !== "better-auth")
      return "Polar requires Better-Auth";
    if (optionId === "polar" && stack.webFrontend === "none")
      return "Polar requires a web frontend";
  }

  // --- Addon constraints ---
  if (category === "addons") {
    const pwaCompatible = ["tanstack-router", "react-router", "solid", "next"];
    if (optionId === "pwa" && !pwaCompatible.includes(stack.webFrontend)) {
      return "PWA requires TanStack Router, React Router, Solid, or Next.js";
    }
    const tauriCompatible = [
      "tanstack-router",
      "react-router",
      "nuxt",
      "svelte",
      "solid",
      "next",
    ];
    if (optionId === "tauri" && !tauriCompatible.includes(stack.webFrontend)) {
      return "Tauri requires a web frontend with a dev server";
    }
    if (
      optionId === "starlight" &&
      stack.webFrontend !== "astro" &&
      stack.webFrontend !== "none"
    ) {
      // Starlight is Astro-based but can coexist as an addon
    }
    if (optionId === "fumadocs" && stack.webFrontend !== "next") {
      return "Fumadocs requires Next.js";
    }
  }

  return null;
}

/**
 * Analyze the current stack for incompatibilities and return an adjusted
 * stack (or null if no changes needed) along with human-readable change notes.
 */
export function analyzeStackCompatibility(
  stack: StackState
): CompatibilityResult {
  const changes: string[] = [];
  let s = { ...stack, addons: [...stack.addons] };
  let changed = false;

  // --- Backend → Runtime adjustments ---
  if (s.backend === "convex") {
    if (s.runtime !== "none") {
      s.runtime = "none";
      changes.push("Runtime set to none (Convex manages its own runtime)");
      changed = true;
    }
    if (s.database !== "none") {
      s.database = "none";
      changes.push("Database set to none (Convex has built-in database)");
      changed = true;
    }
    if (s.orm !== "none") {
      s.orm = "none";
      changes.push("ORM set to none (Convex has built-in data layer)");
      changed = true;
    }
    if (s.api !== "none") {
      s.api = "none";
      changes.push("API set to none (Convex has built-in API layer)");
      changed = true;
    }
    if (s.dbSetup !== "none") {
      s.dbSetup = "none";
      changes.push("DB Setup set to none (Convex manages its own database)");
      changed = true;
    }
    if (s.auth === "better-auth") {
      s.auth = "clerk";
      changes.push(
        "Auth changed to Clerk (Better-Auth not compatible with Convex)"
      );
      changed = true;
    }
  }

  // --- Self-hosted backend → Frontend alignment ---
  if (s.backend === "self-next" && s.webFrontend !== "next") {
    s.backend = "hono";
    changes.push(
      "Backend changed to Hono (Fullstack Next.js requires Next.js frontend)"
    );
    changed = true;
  }
  if (
    s.backend === "self-tanstack-start" &&
    s.webFrontend !== "tanstack-start"
  ) {
    s.backend = "hono";
    changes.push(
      "Backend changed to Hono (Fullstack TanStack Start requires TanStack Start frontend)"
    );
    changed = true;
  }
  if (s.backend === "self-nuxt" && s.webFrontend !== "nuxt") {
    s.backend = "hono";
    changes.push(
      "Backend changed to Hono (Fullstack Nuxt requires Nuxt frontend)"
    );
    changed = true;
  }
  if (s.backend === "self-astro" && s.webFrontend !== "astro") {
    s.backend = "hono";
    changes.push(
      "Backend changed to Hono (Fullstack Astro requires Astro frontend)"
    );
    changed = true;
  }

  // --- Workers runtime constraints ---
  if (s.runtime === "workers") {
    if (s.backend !== "hono" && s.backend !== "none") {
      s.backend = "hono";
      changes.push("Backend changed to Hono (Workers requires Hono)");
      changed = true;
    }
    if (s.database === "mongodb") {
      s.database = "sqlite";
      changes.push(
        "Database changed to SQLite (MongoDB incompatible with Workers)"
      );
      changed = true;
    }
  }

  // --- Database → ORM alignment ---
  if (s.database === "mongodb") {
    if (s.orm !== "mongoose" && s.orm !== "prisma" && s.orm !== "none") {
      s.orm = "mongoose";
      changes.push(
        "ORM changed to Mongoose (MongoDB requires Mongoose or Prisma)"
      );
      changed = true;
    }
  }
  if (s.database !== "mongodb" && s.orm === "mongoose") {
    s.orm = "drizzle";
    changes.push("ORM changed to Drizzle (Mongoose requires MongoDB)");
    changed = true;
  }
  if (s.database === "mongodb" && s.orm === "drizzle") {
    s.orm = "mongoose";
    changes.push("ORM changed to Mongoose (Drizzle doesn't support MongoDB)");
    changed = true;
  }
  if (s.database === "none" && s.orm !== "none") {
    s.orm = "none";
    changes.push("ORM set to none (no database selected)");
    changed = true;
  }

  // --- Database → DB Setup alignment ---
  if (s.database === "none" && s.dbSetup !== "none") {
    s.dbSetup = "none";
    changes.push("DB Setup set to none (no database selected)");
    changed = true;
  }
  if (
    s.database !== "sqlite" &&
    (s.dbSetup === "turso" || s.dbSetup === "d1")
  ) {
    s.dbSetup = "none";
    changes.push("DB Setup reset (requires SQLite)");
    changed = true;
  }
  if (
    s.database !== "postgres" &&
    ["neon", "prisma-postgres", "supabase"].includes(s.dbSetup)
  ) {
    s.dbSetup = "none";
    changes.push("DB Setup reset (requires PostgreSQL)");
    changed = true;
  }
  if (s.database !== "mysql" && s.dbSetup === "planetscale") {
    s.dbSetup = "none";
    changes.push("DB Setup reset (PlanetScale requires MySQL)");
    changed = true;
  }
  if (s.database !== "mongodb" && s.dbSetup === "mongodb-atlas") {
    s.dbSetup = "none";
    changes.push("DB Setup reset (requires MongoDB)");
    changed = true;
  }
  if (s.dbSetup === "d1" && s.runtime !== "workers") {
    s.dbSetup = "none";
    changes.push("DB Setup reset (D1 requires Cloudflare Workers)");
    changed = true;
  }
  if (s.dbSetup === "prisma-postgres" && s.orm !== "prisma") {
    s.dbSetup = "none";
    changes.push("DB Setup reset (Prisma Postgres requires Prisma ORM)");
    changed = true;
  }

  // --- API → Frontend alignment ---
  const nonReactFrontends = ["nuxt", "svelte", "solid", "astro"];
  if (s.api === "trpc" && nonReactFrontends.includes(s.webFrontend)) {
    s.api = "orpc";
    const feName =
      TECH_OPTIONS.webFrontend.find((o) => o.id === s.webFrontend)?.name ??
      s.webFrontend;
    changes.push(`API changed to oRPC (tRPC not compatible with ${feName})`);
    changed = true;
  }
  if (s.backend === "none" && s.api !== "none") {
    s.api = "none";
    changes.push("API set to none (no backend selected)");
    changed = true;
  }

  // --- Auth adjustments ---
  if (s.auth === "clerk" && s.backend !== "convex") {
    s.auth = "better-auth";
    changes.push("Auth changed to Better-Auth (Clerk requires Convex)");
    changed = true;
  }

  // --- Payment adjustments ---
  if (s.payments === "polar") {
    if (s.auth !== "better-auth") {
      s.payments = "none";
      changes.push("Payments disabled (Polar requires Better-Auth)");
      changed = true;
    }
    if (s.webFrontend === "none") {
      s.payments = "none";
      changes.push("Payments disabled (Polar requires a web frontend)");
      changed = true;
    }
  }

  // --- Addon adjustments ---
  const pwaCompatible = new Set([
    "tanstack-router",
    "react-router",
    "solid",
    "next",
  ]);
  if (s.addons.includes("pwa") && !pwaCompatible.has(s.webFrontend)) {
    s.addons = s.addons.filter((a) => a !== "pwa");
    changes.push("PWA addon removed (requires compatible frontend)");
    changed = true;
  }
  const tauriCompatible = new Set([
    "tanstack-router",
    "react-router",
    "nuxt",
    "svelte",
    "solid",
    "next",
  ]);
  if (s.addons.includes("tauri") && !tauriCompatible.has(s.webFrontend)) {
    s.addons = s.addons.filter((a) => a !== "tauri");
    changes.push("Tauri addon removed (requires a web frontend)");
    changed = true;
  }
  if (s.addons.includes("fumadocs") && s.webFrontend !== "next") {
    s.addons = s.addons.filter((a) => a !== "fumadocs");
    changes.push("Fumadocs addon removed (requires Next.js)");
    changed = true;
  }

  return {
    adjustedStack: changed ? s : null,
    changes,
  };
}
