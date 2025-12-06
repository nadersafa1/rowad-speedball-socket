// Match Completion Utilities for Socket Server

import { eq } from 'drizzle-orm'
import { db } from '../config/db.config'
import { matches, events, groups, registrations, sets } from '../db/schema'

export interface SetResult {
  registration1Score: number
  registration2Score: number
}

// Format helpers
export const isGroupsFormat = (format: string): boolean => {
  return format === 'groups' || format === 'groups-knockout'
}

export const isSingleEliminationFormat = (format: string): boolean => {
  return format === 'single-elimination'
}

// Points calculation
export const calculateMatchPoints = (
  winnerId: string,
  registration1Id: string,
  registration2Id: string,
  pointsPerWin: number,
  pointsPerLoss: number
) => {
  const registration1Won = winnerId === registration1Id
  const registration2Won = winnerId === registration2Id

  return {
    registration1Points: registration1Won ? pointsPerWin : pointsPerLoss,
    registration2Points: registration2Won ? pointsPerWin : pointsPerLoss,
    registration1Won,
    registration2Won,
  }
}

export const calculateSetPoints = (setResults: SetResult[]) => {
  let registration1SetsWon = 0
  let registration1SetsLost = 0
  let registration2SetsWon = 0
  let registration2SetsLost = 0

  for (const set of setResults) {
    if (set.registration1Score > set.registration2Score) {
      registration1SetsWon++
      registration2SetsLost++
    } else if (set.registration2Score > set.registration1Score) {
      registration2SetsWon++
      registration1SetsLost++
    }
  }

  return {
    registration1SetsWon,
    registration1SetsLost,
    registration2SetsWon,
    registration2SetsLost,
  }
}

// Update registration standings for groups format
export const updateRegistrationStandings = async (
  registration1Id: string,
  registration2Id: string,
  matchResult: {
    registration1Won: boolean
    registration1Points: number
    registration2Won: boolean
    registration2Points: number
  },
  setResults: {
    registration1SetsWon: number
    registration1SetsLost: number
    registration2SetsWon: number
    registration2SetsLost: number
  }
): Promise<void> => {
  // Update registration 1
  const reg1Result = await db
    .select()
    .from(registrations)
    .where(eq(registrations.id, registration1Id))
    .limit(1)

  if (reg1Result.length > 0) {
    const reg1 = reg1Result[0]
    await db
      .update(registrations)
      .set({
        matchesWon: reg1.matchesWon + (matchResult.registration1Won ? 1 : 0),
        matchesLost: reg1.matchesLost + (matchResult.registration1Won ? 0 : 1),
        setsWon: reg1.setsWon + setResults.registration1SetsWon,
        setsLost: reg1.setsLost + setResults.registration1SetsLost,
        points: reg1.points + matchResult.registration1Points,
        updatedAt: new Date(),
      })
      .where(eq(registrations.id, registration1Id))
  }

  // Update registration 2
  const reg2Result = await db
    .select()
    .from(registrations)
    .where(eq(registrations.id, registration2Id))
    .limit(1)

  if (reg2Result.length > 0) {
    const reg2 = reg2Result[0]
    await db
      .update(registrations)
      .set({
        matchesWon: reg2.matchesWon + (matchResult.registration2Won ? 1 : 0),
        matchesLost: reg2.matchesLost + (matchResult.registration2Won ? 0 : 1),
        setsWon: reg2.setsWon + setResults.registration2SetsWon,
        setsLost: reg2.setsLost + setResults.registration2SetsLost,
        points: reg2.points + matchResult.registration2Points,
        updatedAt: new Date(),
      })
      .where(eq(registrations.id, registration2Id))
  }
}

// Advance winner to next match for single elimination
export const advanceWinnerToNextMatch = async (
  nextMatchId: string,
  slot: number,
  winnerId: string
): Promise<void> => {
  const updateField = slot === 1 ? 'registration1Id' : 'registration2Id'

  await db
    .update(matches)
    .set({
      [updateField]: winnerId,
      updatedAt: new Date(),
    })
    .where(eq(matches.id, nextMatchId))
}

// Update group completion status
export const updateGroupCompletionStatus = async (
  groupId: string
): Promise<void> => {
  const groupMatches = await db
    .select()
    .from(matches)
    .where(eq(matches.groupId, groupId))

  const allMatchesPlayed = groupMatches.every((m) => m.played)

  await db
    .update(groups)
    .set({ completed: allMatchesPlayed, updatedAt: new Date() })
    .where(eq(groups.id, groupId))
}

// Update event completion status
export const updateEventCompletedStatus = async (
  eventId: string
): Promise<void> => {
  const allMatches = await db
    .select()
    .from(matches)
    .where(eq(matches.eventId, eventId))

  if (allMatches.length === 0) {
    await db
      .update(events)
      .set({ completed: false, updatedAt: new Date() })
      .where(eq(events.id, eventId))
    return
  }

  const hasUnplayedMatches = allMatches.some((m) => !m.played)
  const completed = !hasUnplayedMatches

  await db
    .update(events)
    .set({ completed, updatedAt: new Date() })
    .where(eq(events.id, eventId))
}

// Handle groups format match completion
export const handleGroupsMatchCompletion = async (
  match: {
    id: string
    registration1Id: string | null
    registration2Id: string | null
    eventId: string
    groupId: string | null
  },
  event: { pointsPerWin: number; pointsPerLoss: number },
  winnerId: string,
  playedSets: SetResult[]
): Promise<void> => {
  if (!match.registration1Id || !match.registration2Id) {
    return
  }

  const matchPoints = calculateMatchPoints(
    winnerId,
    match.registration1Id,
    match.registration2Id,
    event.pointsPerWin,
    event.pointsPerLoss
  )

  const setResults = calculateSetPoints(playedSets)

  await updateRegistrationStandings(
    match.registration1Id,
    match.registration2Id,
    matchPoints,
    setResults
  )
}

// Handle single elimination match completion
export const handleSingleEliminationMatchCompletion = async (
  match: {
    winnerTo: string | null
    winnerToSlot: number | null
  },
  winnerId: string
): Promise<void> => {
  if (match.winnerTo && match.winnerToSlot && winnerId) {
    await advanceWinnerToNextMatch(match.winnerTo, match.winnerToSlot, winnerId)
  }
}

// Check majority and determine winner
export const checkMajorityAndGetWinner = (
  playedSets: { registration1Score: number; registration2Score: number }[],
  bestOf: number,
  match: { registration1Id: string | null; registration2Id: string | null }
): { winnerId: string | null; completed: boolean } => {
  const majority = Math.ceil(bestOf / 2)
  let registration1Wins = 0
  let registration2Wins = 0

  for (const set of playedSets) {
    if (set.registration1Score > set.registration2Score) {
      registration1Wins++
    } else if (set.registration2Score > set.registration1Score) {
      registration2Wins++
    }
  }

  if (registration1Wins >= majority || registration2Wins >= majority) {
    const winnerId =
      registration1Wins >= majority
        ? match.registration1Id
        : match.registration2Id

    return { winnerId, completed: true }
  }

  return { winnerId: null, completed: false }
}

