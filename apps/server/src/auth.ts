import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { db } from "@sim-engine/db"

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  secret: process.env["BETTER_AUTH_SECRET"]!,
  baseURL: process.env["BETTER_AUTH_URL"]!,
  trustedOrigins: ["http://localhost:5173"],
  emailAndPassword: { enabled: true },
  socialProviders: {
    google: {
      clientId: process.env["GOOGLE_CLIENT_ID"] ?? "",
      clientSecret: process.env["GOOGLE_CLIENT_SECRET"] ?? "",
    },
    discord: {
      clientId: process.env["DISCORD_CLIENT_ID"] ?? "",
      clientSecret: process.env["DISCORD_CLIENT_SECRET"] ?? "",
    },
  },
})
