import { Server, Socket } from 'socket.io'
import { UserData } from '../middlewares/auth.middleware'

export interface SocketData {
  userData: UserData
  tokenData?: {
    token: string
  }
}

export type AuthenticatedSocket = Socket & {
  data: SocketData
}

export interface JoinMatchData {
  matchId: string
}

export interface LeaveMatchData {
  matchId: string
}

export interface UpdateSetScoreData {
  setId: string
  registration1Score: number
  registration2Score: number
  played?: boolean
}

export interface UpdateMatchData {
  matchId: string
  played?: boolean
  matchDate?: string // ISO date string (YYYY-MM-DD)
}

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

export interface CreateSetData {
  matchId: string
  setNumber?: number // Optional - auto-calculated if not provided
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

// Get match data types
export interface GetMatchData {
  matchId: string
}

export interface PlayerData {
  id: string
  name: string
  image?: string | null
}

export interface RegistrationData {
  id: string
  eventId: string
  groupId?: string | null
  seed?: number | null
  matchesWon: number
  matchesLost: number
  setsWon: number
  setsLost: number
  points: number
  qualified: boolean
  players: PlayerData[]
}

export interface SetData {
  id: string
  matchId: string
  setNumber: number
  registration1Score: number
  registration2Score: number
  played: boolean
  createdAt: string
  updatedAt: string
}

export interface EventData {
  id: string
  name: string
  eventType: string
  gender: string
  format: string
  bestOf: number
  completed: boolean
  organizationId?: string | null
}

export interface GroupData {
  id: string
  name: string
  completed: boolean
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

// Mark set as played types
export interface MarkSetPlayedData {
  setId: string
}

export interface SetPlayedData {
  matchId: string
  set: SetData
  matchCompleted: boolean
  winnerId?: string | null
}

