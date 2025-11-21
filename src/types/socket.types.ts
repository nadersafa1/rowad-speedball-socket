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

export interface UpdateMatchStatusData {
  matchId: string
  played: boolean
}

export interface MatchScoreUpdatedData {
  matchId: string
  setId: string
  registration1Score: number
  registration2Score: number
  setNumber: number
  played: boolean
}

export interface MatchStatusUpdatedData {
  matchId: string
  played: boolean
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

