// Socket event names
export const SOCKET_EVENTS = {
  // Client -> Server
  JOIN_MATCH: 'join-match',
  LEAVE_MATCH: 'leave-match',
  GET_MATCH: 'get-match',
  UPDATE_SET_SCORE: 'update-set-score',
  UPDATE_MATCH: 'update-match',
  CREATE_SET: 'create-set',
  MARK_SET_PLAYED: 'mark-set-played',

  // Server -> Client
  MATCH_DATA: 'match-data',
  MATCH_SCORE_UPDATED: 'match-score-updated',
  MATCH_UPDATED: 'match-updated',
  MATCH_COMPLETED: 'match-completed',
  SET_CREATED: 'set-created',
  SET_PLAYED: 'set-played',
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
  MATCH_DATE_REQUIRED: 'Match date must be set before creating sets',
  MAX_SETS_REACHED: 'Maximum number of sets reached for this match',
  PREVIOUS_SETS_NOT_PLAYED:
    'All previous sets must be played before creating a new set',
} as const
