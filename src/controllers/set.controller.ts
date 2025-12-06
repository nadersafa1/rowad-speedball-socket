import { Server, Socket } from 'socket.io'
import { eq, asc } from 'drizzle-orm'
import { db } from '../config/db.config'
import { matches, sets, events } from '../db/schema'
import { UserData } from '../middlewares/auth.middleware'
import { validateSetScore, validateSetPlayed } from '../utils/validation'
import { checkEventUpdateAuthorization } from '../utils/authorization'
import { SOCKET_EVENTS, ERROR_MESSAGES } from '../config/constants'
import {
  CreateSetData,
  UpdateSetScoreData,
  MarkSetPlayedData,
  SetCreatedData,
  MatchScoreUpdatedData,
  SetPlayedData,
  MatchCompletedData,
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

export const createSet = async (
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

    const authCheck = await checkEventUpdateAuthorization(userData, {
      organizationId: event.organizationId,
    })

    if (!authCheck.authorized) {
      socket.emit(SOCKET_EVENTS.ERROR, authCheck.error || 'Permission denied')
      return
    }

    if (match.played) {
      socket.emit(SOCKET_EVENTS.ERROR, ERROR_MESSAGES.MATCH_ALREADY_PLAYED)
      return
    }

    if (!match.matchDate) {
      socket.emit(SOCKET_EVENTS.ERROR, ERROR_MESSAGES.MATCH_DATE_REQUIRED)
      return
    }

    const existingSets = await db
      .select()
      .from(sets)
      .where(eq(sets.matchId, matchId))
      .orderBy(asc(sets.setNumber))

    const calculatedSetNumber = setNumber ?? existingSets.length + 1

    if (calculatedSetNumber > event.bestOf) {
      socket.emit(SOCKET_EVENTS.ERROR, ERROR_MESSAGES.MAX_SETS_REACHED)
      return
    }

    if (existingSets.some((s) => s.setNumber === calculatedSetNumber)) {
      socket.emit(
        SOCKET_EVENTS.ERROR,
        `Set number ${calculatedSetNumber} already exists`
      )
      return
    }

    if (existingSets.length > 0) {
      const unplayedPrevious = existingSets
        .filter((s) => s.setNumber < calculatedSetNumber)
        .filter((s) => !s.played)

      if (unplayedPrevious.length > 0) {
        socket.emit(
          SOCKET_EVENTS.ERROR,
          ERROR_MESSAGES.PREVIOUS_SETS_NOT_PLAYED
        )
        return
      }
    }

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
      `User ${userData.id} created set ${createdSet.id} for match ${matchId}`
    )
  } catch (error) {
    socket.emit(
      SOCKET_EVENTS.ERROR,
      error instanceof Error ? error.message : 'Unknown error'
    )
  }
}

export const updateSetScore = async (
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

    const authCheck = await checkEventUpdateAuthorization(userData, {
      organizationId: event.organizationId,
    })

    if (!authCheck.authorized) {
      socket.emit(SOCKET_EVENTS.ERROR, authCheck.error || 'Permission denied')
      return
    }

    const validation = await validateSetScore(
      setId,
      registration1Score,
      registration2Score
    )

    if (!validation.valid) {
      socket.emit(SOCKET_EVENTS.ERROR, validation.error)
      return
    }

    const updateData: any = {
      registration1Score,
      registration2Score,
      updatedAt: new Date(),
    }

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

    console.log(`User ${userData.id} updated set ${setId} in match ${matchId}`)
  } catch (error) {
    socket.emit(
      SOCKET_EVENTS.ERROR,
      error instanceof Error ? error.message : 'Unknown error'
    )
  }
}

export const markSetPlayed = async (
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

    if (setData.played) {
      socket.emit(SOCKET_EVENTS.ERROR, ERROR_MESSAGES.SET_ALREADY_PLAYED)
      return
    }

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

    const authCheck = await checkEventUpdateAuthorization(userData, {
      organizationId: event.organizationId,
    })

    if (!authCheck.authorized) {
      socket.emit(SOCKET_EVENTS.ERROR, authCheck.error || 'Permission denied')
      return
    }

    const playedValidation = await validateSetPlayed(
      setId,
      setData.registration1Score,
      setData.registration2Score
    )

    if (!playedValidation.valid) {
      socket.emit(SOCKET_EVENTS.ERROR, playedValidation.error)
      return
    }

    const updatedSet = await db
      .update(sets)
      .set({ played: true, updatedAt: new Date() })
      .where(eq(sets.id, setId))
      .returning()

    if (updatedSet.length === 0) {
      socket.emit(SOCKET_EVENTS.ERROR, 'Failed to update set')
      return
    }

    const updated = updatedSet[0]

    const allSets = await db
      .select()
      .from(sets)
      .where(eq(sets.matchId, matchId))
      .orderBy(asc(sets.setNumber))

    const playedSets = allSets.filter((s) => s.played)

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

      await db
        .update(matches)
        .set({ played: true, winnerId, updatedAt: new Date() })
        .where(eq(matches.id, matchId))

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

      if (match.groupId) {
        await updateGroupCompletionStatus(match.groupId)
      }

      await updateEventCompletedStatus(match.eventId)

      const matchCompletedData: MatchCompletedData = { matchId, winnerId }
      io.to(`match_${matchId}`).emit(
        SOCKET_EVENTS.MATCH_COMPLETED,
        matchCompletedData
      )
    }

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
