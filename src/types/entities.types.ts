// Data entity types
import { Socket } from 'socket.io'
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

