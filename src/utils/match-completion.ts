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

export const isDoubleEliminationFormat = (format: string): boolean => {
  return format === 'double-elimination'
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

/**
 * Checks if a match is effectively a BYE (one player, no pending feeders)
 * and auto-advances the player, cascading through subsequent BYE matches
 */
export const checkAndAutoAdvanceBye = async (
  matchId: string,
  eventId: string
): Promise<void> => {
  // Fetch the match
  const matchResult = await db
    .select()
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1)

  if (matchResult.length === 0) return
  const match = matchResult[0]

  if (match.played) return

  // Check if exactly one registration exists
  const hasReg1 = match.registration1Id !== null
  const hasReg2 = match.registration2Id !== null
  if (hasReg1 === hasReg2) return // Either both or neither - not a BYE

  const soloRegistrationId = match.registration1Id || match.registration2Id

  // Check if any unplayed match can feed into this match
  const eventMatches = await db
    .select()
    .from(matches)
    .where(eq(matches.eventId, eventId))

  const hasPendingFeeder = eventMatches.some(
    (m) => !m.played && (m.winnerTo === matchId || m.loserTo === matchId)
  )

  if (hasPendingFeeder) return // Someone else might arrive

  // This is a BYE - auto-complete the match
  await db
    .update(matches)
    .set({
      winnerId: soloRegistrationId,
      played: true,
      updatedAt: new Date(),
    })
    .where(eq(matches.id, matchId))

  // Advance winner to next match
  if (match.winnerTo && match.winnerToSlot && soloRegistrationId) {
    await advanceWinnerToNextMatch(
      match.winnerTo,
      match.winnerToSlot,
      soloRegistrationId
    )
    // Recursively check the next match
    await checkAndAutoAdvanceBye(match.winnerTo, eventId)
  }
}

/**
 * Handle double elimination match completion
 * Advances winner and routes loser to losers bracket when applicable
 */
export const handleDoubleEliminationMatchCompletion = async (
  match: {
    id: string
    eventId: string
    registration1Id: string | null
    registration2Id: string | null
    winnerTo: string | null
    winnerToSlot: number | null
    loserTo: string | null
    loserToSlot: number | null
  },
  winnerId: string
): Promise<void> => {
  // Advance winner
  if (match.winnerTo && match.winnerToSlot && winnerId) {
    await advanceWinnerToNextMatch(match.winnerTo, match.winnerToSlot, winnerId)
  }

  // Route loser to losers bracket
  const loserId =
    winnerId === match.registration1Id
      ? match.registration2Id
      : match.registration1Id

  if (loserId && match.loserTo && match.loserToSlot) {
    const updateField =
      match.loserToSlot === 1 ? 'registration1Id' : 'registration2Id'
    await db
      .update(matches)
      .set({ [updateField]: loserId, updatedAt: new Date() })
      .where(eq(matches.id, match.loserTo))

    // Check if loser's destination is now a BYE
    await checkAndAutoAdvanceBye(match.loserTo, match.eventId)
  }

  // Check if winner's destination is now a BYE
  if (match.winnerTo) {
    await checkAndAutoAdvanceBye(match.winnerTo, match.eventId)
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

