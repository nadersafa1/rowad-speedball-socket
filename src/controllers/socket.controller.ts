import { Server, Socket } from 'socket.io'
import { eq } from 'drizzle-orm'
import { db } from '../config/db.config'
import { matches, sets } from '../db/schema'
import { validateSession, UserData } from '../middlewares/auth.middleware'
import {
  validateSetScore,
  validateSetPlayed,
  validateMatchCompletion,
  checkMajorityAndCompleteMatch,
} from '../utils/validation'
import { SOCKET_EVENTS, ERROR_MESSAGES } from '../config/constants'
import {
  JoinMatchData,
  LeaveMatchData,
  UpdateSetScoreData,
  UpdateMatchStatusData,
  MatchScoreUpdatedData,
  MatchStatusUpdatedData,
  SetCompletedData,
  MatchCompletedData,
} from '../types/socket.types'

export class SocketController {
  // Static property to store user connections
  static userConnections = new Map<
    string,
    { socketId: string; lastSeen: Date }
  >()

  /**
   * Handle socket connection and authentication
   */
  static handleConnection = async (
    io: Server,
    socket: Socket
  ): Promise<{ success: boolean; userData?: UserData; error?: string }> => {
    let token: string | undefined

    // Try to get token from various sources (similar to toby-backend)
    token =
      (socket.handshake.headers.authorization as string) ||
      socket.handshake.auth?.authorization ||
      socket.handshake.auth?.token

    if (!token) {
      socket.emit(SOCKET_EVENTS.ERROR, { message: ERROR_MESSAGES.NO_TOKEN })
      return { success: false, error: ERROR_MESSAGES.NO_TOKEN }
    }

    try {
      // Validate session
      const authResult = await validateSession(token)

      if (!authResult.success || !authResult.userData) {
        socket.emit(SOCKET_EVENTS.ERROR, {
          message: authResult.error || ERROR_MESSAGES.INVALID_TOKEN,
        })
        return { success: false, error: authResult.error }
      }

      const userData = authResult.userData

      // Store user connection
      SocketController.userConnections.set(userData.id, {
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

  /**
   * Handle user disconnection
   */
  static handleDisconnect = async (
    io: Server,
    socket: Socket
  ): Promise<void> => {
    try {
      const userData = (socket as any).data?.userData as UserData | undefined

      if (userData) {
        // Remove user from connections map
        SocketController.userConnections.delete(userData.id)

        // Leave user room
        socket.leave(userData.id)

        console.log(`User ${userData.id} disconnected`)
      }
    } catch (error) {
      console.error('Disconnect error:', error)
    }
  }

  /**
   * Join a match room to receive live updates
   */
  static joinMatch = async (
    socket: Socket,
    userData: UserData,
    data: JoinMatchData
  ): Promise<void> => {
    try {
      const { matchId } = data

      if (!matchId) {
        socket.emit(SOCKET_EVENTS.ERROR, 'Match ID is required')
        return
      }

      // Verify match exists
      const matchResults = await db
        .select()
        .from(matches)
        .where(eq(matches.id, matchId))
        .limit(1)

      if (matchResults.length === 0) {
        socket.emit(SOCKET_EVENTS.ERROR, ERROR_MESSAGES.MATCH_NOT_FOUND)
        return
      }

      // Join the socket room for this match
      socket.join(`match_${matchId}`)

      console.log(`User ${userData.id} joined match ${matchId}`)
    } catch (error) {
      socket.emit(
        SOCKET_EVENTS.ERROR,
        error instanceof Error ? error.message : 'Unknown error'
      )
    }
  }

  /**
   * Leave a match room
   */
  static leaveMatch = async (
    socket: Socket,
    userData: UserData,
    data: LeaveMatchData
  ): Promise<void> => {
    try {
      const { matchId } = data

      if (!matchId) {
        socket.emit(SOCKET_EVENTS.ERROR, 'Match ID is required')
        return
      }

      // Leave the socket room for this match
      socket.leave(`match_${matchId}`)

      console.log(`User ${userData.id} left match ${matchId}`)
    } catch (error) {
      socket.emit(
        SOCKET_EVENTS.ERROR,
        error instanceof Error ? error.message : 'Unknown error'
      )
    }
  }

  /**
   * Update set score (admin only)
   */
  static updateSetScore = async (
    io: Server,
    socket: Socket,
    userData: UserData,
    data: UpdateSetScoreData
  ): Promise<void> => {
    try {
      // Check admin permission
      if (!userData.isAdmin) {
        socket.emit(SOCKET_EVENTS.ERROR, ERROR_MESSAGES.NOT_ADMIN)
        return
      }

      const { setId, registration1Score, registration2Score, played } = data

      if (!setId) {
        socket.emit(SOCKET_EVENTS.ERROR, 'Set ID is required')
        return
      }

      // Validate set score
      const validation = await validateSetScore(
        setId,
        registration1Score,
        registration2Score
      )

      if (!validation.valid) {
        socket.emit(SOCKET_EVENTS.ERROR, validation.error)
        return
      }

      // Get set data
      const setResults = await db
        .select()
        .from(sets)
        .where(eq(sets.id, setId))
        .limit(1)

      if (setResults.length === 0) {
        socket.emit(SOCKET_EVENTS.ERROR, ERROR_MESSAGES.SET_NOT_FOUND)
        return
      }

      const setData = setResults[0]
      const matchId = setData.matchId

      // Update set
      const updateData: any = {
        registration1Score,
        registration2Score,
        updatedAt: new Date(),
      }

      // If played is provided and true, validate before marking as played
      if (played === true && !setData.played) {
        const playedValidation = await validateSetPlayed(
          setId,
          registration1Score,
          registration2Score
        )

        if (!playedValidation.valid) {
          socket.emit(SOCKET_EVENTS.ERROR, playedValidation.error)
          return
        }

        updateData.played = true
      }

      const updatedSet = await db
        .update(sets)
        .set(updateData)
        .where(eq(sets.id, setId))
        .returning()

      if (updatedSet.length === 0) {
        socket.emit(SOCKET_EVENTS.ERROR, 'Failed to update set')
        return
      }

      const updated = updatedSet[0]

      // Emit update to all users in the match room
      const matchScoreData: MatchScoreUpdatedData = {
        matchId,
        setId: updated.id,
        registration1Score: updated.registration1Score,
        registration2Score: updated.registration2Score,
        setNumber: updated.setNumber,
        played: updated.played,
      }

      io.to(`match_${matchId}`).emit(
        SOCKET_EVENTS.MATCH_SCORE_UPDATED,
        matchScoreData
      )

      // If set was marked as played, emit set completed event
      if (updateData.played && !setData.played) {
        const setCompletedData: SetCompletedData = {
          matchId,
          setId: updated.id,
          setNumber: updated.setNumber,
        }

        io.to(`match_${matchId}`).emit(
          SOCKET_EVENTS.SET_COMPLETED,
          setCompletedData
        )

        // Check if match should be auto-completed (majority reached)
        const matchCompletion = await checkMajorityAndCompleteMatch(matchId)

        if (matchCompletion.completed && matchCompletion.winnerId) {
          const matchCompletedData: MatchCompletedData = {
            matchId,
            winnerId: matchCompletion.winnerId,
          }

          io.to(`match_${matchId}`).emit(
            SOCKET_EVENTS.MATCH_COMPLETED,
            matchCompletedData
          )

          // Also emit match status updated
          const matchStatusData: MatchStatusUpdatedData = {
            matchId,
            played: true,
            winnerId: matchCompletion.winnerId,
          }

          io.to(`match_${matchId}`).emit(
            SOCKET_EVENTS.MATCH_STATUS_UPDATED,
            matchStatusData
          )
        }
      }

      console.log(
        `Admin ${userData.id} updated set ${setId} in match ${matchId}`
      )
    } catch (error) {
      socket.emit(
        SOCKET_EVENTS.ERROR,
        error instanceof Error ? error.message : 'Unknown error'
      )
    }
  }

  /**
   * Update match status (admin only)
   */
  static updateMatchStatus = async (
    io: Server,
    socket: Socket,
    userData: UserData,
    data: UpdateMatchStatusData
  ): Promise<void> => {
    try {
      // Check admin permission
      if (!userData.isAdmin) {
        socket.emit(SOCKET_EVENTS.ERROR, ERROR_MESSAGES.NOT_ADMIN)
        return
      }

      const { matchId, played } = data

      if (!matchId) {
        socket.emit(SOCKET_EVENTS.ERROR, 'Match ID is required')
        return
      }

      // Get match
      const matchResults = await db
        .select()
        .from(matches)
        .where(eq(matches.id, matchId))
        .limit(1)

      if (matchResults.length === 0) {
        socket.emit(SOCKET_EVENTS.ERROR, ERROR_MESSAGES.MATCH_NOT_FOUND)
        return
      }

      const match = matchResults[0]

      // If setting played = true, validate match completion
      if (played === true && !match.played) {
        const validation = await validateMatchCompletion(matchId)

        if (!validation.valid) {
          socket.emit(SOCKET_EVENTS.ERROR, validation.error)
          return
        }

        // Update match with winner
        await db
          .update(matches)
          .set({
            played: true,
            winnerId: validation.winnerId,
            updatedAt: new Date(),
          })
          .where(eq(matches.id, matchId))

        // Emit match completed event
        if (validation.winnerId) {
          const matchCompletedData: MatchCompletedData = {
            matchId,
            winnerId: validation.winnerId,
          }

          io.to(`match_${matchId}`).emit(
            SOCKET_EVENTS.MATCH_COMPLETED,
            matchCompletedData
          )
        }
      } else if (played === false && match.played) {
        // Allow unmarking as played (admin only)
        await db
          .update(matches)
          .set({
            played: false,
            winnerId: null,
            updatedAt: new Date(),
          })
          .where(eq(matches.id, matchId))
      }

      // Emit match status updated
      const matchStatusData: MatchStatusUpdatedData = {
        matchId,
        played,
        winnerId: played ? match.winnerId || null : null,
      }

      io.to(`match_${matchId}`).emit(
        SOCKET_EVENTS.MATCH_STATUS_UPDATED,
        matchStatusData
      )

      console.log(`Admin ${userData.id} updated match ${matchId} status`)
    } catch (error) {
      socket.emit(
        SOCKET_EVENTS.ERROR,
        error instanceof Error ? error.message : 'Unknown error'
      )
    }
  }

  /**
   * Get user connections map (for debugging/monitoring)
   */
  static getUserConnections = () => {
    return SocketController.userConnections
  }
}
