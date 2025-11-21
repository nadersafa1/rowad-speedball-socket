# Rowad Speedball Socket Server

Socket server for live match score updates using Express, TypeScript, and Socket.io.

## Overview

This server handles real-time updates for match scores in the Rowad Speedball application. It connects to the same PostgreSQL database as the frontend and validates better-auth sessions for authentication.

## Features

- Real-time match score updates via WebSocket
- Better-auth session validation
- Admin-only score editing
- Match completion validation with bestOf rules
- Automatic match completion when majority is reached

## Prerequisites

- Node.js (v18 or higher)
- PostgreSQL database
- Access to the same database as the frontend

## Installation

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the root directory:
```env
DATABASE_URL=postgresql://user:password@localhost:5432/database_name
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000
```

## Development

Run the development server with hot reload:
```bash
npm run dev
```

## Production

Build the TypeScript code:
```bash
npm run build
```

Start the production server:
```bash
npm start
```

## Environment Variables

- `DATABASE_URL` - PostgreSQL connection string (required)
- `PORT` - Server port (default: 3001)
- `NODE_ENV` - Environment (development/production)
- `CORS_ORIGIN` - Allowed CORS origin (default: http://localhost:3000)

## Socket Events

### Client → Server

- `join-match` - Join a match room to receive live updates
  ```typescript
  { matchId: string }
  ```

- `leave-match` - Leave a match room
  ```typescript
  { matchId: string }
  ```

- `update-set-score` - Update a set's score (admin only)
  ```typescript
  {
    setId: string
    registration1Score: number
    registration2Score: number
    played?: boolean
  }
  ```

- `update-match-status` - Update match status (admin only)
  ```typescript
  {
    matchId: string
    played: boolean
  }
  ```

### Server → Client

- `connect-success` - Connection successful
  ```typescript
  {
    message: string
    userId: string
    isAdmin: boolean
  }
  ```

- `match-score-updated` - Set score was updated
  ```typescript
  {
    matchId: string
    setId: string
    registration1Score: number
    registration2Score: number
    setNumber: number
    played: boolean
  }
  ```

- `match-status-updated` - Match status was updated
  ```typescript
  {
    matchId: string
    played: boolean
    winnerId?: string | null
  }
  ```

- `set-completed` - Set was marked as played
  ```typescript
  {
    matchId: string
    setId: string
    setNumber: number
  }
  ```

- `match-completed` - Match was completed
  ```typescript
  {
    matchId: string
    winnerId: string
  }
  ```

- `err` - Error occurred
  ```typescript
  string | { message: string, error?: string }
  ```

## Authentication

The server validates better-auth sessions by:
1. Extracting the session token from the socket handshake (Authorization header or auth object)
2. Querying the `session` table to validate the token and check expiration
3. Verifying the user exists, email is verified, and user is not banned
4. Checking admin permissions (currently checks user.role for 'admin')

## Database Schema

The server uses a minimal schema with only the required tables:
- `user` - User authentication data
- `session` - Better-auth sessions
- `matches` - Match data
- `sets` - Set scores
- `events` - Event configuration (bestOf, points, etc.)

**Note**: When the frontend schema changes, this schema must be manually updated to stay in sync.

## Testing

See the testing strategy in the plan document. Use `socket.io-client` to create test scripts that connect to the server and test various events.

## Architecture

- **Express** - Web framework
- **Socket.io** - WebSocket library
- **Drizzle ORM** - Database ORM (same as frontend)
- **TypeScript** - Type safety
- **PostgreSQL** - Database (shared with frontend)

## Project Structure

```
src/
├── config/          # Configuration files
├── controllers/     # Socket event handlers
├── db/             # Database schema
├── middlewares/    # Authentication middleware
├── types/          # TypeScript types
├── utils/          # Validation utilities
└── server.ts       # Main server file
```

# rowad-speedball-socket
