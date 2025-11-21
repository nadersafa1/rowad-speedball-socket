import type { ServerOptions } from 'socket.io'

export const socketConfig: Partial<ServerOptions> = {
  path: '/socket.io',
  pingTimeout: 60000, // 60 seconds
  pingInterval: 25000, // 25 seconds
  maxHttpBufferSize: 1e6, // 1MB
  transports: ['websocket', 'polling'],
  allowUpgrades: true,
  perMessageDeflate: true,
  httpCompression: true,
  connectTimeout: 45000, // 45 seconds
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  },
}

