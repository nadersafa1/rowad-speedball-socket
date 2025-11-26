import { eq, asc } from 'drizzle-orm'
import { db } from '../config/db.config'
import { matches, sets, events } from '../db/schema'

export interface SetData {
  id: string
  setNumber: number
  registration1Score: number
  registration2Score: number
  played: boolean
}

export interface ValidationResult {
  valid: boolean
  error?: string
  winnerId?: string
}

/**
 * Validates if a set score can be updated
 * Note: Equal scores are allowed during the match, only rejected when marking as played
 */
export const validateSetScore = async (
  setId: string,
  registration1Score: number,
  registration2Score: number
): Promise<ValidationResult> => {
  // Check if scores are non-negative
  if (registration1Score < 0 || registration2Score < 0) {
    return {
      valid: false,
      error: 'Scores must be non-negative',
    }
  }

  // Get set data
  const setResults = await db
    .select()
    .from(sets)
    .where(eq(sets.id, setId))
    .limit(1)

  if (setResults.length === 0) {
    return {
      valid: false,
      error: 'Set not found',
    }
  }

  const setData = setResults[0]

  // Check if set is already played (immutable)
  if (setData.played) {
    return {
      valid: false,
      error: 'Cannot edit a set that is already marked as played',
    }
  }

  // Get match to check if it's played
  const matchResults = await db
    .select()
    .from(matches)
    .where(eq(matches.id, setData.matchId))
    .limit(1)

  if (matchResults.length === 0) {
    return {
      valid: false,
      error: 'Match not found',
    }
  }

  if (matchResults[0].played) {
    return {
      valid: false,
      error: 'Cannot edit sets in a completed match',
    }
  }

  return { valid: true }
}

/**
 * Validates if a set can be marked as played
 */
export const validateSetPlayed = async (
  setId: string,
  registration1Score: number,
  registration2Score: number
): Promise<ValidationResult> => {
  // Check if scores are equal (draw not allowed)
  if (registration1Score === registration2Score) {
    return {
      valid: false,
      error: 'Cannot mark set as played: scores are equal (draw not allowed)',
    }
  }

  // Check if at least one score is greater than 0
  if (registration1Score <= 0 && registration2Score <= 0) {
    return {
      valid: false,
      error: 'At least one score must be greater than 0',
    }
  }

  // Get set data
  const setResults = await db
    .select()
    .from(sets)
    .where(eq(sets.id, setId))
    .limit(1)

  if (setResults.length === 0) {
    return {
      valid: false,
      error: 'Set not found',
    }
  }

  const setData = setResults[0]

  // Get all sets for the match
  const allSets = await db
    .select()
    .from(sets)
    .where(eq(sets.matchId, setData.matchId))
    .orderBy(asc(sets.setNumber))

  // Check if any previous set is not marked as played
  for (let i = 0; i < setData.setNumber - 1; i++) {
    const previousSet = allSets.find((s) => s.setNumber === i + 1)
    if (!previousSet || !previousSet.played) {
      return {
        valid: false,
        error:
          'Cannot mark set as played: previous sets must be marked as played first',
      }
    }
  }

  return { valid: true }
}

/**
 * Validates match completion based on bestOf rules
 */
export const validateMatchCompletion = async (
  matchId: string
): Promise<ValidationResult & { winnerId?: string }> => {
  // Get match
  const matchResults = await db
    .select()
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1)

  if (matchResults.length === 0) {
    return {
      valid: false,
      error: 'Match not found',
    }
  }

  const match = matchResults[0]

  // Get event for bestOf
  const eventResults = await db
    .select()
    .from(events)
    .where(eq(events.id, match.eventId))
    .limit(1)

  if (eventResults.length === 0) {
    return {
      valid: false,
      error: 'Event not found',
    }
  }

  const event = eventResults[0]
  const bestOf = event.bestOf

  // Get all sets for the match
  const allSets = await db
    .select()
    .from(sets)
    .where(eq(sets.matchId, matchId))
    .orderBy(asc(sets.setNumber))

  // Check if all sets are marked as played
  const unplayedSets = allSets.filter((s) => !s.played)
  if (unplayedSets.length > 0) {
    return {
      valid: false,
      error: 'Cannot mark match as played: all sets must be marked as played first',
    }
  }

  // Count sets won by each registration
  const playedSets = allSets.filter((s) => s.played)
  let registration1Wins = 0
  let registration2Wins = 0

  for (const set of playedSets) {
    if (set.registration1Score > set.registration2Score) {
      registration1Wins++
    } else if (set.registration2Score > set.registration1Score) {
      registration2Wins++
    }
  }

  // Check if tie (same sets won)
  if (registration1Wins === registration2Wins) {
    return {
      valid: false,
      error: 'Cannot determine winner: both players won equal sets',
    }
  }

  // Check if one player reached majority
  const majority = Math.ceil(bestOf / 2)
  if (registration1Wins < majority && registration2Wins < majority) {
    return {
      valid: false,
      error: 'No player has reached majority yet',
    }
  }

  // Determine winner
  const winnerId =
    registration1Wins >= majority
      ? match.registration1Id
      : match.registration2Id

  return {
    valid: true,
    winnerId,
  }
}

/**
 * Checks if a player has reached majority and match should be auto-completed
 * 
 * @deprecated This function is no longer used by the socket service.
 * Match completion is handled by the REST API to ensure registration standings
 * are updated correctly. This function is kept for reference but should not be called.
 */
export const checkMajorityAndCompleteMatch = async (
  matchId: string
): Promise<{ winnerId: string | null; completed: boolean }> => {
  // Get match
  const matchResults = await db
    .select()
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1)

  if (matchResults.length === 0) {
    return { winnerId: null, completed: false }
  }

  const match = matchResults[0]

  // Get event for bestOf
  const eventResults = await db
    .select()
    .from(events)
    .where(eq(events.id, match.eventId))
    .limit(1)

  if (eventResults.length === 0) {
    return { winnerId: null, completed: false }
  }

  const event = eventResults[0]
  const bestOf = event.bestOf
  const majority = Math.ceil(bestOf / 2)

  // Get all played sets
  const allSets = await db
    .select()
    .from(sets)
    .where(eq(sets.matchId, matchId))
    .orderBy(asc(sets.setNumber))

  const playedSets = allSets.filter((s) => s.played)
  let registration1Wins = 0
  let registration2Wins = 0

  for (const set of playedSets) {
    if (set.registration1Score > set.registration2Score) {
      registration1Wins++
    } else if (set.registration2Score > set.registration1Score) {
      registration2Wins++
    }
  }

  // Check if one player reached majority
  if (registration1Wins >= majority || registration2Wins >= majority) {
    const winnerId =
      registration1Wins >= majority
        ? match.registration1Id
        : match.registration2Id

    // Update match: set winner, mark as played
    await db
      .update(matches)
      .set({
        winnerId,
        played: true,
        updatedAt: new Date(),
      })
      .where(eq(matches.id, matchId))

    // Mark all remaining unplayed sets as played
    for (const set of allSets) {
      if (!set.played) {
        await db
          .update(sets)
          .set({
            played: true,
            updatedAt: new Date(),
          })
          .where(eq(sets.id, set.id))
      }
    }

    return { winnerId, completed: true }
  }

  return { winnerId: null, completed: false }
}

