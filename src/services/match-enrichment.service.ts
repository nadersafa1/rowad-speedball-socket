import { eq, asc } from 'drizzle-orm'
import { db } from '../config/db.config'
import { matches, sets, events, groups } from '../db/schema'
import { enrichRegistrationWithPlayers } from './registration.service'
import { MatchDataResponse } from '../types/socket.types'

/**
 * Shared match enrichment service for Socket backend.
 * 
 * Ensures consistent match data structure across socket events.
 * 
 * Enriches a match with:
 * - Sets (ordered by setNumber)
 * - Registrations with player data
 * - bestOf from event
 * - Group data (if applicable)
 * - Event data
 * - isByeMatch flag
 */

/**
 * Enriches a match with all related data.
 * 
 * @param match - The match record from database
 * @param event - The event record (must be provided)
 * @returns Enriched match data matching MatchDataResponse type
 */
export async function enrichMatch(
  match: typeof matches.$inferSelect,
  event: typeof events.$inferSelect
): Promise<MatchDataResponse> {
  // Get sets for the match (ordered by setNumber)
  const matchSets = await db
    .select()
    .from(sets)
    .where(eq(sets.matchId, match.id))
    .orderBy(asc(sets.setNumber))

  // Get group data if match has a groupId
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

  // Get registrations with player data
  const registration1 = match.registration1Id
    ? await enrichRegistrationWithPlayers(match.registration1Id)
    : null
  const registration2 = match.registration2Id
    ? await enrichRegistrationWithPlayers(match.registration2Id)
    : null

  const isByeMatch = match.registration1Id === null || match.registration2Id === null

  return {
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
}

