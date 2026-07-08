import { config } from "dotenv"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"
import { defineConfig } from "prisma/config"

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, "../../.env") })

export default defineConfig({
  schema: "prisma/schema",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: { url: process.env["DATABASE_URL"]! },
})