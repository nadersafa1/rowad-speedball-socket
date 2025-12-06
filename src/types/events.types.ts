// Client -> Server event payloads

export interface JoinMatchData {
  matchId: string
}

export interface LeaveMatchData {
  matchId: string
}

export interface GetMatchData {
  matchId: string
}

export interface CreateSetData {
  matchId: string
  setNumber?: number
}

export interface UpdateSetScoreData {
  setId: string
  registration1Score: number
  registration2Score: number
  played?: boolean
}

export interface MarkSetPlayedData {
  setId: string
}

export interface UpdateMatchData {
  matchId: string
  played?: boolean
  matchDate?: string
}

