import { Server, Socket } from 'socket.io'
import { eq, asc } from 'drizzle-orm'
import { db } from '../config/db.config'
import { matches, sets, events, groups } from '../db/schema'
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
import { enrichRegistrationWithPlayers } from '../services/registration.service'

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

    // Get sets
    const matchSets = await db
      .select()
      .from(sets)
      .where(eq(sets.matchId, matchId))
      .orderBy(asc(sets.setNumber))

    // Get group if exists
    let group = null
    if (match.groupId) {
      const groupResults = await db.select().from(groups).where(eq(groups.id, match.groupId)).limit(1)
      if (groupResults.length > 0) {
        group = {
          id: groupResults[0].id,
          name: groupResults[0].name,
          completed: groupResults[0].completed,
        }
      }
    }

    // Get registrations with players
    const registration1 = match.registration1Id
      ? await enrichRegistrationWithPlayers(match.registration1Id)
      : null
    const registration2 = match.registration2Id
      ? await enrichRegistrationWithPlayers(match.registration2Id)
      : null

    const isByeMatch = match.registration1Id === null || match.registration2Id === null

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

