import 'dotenv/config'
import http from 'http'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { Server } from 'socket.io'
import { SocketController } from './controllers/socket.controller'
import { socketConfig } from './config/socket.config'
import { SOCKET_EVENTS } from './config/constants'
import type { UserData } from './middlewares/auth.middleware'

// Initialize Express app
const app = express()

// Create HTTP server
const server = http.createServer(app)

// Create Socket.io instance
const io = new Server(server, socketConfig)

// Security middleware
app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
)

// CORS middleware
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
)

// Handle preflight requests
app.options('*', cors())

// Parse JSON bodies
app.use(express.json())

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Socket connection handler
io.on('connection', async (socket) => {
  // Handle connection and authentication
  const connectionResult = await SocketController.handleConnection(io, socket)

  if (!connectionResult.success) {
    return // Connection failed, socket will be disconnected
  }

  const { userData } = connectionResult

  if (!userData) {
    return
  }

  // Handle join match event
  socket.on(SOCKET_EVENTS.JOIN_MATCH, (data) =>
    SocketController.joinMatch(socket, userData, data)
  )

  // Handle leave match event
  socket.on(SOCKET_EVENTS.LEAVE_MATCH, (data) =>
    SocketController.leaveMatch(socket, userData, data)
  )

  // Handle update set score event (admin only)
  socket.on(SOCKET_EVENTS.UPDATE_SET_SCORE, (data) =>
    SocketController.updateSetScore(io, socket, userData, data)
  )

  // Handle update match status event (admin only)
  socket.on(SOCKET_EVENTS.UPDATE_MATCH_STATUS, (data) =>
    SocketController.updateMatchStatus(io, socket, userData, data)
  )

  // Handle disconnection
  socket.on('disconnect', (reason) => {
    SocketController.handleDisconnect(io, socket)
  })

  // Handle errors
  socket.on('error', (error) => {
    console.error('Socket error:', error)
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
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`)
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server')
  server.close(() => {
    console.log('HTTP server closed')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server')
  server.close(() => {
    console.log('HTTP server closed')
    process.exit(0)
  })
})

export default server
