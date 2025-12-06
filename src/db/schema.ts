import {
  pgTable,
  varchar,
  date,
  timestamp,
  uuid,
  text,
  integer,
  boolean,
  pgEnum,
  unique,
} from 'drizzle-orm/pg-core'

// Auth Tables
export const user = pgTable('user', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  role: text('role'),
  banned: boolean('banned'),
  banReason: text('ban_reason'),
  banExpires: timestamp('ban_expires'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// Organization Plugin Tables (managed by better-auth but defined here for TypeScript references)
export const organization = pgTable('organization', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logo: text('logo'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  metadata: text('metadata'),
})

export const member = pgTable('member', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  role: text('role').default('member').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const invitation = pgTable('invitation', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: text('role'),
  status: text('status').default('pending').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  inviterId: uuid('inviter_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
})

export const session = pgTable('session', {
  id: uuid('id').primaryKey().defaultRandom(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: uuid('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  impersonatedBy: text('impersonated_by'),
  activeOrganizationId: uuid('active_organization_id').references(
    () => organization.id,
    { onDelete: 'set null' }
  ),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const account = pgTable('account', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: uuid('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const verification = pgTable('verification', {
  id: uuid('id').primaryKey().defaultRandom(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// Players Table
export const players = pgTable('players', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  nameRtl: varchar('name_rtl', { length: 255 }),
  dateOfBirth: date('date_of_birth').notNull(),
  gender: text('gender', { enum: ['male', 'female'] }).notNull(),
  preferredHand: text('preferred_hand', {
    enum: ['left', 'right', 'both'],
  }).notNull(),
  teamLevel: text('team_level', {
    enum: ['team_a', 'team_b', 'team_c'],
  })
    .notNull()
    .default('team_c'),
  userId: uuid('user_id')
    .references(() => user.id, { onDelete: 'set null' })
    .unique(),
  organizationId: uuid('organization_id').references(() => organization.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const calculateAge = (dateOfBirth: string): number => {
  const today = new Date()
  const birthDate = new Date(dateOfBirth)
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDiff = today.getMonth() - birthDate.getMonth()

  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age--
  }

  return age
}

export const getAgeGroup = (dateOfBirth: string): string => {
  const age = calculateAge(dateOfBirth)

  if (age <= 7) return 'mini'
  if (age <= 9) return 'U-09'
  if (age <= 11) return 'U-11'
  if (age <= 13) return 'U-13'
  if (age <= 15) return 'U-15'
  if (age <= 17) return 'U-17'
  if (age <= 19) return 'U-19'
  if (age <= 21) return 'U-21'
  return 'Seniors'
}

// Tests Table
export const tests = pgTable('tests', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  playingTime: integer('playing_time').notNull(),
  recoveryTime: integer('recovery_time').notNull(),
  dateConducted: date('date_conducted').notNull(),
  description: text('description'),
  visibility: text('visibility', { enum: ['public', 'private'] })
    .notNull()
    .default('public'),
  organizationId: uuid('organization_id').references(() => organization.id, {
    onDelete: 'cascade',
  }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Test Results Table
export const testResults = pgTable('test_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  playerId: uuid('player_id')
    .references(() => players.id, { onDelete: 'cascade' })
    .notNull(),
  testId: uuid('test_id')
    .references(() => tests.id, { onDelete: 'cascade' })
    .notNull(),
  leftHandScore: integer('left_hand_score').notNull(),
  rightHandScore: integer('right_hand_score').notNull(),
  forehandScore: integer('forehand_score').notNull(),
  backhandScore: integer('backhand_score').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const calculateTotalScore = (
  result: Pick<
    typeof testResults.$inferSelect,
    'leftHandScore' | 'rightHandScore' | 'forehandScore' | 'backhandScore'
  >
): number => {
  return (
    result.leftHandScore +
    result.rightHandScore +
    result.forehandScore +
    result.backhandScore
  )
}

// Events Table
// NOTE: eventType enum values must match EVENT_TYPES in src/types/event-types.ts
export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  eventType: text('event_type', {
    enum: [
      'solo',
      'singles',
      'doubles',
      'singles-teams',
      'solo-teams',
      'relay',
    ],
  }).notNull(),
  gender: text('gender', { enum: ['male', 'female', 'mixed'] }).notNull(),
  format: text('format', {
    enum: ['groups', 'single-elimination', 'groups-knockout'],
  })
    .notNull()
    .default('groups'),
  hasThirdPlaceMatch: boolean('has_third_place_match').default(false),
  visibility: text('visibility', { enum: ['public', 'private'] })
    .notNull()
    .default('public'),
  minPlayers: integer('min_players').notNull().default(1),
  maxPlayers: integer('max_players').notNull().default(2),
  registrationStartDate: date('registration_start_date'),
  registrationEndDate: date('registration_end_date'),
  eventDates: text('event_dates').array(), // Array of date strings
  bestOf: integer('best_of').notNull(), // Must be odd: 1, 3, 5, 7, etc.
  pointsPerWin: integer('points_per_win').notNull().default(3),
  pointsPerLoss: integer('points_per_loss').notNull().default(0),
  completed: boolean('completed').notNull().default(false),
  championshipId: uuid('championship_id').references(() => championships.id, {
    onDelete: 'cascade',
  }),
  organizationId: uuid('organization_id').references(() => organization.id, {
    onDelete: 'cascade',
  }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Groups Table
export const groups = pgTable('groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 10 }).notNull(), // Auto-generated: A, B, C...
  completed: boolean('completed').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Registrations Table
export const registrations = pgTable('registrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }),
  groupId: uuid('group_id').references(() => groups.id, {
    onDelete: 'set null',
  }),
  seed: integer('seed'), // Seeding rank for SE events (1 = top seed)
  matchesWon: integer('matches_won').notNull().default(0),
  matchesLost: integer('matches_lost').notNull().default(0),
  setsWon: integer('sets_won').notNull().default(0),
  setsLost: integer('sets_lost').notNull().default(0),
  points: integer('points').notNull().default(0),
  qualified: boolean('qualified').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Registration Players Junction Table (many-to-many)
export const registrationPlayers = pgTable(
  'registration_players',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    registrationId: uuid('registration_id')
      .notNull()
      .references(() => registrations.id, { onDelete: 'cascade' }),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(), // 1, 2, 3, 4... for play order
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    uniqueRegistrationPlayer: unique().on(table.registrationId, table.playerId),
  })
)

// Matches Table
export const matches = pgTable('matches', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }),
  groupId: uuid('group_id').references(() => groups.id, {
    onDelete: 'cascade',
  }),
  round: integer('round').notNull(),
  matchNumber: integer('match_number').notNull(),
  // Nullable for BYE matches in single elimination
  registration1Id: uuid('registration1_id').references(() => registrations.id, {
    onDelete: 'cascade',
  }),
  registration2Id: uuid('registration2_id').references(() => registrations.id, {
    onDelete: 'cascade',
  }),
  matchDate: date('match_date'),
  played: boolean('played').notNull().default(false),
  winnerId: uuid('winner_id').references(() => registrations.id, {
    onDelete: 'set null',
  }),
  // Single elimination specific columns
  bracketPosition: integer('bracket_position'), // Unique position in bracket for rendering
  winnerTo: uuid('winner_to'), // Self-reference to next match (winner advances here)
  winnerToSlot: integer('winner_to_slot'), // Which slot (1 or 2) winner occupies in next match
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Sets Table
export const sets = pgTable('sets', {
  id: uuid('id').primaryKey().defaultRandom(),
  matchId: uuid('match_id')
    .notNull()
    .references(() => matches.id, { onDelete: 'cascade' }),
  setNumber: integer('set_number').notNull(),
  registration1Score: integer('registration1_score').notNull(),
  registration2Score: integer('registration2_score').notNull(),
  played: boolean('played').notNull().default(false), // Sequential validation required
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Coaches Table
export const coaches = pgTable('coaches', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  nameRtl: varchar('name_rtl', { length: 255 }),
  gender: text('gender', { enum: ['male', 'female'] }).notNull(),
  userId: uuid('user_id')
    .references(() => user.id, { onDelete: 'set null' })
    .unique(),
  organizationId: uuid('organization_id').references(() => organization.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Training Sessions Table
export const trainingSessions = pgTable('training_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  intensity: text('intensity', {
    enum: ['high', 'normal', 'low'],
  })
    .notNull()
    .default('normal'),
  type: text('type').array().notNull(),
  date: date('date').notNull(),
  description: text('description'),
  ageGroups: text('age_groups').array().notNull(),
  organizationId: uuid('organization_id').references(() => organization.id, {
    onDelete: 'cascade',
  }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Training Session Coaches Junction Table
export const trainingSessionCoaches = pgTable('training_session_coaches', {
  id: uuid('id').primaryKey().defaultRandom(),
  trainingSessionId: uuid('training_session_id')
    .notNull()
    .references(() => trainingSessions.id, { onDelete: 'cascade' }),
  coachId: uuid('coach_id')
    .notNull()
    .references(() => coaches.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Attendance Status Enum
export const attendanceStatusEnum = pgEnum('attendance_status', [
  'pending',
  'present',
  'late',
  'absent_excused',
  'absent_unexcused',
  'suspended',
])

// Training Session Attendance Table
export const trainingSessionAttendance = pgTable(
  'training_session_attendance',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    trainingSessionId: uuid('training_session_id')
      .notNull()
      .references(() => trainingSessions.id, { onDelete: 'cascade' }),
    status: attendanceStatusEnum('status').notNull().default('pending'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    uniquePlayerSession: unique().on(table.playerId, table.trainingSessionId),
  })
)

// Federations Table
export const federations = pgTable('federations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Federation Clubs Junction Table (many-to-many)
export const federationClubs = pgTable('federation_clubs', {
  id: uuid('id').primaryKey().defaultRandom(),
  federationId: uuid('federation_id')
    .notNull()
    .references(() => federations.id, { onDelete: 'cascade' }),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Championships Table
export const championships = pgTable('championships', {
  id: uuid('id').primaryKey().defaultRandom(),
  federationId: uuid('federation_id')
    .notNull()
    .references(() => federations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  startDate: date('start_date'),
  endDate: date('end_date'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Helper function to format date as "Nov 22, 2025"
export const formatDateForSessionName = (date: Date): string => {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// Type exports
export type Player = typeof players.$inferSelect
export type Test = typeof tests.$inferSelect
export type TestResult = typeof testResults.$inferSelect
export type Event = typeof events.$inferSelect
export type Group = typeof groups.$inferSelect
export type Registration = typeof registrations.$inferSelect
export type RegistrationPlayer = typeof registrationPlayers.$inferSelect
export type Match = typeof matches.$inferSelect
export type Set = typeof sets.$inferSelect
export type Coach = typeof coaches.$inferSelect
export type TrainingSession = typeof trainingSessions.$inferSelect
export type TrainingSessionCoach = typeof trainingSessionCoaches.$inferSelect
export type TrainingSessionAttendance =
  typeof trainingSessionAttendance.$inferSelect
export type Federation = typeof federations.$inferSelect
export type Championship = typeof championships.$inferSelect
export type FederationClub = typeof federationClubs.$inferSelect
export type Organization = typeof organization.$inferSelect
export type Member = typeof member.$inferSelect
export type Invitation = typeof invitation.$inferSelect
