import { Server } from "socket.io"
import { createAdapter } from "@socket.io/redis-adapter"
import { Redis } from "ioredis"
import type { Server as HttpServer } from "node:http"
import { auth } from "./auth.js"

let io: Server

export function initSocket(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL ?? "http://localhost:5173",
      credentials: true,
    },
  })

  const pubClient = new Redis(process.env.REDIS_URL!)
  const subClient = pubClient.duplicate()
  io.adapter(createAdapter(pubClient, subClient))

  io.use(async (socket, next) => {
    const cookieHeader = socket.handshake.headers.cookie
    if (!cookieHeader) return next(new Error("Unauthorized"))
    const session = await auth.api.getSession({
      headers: new Headers({ cookie: cookieHeader }),
    })
    if (!session) return next(new Error("Unauthorized"))
    socket.data.userId = session.user.id
    next()
  })

  io.on("connection", (socket) => {
    socket.join(`user:${socket.data.userId}`)
  })

  return io
}

export function getIo(): Server {
  if (!io) throw new Error("Socket.io is not initialized")
    return io
}