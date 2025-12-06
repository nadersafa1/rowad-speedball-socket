import { Server, Socket } from 'socket.io'
import { validateSession, UserData } from '../middlewares/auth.middleware'
import { SOCKET_EVENTS, ERROR_MESSAGES } from '../config/constants'

// Store user connections
export const userConnections = new Map<string, { socketId: string; lastSeen: Date }>()

export const handleConnection = async (
  io: Server,
  socket: Socket
): Promise<{ success: boolean; userData?: UserData; error?: string }> => {
  const token =
    (socket.handshake.headers.authorization as string) ||
    socket.handshake.auth?.authorization ||
    socket.handshake.auth?.token

  if (!token) {
    socket.emit(SOCKET_EVENTS.ERROR, { message: ERROR_MESSAGES.NO_TOKEN })
    return { success: false, error: ERROR_MESSAGES.NO_TOKEN }
  }

  try {
    const authResult = await validateSession(token)

    if (!authResult.success || !authResult.userData) {
      socket.emit(SOCKET_EVENTS.ERROR, {
        message: authResult.error || ERROR_MESSAGES.INVALID_TOKEN,
      })
      return { success: false, error: authResult.error }
    }

    const userData = authResult.userData

    // Store user connection
    userConnections.set(userData.id, {
      socketId: socket.id,
      lastSeen: new Date(),
    })

    // Join user to a room with their ID
    socket.join(userData.id)

    // Store userData in socket data
    ;(socket as any).data = {
      userData,
      tokenData: { token },
    }

    // Emit success
    socket.emit(SOCKET_EVENTS.CONNECT_SUCCESS, {
      message: 'Successfully connected',
      userId: userData.id,
      isAdmin: userData.isAdmin,
    })

    console.log(`User ${userData.id} connected (Admin: ${userData.isAdmin})`)

    return { success: true, userData }
  } catch (error) {
    console.error('Connection error:', error)
    socket.emit(SOCKET_EVENTS.ERROR, {
      message: 'Connection failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    socket.disconnect(true)
    return { success: false, error: 'Connection failed' }
  }
}

export const handleDisconnect = async (io: Server, socket: Socket): Promise<void> => {
  try {
    const userData = (socket as any).data?.userData as UserData | undefined

    if (userData) {
      userConnections.delete(userData.id)
      socket.leave(userData.id)
      console.log(`User ${userData.id} disconnected`)
    }
  } catch (error) {
    console.error('Disconnect error:', error)
  }
}

export const getUserConnections = () => userConnections

