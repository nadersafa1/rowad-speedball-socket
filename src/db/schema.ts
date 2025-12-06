import {
  pgTable,
  varchar,
  date,
  timestamp,
  uuid,
  text,
  integer,
  boolean,
} from 'drizzle-orm/pg-core'

// Auth Tables - Minimal schema for authentication
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

// Organization Plugin Tables (for better-auth organization plugin compatibility)
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

// Players Table
export const players = pgTable('players', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  nameRtl: varchar('name_rtl', { length: 255 }),
  dateOfBirth: date('date_of_birth').notNull(),
  gender: text('gender').notNull(),
  preferredHand: text('preferred_hand').notNull(),
  teamLevel: text('team_level').notNull().default('team_c'),
  userId: uuid('user_id').references(() => user.id, { onDelete: 'set null' }),
  organizationId: uuid('organization_id').references(() => organization.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Events Table
// Note: Only include columns that exist in the actual database
// This schema must stay in sync with the frontend schema
export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  eventType: text('event_type').notNull(),
  gender: text('gender').notNull(),
  visibility: text('visibility').notNull().default('public'),
  organizationId: uuid('organization_id').references(() => organization.id, {
    onDelete: 'cascade',
  }),
  registrationStartDate: date('registration_start_date'),
  registrationEndDate: date('registration_end_date'),
  eventDates: text('event_dates').array(),
  bestOf: integer('best_of').notNull(),
  pointsPerWin: integer('points_per_win').notNull().default(3),
  pointsPerLoss: integer('points_per_loss').notNull().default(0),
  format: text('format', {
    enum: ['groups', 'single-elimination', 'groups-knockout'],
  })
    .notNull()
    .default('groups'),
  completed: boolean('completed').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Groups Table
export const groups = pgTable('groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 10 }).notNull(),
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
  seed: integer('seed'),
  matchesWon: integer('matches_won').notNull().default(0),
  matchesLost: integer('matches_lost').notNull().default(0),
  setsWon: integer('sets_won').notNull().default(0),
  setsLost: integer('sets_lost').notNull().default(0),
  points: integer('points').notNull().default(0),
  qualified: boolean('qualified').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Registration Players Junction Table
export const registrationPlayers = pgTable('registration_players', {
  id: uuid('id').primaryKey().defaultRandom(),
  registrationId: uuid('registration_id')
    .notNull()
    .references(() => registrations.id, { onDelete: 'cascade' }),
  playerId: uuid('player_id')
    .notNull()
    .references(() => players.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Matches Table
export const matches = pgTable('matches', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }),
  groupId: uuid('group_id'),
  round: integer('round').notNull(),
  matchNumber: integer('match_number').notNull(),
  // Nullable for BYE matches in single elimination
  registration1Id: uuid('registration1_id'),
  registration2Id: uuid('registration2_id'),
  matchDate: date('match_date'),
  played: boolean('played').notNull().default(false),
  winnerId: uuid('winner_id'),
  // Bracket linking for single elimination
  bracketPosition: integer('bracket_position'),
  winnerTo: uuid('winner_to'),
  winnerToSlot: integer('winner_to_slot'),
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
  played: boolean('played').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Type exports
export type User = typeof user.$inferSelect
export type Session = typeof session.$inferSelect
export type Organization = typeof organization.$inferSelect
export type Member = typeof member.$inferSelect
export type Player = typeof players.$inferSelect
export type Event = typeof events.$inferSelect
export type Group = typeof groups.$inferSelect
export type Registration = typeof registrations.$inferSelect
export type RegistrationPlayer = typeof registrationPlayers.$inferSelect
export type Match = typeof matches.$inferSelect
export type Set = typeof sets.$inferSelect
