// Server -> Client response types
import { SetData, RegistrationData, EventData, GroupData } from './entities.types'

export interface MatchScoreUpdatedData {
  matchId: string
  setId: string
  registration1Score: number
  registration2Score: number
  setNumber: number
  played: boolean
}

export interface MatchUpdatedData {
  matchId: string
  played?: boolean
  matchDate?: string
  winnerId?: string | null
}

export interface SetCompletedData {
  matchId: string
  setId: string
  setNumber: number
}

export interface MatchCompletedData {
  matchId: string
  winnerId: string
}

export interface SetCreatedData {
  matchId: string
  set: {
    id: string
    matchId: string
    setNumber: number
    registration1Score: number
    registration2Score: number
    played: boolean
    createdAt: Date
    updatedAt: Date
  }
}

export interface SetPlayedData {
  matchId: string
  set: SetData
  matchCompleted: boolean
  winnerId?: string | null
}

export interface MatchDataResponse {
  id: string
  eventId: string
  groupId?: string | null
  round: number
  matchNumber: number
  registration1Id: string | null
  registration2Id: string | null
  matchDate?: string | null
  played: boolean
  winnerId?: string | null
  bracketPosition?: number | null
  winnerTo?: string | null
  winnerToSlot?: number | null
  createdAt: string
  updatedAt: string
  sets: SetData[]
  bestOf: number
  registration1: RegistrationData | null
  registration2: RegistrationData | null
  event: EventData | null
  group: GroupData | null
  isByeMatch: boolean
}

export interface ConnectSuccessData {
  message: string
  userId: string
  isAdmin: boolean
}

export interface ErrorData {
  message: string
  error?: string
}

