import { Server, Socket } from 'socket.io'
import { eq } from 'drizzle-orm'
import { db } from '../config/db.config'
import { matches, events } from '../db/schema'
import { UserData } from '../middlewares/auth.middleware'
import { validateMatchCompletion } from '../utils/validation'
import { checkMatchAccess, checkEventUpdateAuthorization } from '../utils/authorization'
import { SOCKET_EVENTS, ERROR_MESSAGES } from '../config/constants'
import {
  GetMatchData,
  UpdateMatchData,
  MatchDataResponse,
  MatchUpdatedData,
  MatchCompletedData,
} from '../types/socket.types'
import { enrichMatch } from '../services/match-enrichment.service'

export const getMatch = async (
  socket: Socket,
  userData: UserData,
  data: GetMatchData
): Promise<void> => {
  try {
    const { matchId } = data

    if (!matchId) {
      socket.emit(SOCKET_EVENTS.ERROR, { message: 'Match ID is required' })
      return
    }

    const accessCheck = await checkMatchAccess(userData, matchId)
    if (!accessCheck.authorized) {
      socket.emit(SOCKET_EVENTS.ERROR, { message: accessCheck.error || 'Access denied' })
      return
    }

    // Get match
    const matchResults = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1)

    if (matchResults.length === 0) {
      socket.emit(SOCKET_EVENTS.ERROR, { message: ERROR_MESSAGES.MATCH_NOT_FOUND })
      return
    }

    const match = matchResults[0]

    // Get event
    const eventResults = await db.select().from(events).where(eq(events.id, match.eventId)).limit(1)

    if (eventResults.length === 0) {
      socket.emit(SOCKET_EVENTS.ERROR, { message: ERROR_MESSAGES.EVENT_NOT_FOUND })
      return
    }

    const event = eventResults[0]

    // Use shared enrichment service
    const matchData = await enrichMatch(match, event)

    socket.emit(SOCKET_EVENTS.MATCH_DATA, matchData)
    console.log(`User ${userData.id} fetched match ${matchId}`)
  } catch (error) {
    console.error('[getMatch] Error:', error)
    socket.emit(SOCKET_EVENTS.ERROR, {
      message: error instanceof Error ? error.message : 'Failed to fetch match',
    })
  }
}

export const updateMatch = async (
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

    const matchResults = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1)

    if (matchResults.length === 0) {
      socket.emit(SOCKET_EVENTS.ERROR, ERROR_MESSAGES.MATCH_NOT_FOUND)
      return
    }

    const match = matchResults[0]

    const eventResults = await db.select().from(events).where(eq(events.id, match.eventId)).limit(1)

    if (eventResults.length === 0) {
      socket.emit(SOCKET_EVENTS.ERROR, 'Event not found')
      return
    }

    const event = eventResults[0]

    const authCheck = await checkEventUpdateAuthorization(userData, {
      organizationId: event.organizationId,
    })

    if (!authCheck.authorized) {
      socket.emit(SOCKET_EVENTS.ERROR, authCheck.error || 'Permission denied')
      return
    }

    const updateData: {
      played?: boolean
      winnerId?: string | null
      matchDate?: string | null
      updatedAt: Date
    } = { updatedAt: new Date() }

    if (played !== undefined) {
      if (played === true && !match.played) {
        const validation = await validateMatchCompletion(matchId)

        if (!validation.valid) {
          socket.emit(SOCKET_EVENTS.ERROR, validation.error)
          return
        }

        updateData.played = true
        updateData.winnerId = validation.winnerId

        if (validation.winnerId) {
          const matchCompletedData: MatchCompletedData = { matchId, winnerId: validation.winnerId }
          io.to(`match_${matchId}`).emit(SOCKET_EVENTS.MATCH_COMPLETED, matchCompletedData)
        }
      } else if (played === false && match.played) {
        updateData.played = false
        updateData.winnerId = null
      }
    }

    if (matchDate !== undefined) {
      updateData.matchDate = matchDate || null
    }

    await db.update(matches).set(updateData).where(eq(matches.id, matchId))

    const updatedMatchResults = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1)
    const updatedMatch = updatedMatchResults[0]

    const matchUpdatedData: MatchUpdatedData = {
      matchId,
      played: updatedMatch.played,
      matchDate: updatedMatch.matchDate || undefined,
      winnerId: updatedMatch.winnerId || null,
    }

    io.to(`match_${matchId}`).emit(SOCKET_EVENTS.MATCH_UPDATED, matchUpdatedData)
    console.log(`User ${userData.id} updated match ${matchId}`)
  } catch (error) {
    socket.emit(SOCKET_EVENTS.ERROR, error instanceof Error ? error.message : 'Unknown error')
  }
}

