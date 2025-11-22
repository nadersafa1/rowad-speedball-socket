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

