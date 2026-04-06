import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: "postgresql://postgres:Mrsus2008AbudalAdel@db.tuxrmdhcdcggqkgnuuye.supabase.co:5432/postgres",
  },
});