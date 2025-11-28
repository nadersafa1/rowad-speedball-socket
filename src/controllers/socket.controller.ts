import { Server, Socket } from 'socket.io'
import { eq, asc } from 'drizzle-orm'
import { db } from '../config/db.config'
import { matches, sets, events } from '../db/schema'
import { validateSession, UserData } from '../middlewares/auth.middleware'
import {
  validateSetScore,
  validateSetPlayed,
  validateMatchCompletion,
} from '../utils/validation'
import {
  checkMatchAccess,
  checkEventUpdateAuthorization,
} from '../utils/authorization'
import { SOCKET_EVENTS, ERROR_MESSAGES } from '../config/constants'
import {
  JoinMatchData,
  LeaveMatchData,
  UpdateSetScoreData,
  UpdateMatchData,
  MatchScoreUpdatedData,
  MatchUpdatedData,
  SetCompletedData,
  MatchCompletedData,
  CreateSetData,
  SetCreatedData,
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

      // Check authorization to access this match
      const accessCheck = await checkMatchAccess(userData, matchId)
      if (!accessCheck.authorized) {
        socket.emit(
          SOCKET_EVENTS.ERROR,
          accessCheck.error || 'Access denied'
        )
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
   * Update set score (admin/coach/owner only)
   */
  static updateSetScore = async (
    io: Server,
    socket: Socket,
    userData: UserData,
    data: UpdateSetScoreData
  ): Promise<void> => {
    try {
      const { setId, registration1Score, registration2Score, played } = data

      if (!setId) {
        socket.emit(SOCKET_EVENTS.ERROR, 'Set ID is required')
        return
      }

      // Get set data to find match
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

      // Get match and event for authorization
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

      // Get event for authorization check
      const eventResults = await db
        .select()
        .from(events)
        .where(eq(events.id, match.eventId))
        .limit(1)

      if (eventResults.length === 0) {
        socket.emit(SOCKET_EVENTS.ERROR, 'Event not found')
        return
      }

      const event = eventResults[0]

      // Check authorization to update this event
      const authCheck = await checkEventUpdateAuthorization(userData, {
        organizationId: event.organizationId,
      })

      if (!authCheck.authorized) {
        socket.emit(
          SOCKET_EVENTS.ERROR,
          authCheck.error || 'You do not have permission to update this match'
        )
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

        // Note: Match completion is handled by the REST API to ensure
        // registration standings are updated correctly
      }

      console.log(
        `User ${userData.id} updated set ${setId} in match ${matchId}`
      )
    } catch (error) {
      socket.emit(
        SOCKET_EVENTS.ERROR,
        error instanceof Error ? error.message : 'Unknown error'
      )
    }
  }

  /**
   * Update match (admin/coach/owner only)
   * Supports updating played status and matchDate
   */
  static updateMatch = async (
    io: Server,
    socket: Socket,
    userData: UserData,
    data: UpdateMatchData
  ): Promise<void> => {
    try {
      const { matchId, played, matchDate } = data

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

      // Get event for authorization check
      const eventResults = await db
        .select()
        .from(events)
        .where(eq(events.id, match.eventId))
        .limit(1)

      if (eventResults.length === 0) {
        socket.emit(SOCKET_EVENTS.ERROR, 'Event not found')
        return
      }

      const event = eventResults[0]

      // Check authorization to update this event
      const authCheck = await checkEventUpdateAuthorization(userData, {
        organizationId: event.organizationId,
      })

      if (!authCheck.authorized) {
        socket.emit(
          SOCKET_EVENTS.ERROR,
          authCheck.error || 'You do not have permission to update this match'
        )
        return
      }

      // Build update object
      const updateData: {
        played?: boolean
        winnerId?: string | null
        matchDate?: string | null
        updatedAt: Date
      } = {
        updatedAt: new Date(),
      }

      // Handle played status update
      if (played !== undefined) {
        // If setting played = true, validate match completion
        if (played === true && !match.played) {
          const validation = await validateMatchCompletion(matchId)

          if (!validation.valid) {
            socket.emit(SOCKET_EVENTS.ERROR, validation.error)
            return
          }

          // Update match with winner
          updateData.played = true
          updateData.winnerId = validation.winnerId

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
          updateData.played = false
          updateData.winnerId = null
        }
      }

      // Handle matchDate update
      if (matchDate !== undefined) {
        updateData.matchDate = matchDate || null
      }

      // Update match in database
      await db.update(matches).set(updateData).where(eq(matches.id, matchId))

      // Get updated match to include in response
      const updatedMatchResults = await db
        .select()
        .from(matches)
        .where(eq(matches.id, matchId))
        .limit(1)

      const updatedMatch = updatedMatchResults[0]

      // Emit match updated event
      const matchUpdatedData: MatchUpdatedData = {
        matchId,
        played: updatedMatch.played,
        matchDate: updatedMatch.matchDate || undefined,
        winnerId: updatedMatch.winnerId || null,
      }

      io.to(`match_${matchId}`).emit(
        SOCKET_EVENTS.MATCH_UPDATED,
        matchUpdatedData
      )

      console.log(`User ${userData.id} updated match ${matchId}`)
    } catch (error) {
      socket.emit(
        SOCKET_EVENTS.ERROR,
        error instanceof Error ? error.message : 'Unknown error'
      )
    }
  }

  /**
   * Create a new set (admin/coach/owner only)
   */
  static createSet = async (
    io: Server,
    socket: Socket,
    userData: UserData,
    data: CreateSetData
  ): Promise<void> => {
    try {
      const { matchId, setNumber } = data

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

      // Get event for authorization check and bestOf
      const eventResults = await db
        .select()
        .from(events)
        .where(eq(events.id, match.eventId))
        .limit(1)

      if (eventResults.length === 0) {
        socket.emit(SOCKET_EVENTS.ERROR, ERROR_MESSAGES.EVENT_NOT_FOUND)
        return
      }

      const event = eventResults[0]

      // Check authorization to update this event
      const authCheck = await checkEventUpdateAuthorization(userData, {
        organizationId: event.organizationId,
      })

      if (!authCheck.authorized) {
        socket.emit(
          SOCKET_EVENTS.ERROR,
          authCheck.error || 'You do not have permission to create sets for this match'
        )
        return
      }

      // Validate match is not completed
      if (match.played) {
        socket.emit(SOCKET_EVENTS.ERROR, ERROR_MESSAGES.MATCH_ALREADY_PLAYED)
        return
      }

      // Validate match date is set
      if (!match.matchDate) {
        socket.emit(SOCKET_EVENTS.ERROR, ERROR_MESSAGES.MATCH_DATE_REQUIRED)
        return
      }
      const bestOf = event.bestOf

      // Get existing sets for the match
      const existingSets = await db
        .select()
        .from(sets)
        .where(eq(sets.matchId, matchId))
        .orderBy(asc(sets.setNumber))

      // Calculate set number if not provided
      let calculatedSetNumber: number
      if (setNumber !== undefined) {
        calculatedSetNumber = setNumber
      } else {
        // Auto-calculate as next sequential number
        calculatedSetNumber = existingSets.length + 1
      }

      // Validate set number doesn't exceed bestOf
      if (calculatedSetNumber > bestOf) {
        socket.emit(SOCKET_EVENTS.ERROR, ERROR_MESSAGES.MAX_SETS_REACHED)
        return
      }

      // Validate set number doesn't already exist
      const setNumberExists = existingSets.some(
        (s) => s.setNumber === calculatedSetNumber
      )
      if (setNumberExists) {
        socket.emit(
          SOCKET_EVENTS.ERROR,
          `Set number ${calculatedSetNumber} already exists for this match`
        )
        return
      }

      // Validate all previous sets are played (if any exist)
      if (existingSets.length > 0) {
        const previousSets = existingSets.filter(
          (s) => s.setNumber < calculatedSetNumber
        )
        const unplayedPreviousSets = previousSets.filter((s) => !s.played)

        if (unplayedPreviousSets.length > 0) {
          socket.emit(
            SOCKET_EVENTS.ERROR,
            ERROR_MESSAGES.PREVIOUS_SETS_NOT_PLAYED
          )
          return
        }
      }

      // Create set with initial scores (0-0)
      const newSet = await db
        .insert(sets)
        .values({
          matchId,
          setNumber: calculatedSetNumber,
          registration1Score: 0,
          registration2Score: 0,
          played: false,
        })
        .returning()

      if (newSet.length === 0) {
        socket.emit(SOCKET_EVENTS.ERROR, 'Failed to create set')
        return
      }

      const createdSet = newSet[0]

      // Emit set created event to all users in the match room
      const setCreatedData: SetCreatedData = {
        matchId,
        set: {
          id: createdSet.id,
          matchId: createdSet.matchId,
          setNumber: createdSet.setNumber,
          registration1Score: createdSet.registration1Score,
          registration2Score: createdSet.registration2Score,
          played: createdSet.played,
          createdAt: createdSet.createdAt,
          updatedAt: createdSet.updatedAt,
        },
      }

      io.to(`match_${matchId}`).emit(SOCKET_EVENTS.SET_CREATED, setCreatedData)

      console.log(
        `User ${userData.id} created set ${createdSet.id} (set ${calculatedSetNumber}) for match ${matchId}`
      )
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
