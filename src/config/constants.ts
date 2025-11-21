// Socket event names
export const SOCKET_EVENTS = {
  // Client -> Server
  JOIN_MATCH: 'join-match',
  LEAVE_MATCH: 'leave-match',
  UPDATE_SET_SCORE: 'update-set-score',
  UPDATE_MATCH_STATUS: 'update-match-status',

  // Server -> Client
  MATCH_SCORE_UPDATED: 'match-score-updated',
  MATCH_STATUS_UPDATED: 'match-status-updated',
  SET_COMPLETED: 'set-completed',
  MATCH_COMPLETED: 'match-completed',
  ERROR: 'err',
  CONNECT_SUCCESS: 'connect-success',
} as const

// Error messages
export const ERROR_MESSAGES = {
  NO_TOKEN: 'No token provided',
  INVALID_TOKEN: 'Invalid or expired token',
  USER_NOT_FOUND: 'User not found',
  USER_NOT_VERIFIED: 'User email not verified',
  USER_BANNED: 'User is banned',
  NOT_ADMIN: 'Admin access required',
  MATCH_NOT_FOUND: 'Match not found',
  SET_NOT_FOUND: 'Set not found',
  EVENT_NOT_FOUND: 'Event not found',
  UNAUTHORIZED: 'Unauthorized access',
  INVALID_SCORE: 'Invalid score values',
  SET_ALREADY_PLAYED: 'Set is already marked as played',
  MATCH_ALREADY_PLAYED: 'Match is already completed',
} as const

