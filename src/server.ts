import 'dotenv/config'
import http from 'http'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { Server } from 'socket.io'
import { socketConfig } from './config/socket.config'
import { SOCKET_EVENTS } from './config/constants'
import {
  handleConnection,
  handleDisconnect,
  joinMatch,
  leaveMatch,
  getMatch,
  updateMatch,
  createSet,
  updateSetScore,
  markSetPlayed,
} from './controllers'

// Initialize Express app
const app = express()
const server = http.createServer(app)
const io = new Server(server, socketConfig)

// Middleware
app.use(helmet({ crossOriginResourcePolicy: false }))
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}))
app.options('*', cors())
app.use(express.json())

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Socket connection handler
io.on('connection', async (socket) => {
  const connectionResult = await handleConnection(io, socket)

  if (!connectionResult.success || !connectionResult.userData) {
    return
  }

  const { userData } = connectionResult

  // Room events
  socket.on(SOCKET_EVENTS.JOIN_MATCH, (data) => joinMatch(socket, userData, data))
  socket.on(SOCKET_EVENTS.LEAVE_MATCH, (data) => leaveMatch(socket, userData, data))

  // Match events
  socket.on(SOCKET_EVENTS.GET_MATCH, (data) => getMatch(socket, userData, data))
  socket.on(SOCKET_EVENTS.UPDATE_MATCH, (data) => updateMatch(io, socket, userData, data))

  // Set events
  socket.on(SOCKET_EVENTS.CREATE_SET, (data) => createSet(io, socket, userData, data))
  socket.on(SOCKET_EVENTS.UPDATE_SET_SCORE, (data) => updateSetScore(io, socket, userData, data))
  socket.on(SOCKET_EVENTS.MARK_SET_PLAYED, (data) => markSetPlayed(io, socket, userData, data))

  // Disconnect
  socket.on('disconnect', () => handleDisconnect(io, socket))

  // Error
  socket.on('error', (error) => {
    socket.emit(SOCKET_EVENTS.ERROR, {
      message: 'Socket error occurred',
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  })
})

// Start server
const PORT = process.env.PORT || 3001

server.listen(PORT, () => {
  console.log(`Socket server running on port ${PORT}`)
})

// Graceful shutdown
const shutdown = () => {
  server.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

export default server
