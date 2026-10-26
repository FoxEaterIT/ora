import { defineConfig } from "prisma/config";
const databaseUrl = process.env.ORA_TEST_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim() || "";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url: databaseUrl || "file:./prisma/ORA.db",
  },
});
