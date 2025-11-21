import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from '../db/schema'

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set')
  throw new Error(
    'DATABASE_URL is not set. Please add it to your environment variables.'
  )
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Connection pool settings for production
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})

// Test database connection
pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err)
})

// Verify connection on startup
pool
  .query('SELECT NOW()')
  .then(() => {
    console.log('✅ Database connection successful')
  })
  .catch((err) => {
    console.error('❌ Database connection failed:', err.message)
    // Don't exit - let the server start and retry
  })

export const db = drizzle(pool, { schema })
