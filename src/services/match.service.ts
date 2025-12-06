import { eq } from 'drizzle-orm'
import { db } from '../config/db.config'
import { matches, events, groups } from '../db/schema'

export const getMatchById = async (matchId: string) => {
  const results = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1)
  return results.length > 0 ? results[0] : null
}

export const getEventById = async (eventId: string) => {
  const results = await db.select().from(events).where(eq(events.id, eventId)).limit(1)
  return results.length > 0 ? results[0] : null
}

export const getGroupById = async (groupId: string) => {
  const results = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1)
  return results.length > 0 ? results[0] : null
}

export const updateMatchStatus = async (
  matchId: string,
  data: {
    played?: boolean
    winnerId?: string | null
    matchDate?: string | null
  }
) => {
  await db
    .update(matches)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(matches.id, matchId))
}

export const getMatchWithEvent = async (matchId: string) => {
  const match = await getMatchById(matchId)
  if (!match) return null

  const event = await getEventById(match.eventId)
  if (!event) return null

  let group = null
  if (match.groupId) {
    group = await getGroupById(match.groupId)
  }

  return { match, event, group }
}

