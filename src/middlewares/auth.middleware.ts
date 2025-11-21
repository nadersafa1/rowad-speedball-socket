import { eq, and, gt } from 'drizzle-orm'
import { db } from '../config/db.config'
import { session, user } from '../db/schema'
import { ERROR_MESSAGES } from '../config/constants'

export interface UserData {
  id: string
  name: string
  email: string
  emailVerified: boolean
  role: string | null
  isAdmin: boolean
}

export interface AuthResult {
  success: boolean
  userData?: UserData
  error?: string
}

/**
 * Validates better-auth session token and returns user data
 * Checks session expiration, user verification, and admin status
 */
export const validateSession = async (
  token: string
): Promise<AuthResult> => {
  try {
    if (!token) {
      return {
        success: false,
        error: ERROR_MESSAGES.NO_TOKEN,
      }
    }

    // Find session by token
    const sessions = await db
      .select()
      .from(session)
      .where(
        and(
          eq(session.token, token),
          gt(session.expiresAt, new Date())
        )
      )
      .limit(1)

    if (sessions.length === 0) {
      return {
        success: false,
        error: ERROR_MESSAGES.INVALID_TOKEN,
      }
    }

    const sessionData = sessions[0]

    // Get user data
    const users = await db
      .select()
      .from(user)
      .where(eq(user.id, sessionData.userId))
      .limit(1)

    if (users.length === 0) {
      return {
        success: false,
        error: ERROR_MESSAGES.USER_NOT_FOUND,
      }
    }

    const userData = users[0]

    // Check if user email is verified
    if (!userData.emailVerified) {
      return {
        success: false,
        error: ERROR_MESSAGES.USER_NOT_VERIFIED,
      }
    }

    // Check if user is banned
    if (userData.banned) {
      const now = new Date()
      if (!userData.banExpires || userData.banExpires > now) {
        return {
          success: false,
          error: ERROR_MESSAGES.USER_BANNED,
        }
      }
    }

    // Check admin status
    // better-auth admin plugin stores permissions, but for simplicity
    // we check if user has admin role or can check permissions via API
    // For now, we'll check if role contains 'admin' or use a permission check
    const isAdmin = await checkAdminPermission(userData.id)

    return {
      success: true,
      userData: {
        id: userData.id,
        name: userData.name,
        email: userData.email,
        emailVerified: userData.emailVerified,
        role: userData.role,
        isAdmin,
      },
    }
  } catch (error) {
    console.error('Error validating session:', error)
    return {
      success: false,
      error: ERROR_MESSAGES.INVALID_TOKEN,
    }
  }
}

/**
 * Checks if user has admin permissions
 * better-auth admin plugin typically stores permissions in a separate table
 * For now, we check user.role or can be extended to query permissions table
 */
const checkAdminPermission = async (userId: string): Promise<boolean> => {
  try {
    const users = await db
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)

    if (users.length === 0) {
      return false
    }

    const userData = users[0]

    // Check if role indicates admin
    // better-auth admin plugin might use role 'admin' or check permissions
    // This is a simplified check - can be extended based on better-auth implementation
    if (userData.role && userData.role.toLowerCase().includes('admin')) {
      return true
    }

    // TODO: If better-auth uses a separate permissions table, query it here
    // For now, return false if role doesn't indicate admin
    return false
  } catch (error) {
    console.error('Error checking admin permission:', error)
    return false
  }
}

/**
 * Validates that user is admin
 */
export const requireAdmin = async (
  token: string
): Promise<AuthResult> => {
  const authResult = await validateSession(token)

  if (!authResult.success || !authResult.userData) {
    return authResult
  }

  if (!authResult.userData.isAdmin) {
    return {
      success: false,
      error: ERROR_MESSAGES.NOT_ADMIN,
    }
  }

  return authResult
}

