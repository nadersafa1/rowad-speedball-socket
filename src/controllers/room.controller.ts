import { Socket } from 'socket.io'
import { UserData } from '../middlewares/auth.middleware'
import { checkMatchAccess } from '../utils/authorization'
import { SOCKET_EVENTS } from '../config/constants'
import { JoinMatchData, LeaveMatchData } from '../types/socket.types'

export const joinMatch = async (
  socket: Socket,
  userData: UserData,
  data: JoinMatchData
): Promise<void> => {
  try {
    const { matchId } = data

    if (!matchId) {
      socket.emit(SOCKET_EVENTS.ERROR, 'Match ID is required')
      return
    }

    const accessCheck = await checkMatchAccess(userData, matchId)
    if (!accessCheck.authorized) {
      socket.emit(SOCKET_EVENTS.ERROR, accessCheck.error || 'Access denied')
      return
    }

    socket.join(`match_${matchId}`)
    console.log(`User ${userData.id} joined match ${matchId}`)
  } catch (error) {
    socket.emit(
      SOCKET_EVENTS.ERROR,
      error instanceof Error ? error.message : 'Unknown error'
    )
  }
}

export const leaveMatch = async (
  socket: Socket,
  userData: UserData,
  data: LeaveMatchData
): Promise<void> => {
  try {
    const { matchId } = data

    if (!matchId) {
      socket.emit(SOCKET_EVENTS.ERROR, 'Match ID is required')
      return
    }

    socket.leave(`match_${matchId}`)
    console.log(`User ${userData.id} left match ${matchId}`)
  } catch (error) {
    socket.emit(
      SOCKET_EVENTS.ERROR,
      error instanceof Error ? error.message : 'Unknown error'
    )
  }
}
