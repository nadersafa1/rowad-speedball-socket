import { Server, Socket } from 'socket.io'
import { eq, asc } from 'drizzle-orm'
import { db } from '../config/db.config'
import {
  matches,
  sets,
  events,
  groups,
  registrations,
  registrationPlayers,
  players,
} from '../db/schema'
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
  GetMatchData,
  UpdateSetScoreData,
  UpdateMatchData,
  MatchScoreUpdatedData,
  MatchUpdatedData,
  SetCompletedData,
  MatchCompletedData,
  CreateSetData,
  SetCreatedData,
  MatchDataResponse,
  RegistrationData,
  MarkSetPlayedData,
  SetPlayedData,
} from '../types/socket.types'
import {
  isGroupsFormat,
  isSingleEliminationFormat,
  handleGroupsMatchCompletion,
  handleSingleEliminationMatchCompletion,
  updateGroupCompletionStatus,
  updateEventCompletedStatus,
  checkMajorityAndGetWinner,
} from '../utils/match-completion'

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
        socket.emit(SOCKET_EVENTS.ERROR, accessCheck.error || 'Access denied')
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
   * Helper to enrich a registration with player data
   */
  private static async enrichRegistrationWithPlayers(
    registrationId: string
  ): Promise<RegistrationData | null> {
    // Get registration
    const regResults = await db
      .select()
      .from(registrations)
      .where(eq(registrations.id, registrationId))
      .limit(1)

    if (regResults.length === 0) return null

    const registration = regResults[0]

    // Get players for this registration
    const playerLinks = await db
      .select()
      .from(registrationPlayers)
      .where(eq(registrationPlayers.registrationId, registrationId))

    const playerIds = playerLinks.map((link) => link.playerId)
    const playerData = []

    for (const playerId of playerIds) {
      const playerResults = await db
        .select()
        .from(players)
        .where(eq(players.id, playerId))
        .limit(1)

      if (playerResults.length > 0) {
        const player = playerResults[0]
        playerData.push({
          id: player.id,
          name: player.name,
          image: null, // Players table doesn't have image in socket schema
        })
      }
    }

    return {
      id: registration.id,
      eventId: registration.eventId,
      groupId: registration.groupId,
      seed: registration.seed,
      matchesWon: registration.matchesWon,
      matchesLost: registration.matchesLost,
      setsWon: registration.setsWon,
      setsLost: registration.setsLost,
      points: registration.points,
      qualified: registration.qualified,
      players: playerData,
    }
  }

  /**
   * Get match details
   */
  static getMatch = async (
    socket: Socket,
    userData: UserData,
    data: GetMatchData
  ): Promise<void> => {
    try {
      console.log('[getMatch] Handler called with data:', data)
      const { matchId } = data

      if (!matchId) {
        console.log('[getMatch] No matchId provided')
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Match ID is required' })
        return
      }

      console.log('[getMatch] Checking authorization for match:', matchId)
      // Check authorization to access this match
      const accessCheck = await checkMatchAccess(userData, matchId)
      console.log('[getMatch] Access check result:', accessCheck)
      if (!accessCheck.authorized) {
        socket.emit(SOCKET_EVENTS.ERROR, {
          message: accessCheck.error || 'Access denied',
        })
        return
      }

      // Get match
      const matchResults = await db
        .select()
        .from(matches)
        .where(eq(matches.id, matchId))
        .limit(1)

      if (matchResults.length === 0) {
        socket.emit(SOCKET_EVENTS.ERROR, {
          message: ERROR_MESSAGES.MATCH_NOT_FOUND,
        })
        return
      }

      const match = matchResults[0]

      // Get event
      const eventResults = await db
        .select()
        .from(events)
        .where(eq(events.id, match.eventId))
        .limit(1)

      if (eventResults.length === 0) {
        socket.emit(SOCKET_EVENTS.ERROR, {
          message: ERROR_MESSAGES.EVENT_NOT_FOUND,
        })
        return
      }

      const event = eventResults[0]

      // Get sets for the match
      const matchSets = await db
        .select()
        .from(sets)
        .where(eq(sets.matchId, matchId))
        .orderBy(asc(sets.setNumber))

      // Get group if exists
      let group = null
      if (match.groupId) {
        const groupResults = await db
          .select()
          .from(groups)
          .where(eq(groups.id, match.groupId))
          .limit(1)
        if (groupResults.length > 0) {
          group = {
            id: groupResults[0].id,
            name: groupResults[0].name,
            completed: groupResults[0].completed,
          }
        }
      }

      // Get registrations with players
      let registration1: RegistrationData | null = null
      let registration2: RegistrationData | null = null

      if (match.registration1Id) {
        registration1 = await SocketController.enrichRegistrationWithPlayers(
          match.registration1Id
        )
      }

      if (match.registration2Id) {
        registration2 = await SocketController.enrichRegistrationWithPlayers(
          match.registration2Id
        )
      }

      // Determine if BYE match
      const isByeMatch =
        match.registration1Id === null || match.registration2Id === null

      // Build response
      const matchData: MatchDataResponse = {
        id: match.id,
        eventId: match.eventId,
        groupId: match.groupId,
        round: match.round,
        matchNumber: match.matchNumber,
        registration1Id: match.registration1Id,
        registration2Id: match.registration2Id,
        matchDate: match.matchDate,
        played: match.played,
        winnerId: match.winnerId,
        bracketPosition: match.bracketPosition,
        winnerTo: match.winnerTo,
        winnerToSlot: match.winnerToSlot,
        createdAt: match.createdAt.toISOString(),
        updatedAt: match.updatedAt.toISOString(),
        sets: matchSets.map((s) => ({
          id: s.id,
          matchId: s.matchId,
          setNumber: s.setNumber,
          registration1Score: s.registration1Score,
          registration2Score: s.registration2Score,
          played: s.played,
          createdAt: s.createdAt.toISOString(),
          updatedAt: s.updatedAt.toISOString(),
        })),
        bestOf: event.bestOf,
        registration1,
        registration2,
        event: {
          id: event.id,
          name: event.name,
          eventType: event.eventType,
          gender: event.gender,
          format: event.format,
          bestOf: event.bestOf,
          completed: event.completed,
          organizationId: event.organizationId,
        },
        group,
        isByeMatch,
      }

      // Emit match data to requesting socket
      console.log('[getMatch] Emitting match-data to socket:', socket.id)
      socket.emit(SOCKET_EVENTS.MATCH_DATA, matchData)

      console.log(`[getMatch] User ${userData.id} fetched match ${matchId}`)
    } catch (error) {
      console.error('[getMatch] Error fetching match:', error)
      socket.emit(SOCKET_EVENTS.ERROR, {
        message:
          error instanceof Error ? error.message : 'Failed to fetch match',
      })
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
          authCheck.error ||
            'You do not have permission to create sets for this match'
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
   * Mark set as played (admin/coach/owner only)
   * Handles match completion: updates standings for groups, advances winner for SE
   */
  static markSetPlayed = async (
    io: Server,
    socket: Socket,
    userData: UserData,
    data: MarkSetPlayedData
  ): Promise<void> => {
    try {
      const { setId } = data

      if (!setId) {
        socket.emit(SOCKET_EVENTS.ERROR, 'Set ID is required')
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

      // Check if set is already played
      if (setData.played) {
        socket.emit(SOCKET_EVENTS.ERROR, ERROR_MESSAGES.SET_ALREADY_PLAYED)
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

      // Get event for authorization and bestOf
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

      // Check authorization
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

      // Validate set can be marked as played
      const playedValidation = await validateSetPlayed(
        setId,
        setData.registration1Score,
        setData.registration2Score
      )

      if (!playedValidation.valid) {
        socket.emit(SOCKET_EVENTS.ERROR, playedValidation.error)
        return
      }

      // Mark set as played
      const updatedSet = await db
        .update(sets)
        .set({
          played: true,
          updatedAt: new Date(),
        })
        .where(eq(sets.id, setId))
        .returning()

      if (updatedSet.length === 0) {
        socket.emit(SOCKET_EVENTS.ERROR, 'Failed to update set')
        return
      }

      const updated = updatedSet[0]

      // Get all sets for the match to check majority
      const allSets = await db
        .select()
        .from(sets)
        .where(eq(sets.matchId, matchId))
        .orderBy(asc(sets.setNumber))

      const playedSets = allSets.filter((s) => s.played)

      // Check if match is complete (majority reached)
      const majorityResult = checkMajorityAndGetWinner(
        playedSets,
        event.bestOf,
        match
      )

      let matchCompleted = false
      let winnerId: string | null = null

      if (majorityResult.completed && majorityResult.winnerId) {
        matchCompleted = true
        winnerId = majorityResult.winnerId

        // Update match as completed
        await db
          .update(matches)
          .set({
            played: true,
            winnerId,
            updatedAt: new Date(),
          })
          .where(eq(matches.id, matchId))

        // Handle format-specific completion logic
        if (isGroupsFormat(event.format)) {
          await handleGroupsMatchCompletion(
            match,
            event,
            winnerId,
            playedSets.map((s) => ({
              registration1Score: s.registration1Score,
              registration2Score: s.registration2Score,
            }))
          )
        } else if (isSingleEliminationFormat(event.format)) {
          await handleSingleEliminationMatchCompletion(match, winnerId)
        }

        // Update group completion status if applicable
        if (match.groupId) {
          await updateGroupCompletionStatus(match.groupId)
        }

        // Update event completion status
        await updateEventCompletedStatus(match.eventId)

        // Emit match completed event
        const matchCompletedData: MatchCompletedData = {
          matchId,
          winnerId,
        }
        io.to(`match_${matchId}`).emit(
          SOCKET_EVENTS.MATCH_COMPLETED,
          matchCompletedData
        )
      }

      // Emit set played event
      const setPlayedData: SetPlayedData = {
        matchId,
        set: {
          id: updated.id,
          matchId: updated.matchId,
          setNumber: updated.setNumber,
          registration1Score: updated.registration1Score,
          registration2Score: updated.registration2Score,
          played: updated.played,
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
        },
        matchCompleted,
        winnerId,
      }

      io.to(`match_${matchId}`).emit(SOCKET_EVENTS.SET_PLAYED, setPlayedData)

      console.log(
        `User ${userData.id} marked set ${setId} as played. Match completed: ${matchCompleted}`
      )
    } catch (error) {
      console.error('[markSetPlayed] Error:', error)
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
