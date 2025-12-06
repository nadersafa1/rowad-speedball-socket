import { eq } from 'drizzle-orm'
import { db } from '../config/db.config'
import { registrations, registrationPlayers, players } from '../db/schema'
import { RegistrationData } from '../types/socket.types'

export const enrichRegistrationWithPlayers = async (
  registrationId: string
): Promise<RegistrationData | null> => {
  const regResults = await db
    .select()
    .from(registrations)
    .where(eq(registrations.id, registrationId))
    .limit(1)

  if (regResults.length === 0) return null

  const registration = regResults[0]

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
        image: null,
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

export const getRegistrationById = async (registrationId: string) => {
  const results = await db
    .select()
    .from(registrations)
    .where(eq(registrations.id, registrationId))
    .limit(1)

  return results.length > 0 ? results[0] : null
}

export const updateRegistrationStats = async (
  registrationId: string,
  data: {
    matchesWon?: number
    matchesLost?: number
    setsWon?: number
    setsLost?: number
    points?: number
  }
) => {
  await db
    .update(registrations)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(registrations.id, registrationId))
}

