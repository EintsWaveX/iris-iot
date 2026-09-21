import { defineConfig } from "drizzle-kit";

/**
 * `npx drizzle-kit generate` writes migrations here from src/lib/schema.ts;
 * `npx drizzle-kit migrate` applies them. Both need DATABASE_URL set, which
 * is why CI's migration step runs after `vercel env pull`.
 */
export default defineConfig({
  schema: "./src/lib/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
