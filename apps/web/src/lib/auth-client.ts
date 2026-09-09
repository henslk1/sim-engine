import { createAuthClient } from "better-auth/client"

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_SERVER_URL ?? "http://localhost:3000"
})
