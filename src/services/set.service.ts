import { eq, asc } from 'drizzle-orm'
import { db } from '../config/db.config'
import { sets } from '../db/schema'

export const getSetById = async (setId: string) => {
  const results = await db.select().from(sets).where(eq(sets.id, setId)).limit(1)
  return results.length > 0 ? results[0] : null
}

export const getSetsForMatch = async (matchId: string) => {
  return db.select().from(sets).where(eq(sets.matchId, matchId)).orderBy(asc(sets.setNumber))
}

export const createMatchSet = async (data: {
  matchId: string
  setNumber: number
  registration1Score?: number
  registration2Score?: number
  played?: boolean
}) => {
  const result = await db
    .insert(sets)
    .values({
      matchId: data.matchId,
      setNumber: data.setNumber,
      registration1Score: data.registration1Score ?? 0,
      registration2Score: data.registration2Score ?? 0,
      played: data.played ?? false,
    })
    .returning()

  return result.length > 0 ? result[0] : null
}

export const updateSetScore = async (
  setId: string,
  data: {
    registration1Score?: number
    registration2Score?: number
    played?: boolean
  }
) => {
  const result = await db
    .update(sets)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(sets.id, setId))
    .returning()

  return result.length > 0 ? result[0] : null
}

export const markSetAsPlayed = async (setId: string) => {
  const result = await db
    .update(sets)
    .set({ played: true, updatedAt: new Date() })
    .where(eq(sets.id, setId))
    .returning()

  return result.length > 0 ? result[0] : null
}

export const getPlayedSetsForMatch = async (matchId: string) => {
  const allSets = await getSetsForMatch(matchId)
  return allSets.filter((s) => s.played)
}

