import { eq } from 'drizzle-orm'
import { db } from '../config/db.config'
import { matches, events, organization } from '../db/schema'
import type { UserData } from '../middlewares/auth.middleware'

export interface OrganizationContext {
  isSystemAdmin: boolean
  organization: { id: string; name: string } | null
  activeOrganizationId: string | null
  role: string | null
  isAdmin: boolean
  isOwner: boolean
  isCoach: boolean
  isPlayer: boolean
  isMember: boolean
}

/**
 * Build organization context from UserData
 * Matches frontend getOrganizationContext logic for consistency
 * Handles:
 * - System admin detection (role === 'admin')
 * - Active organization from session.activeOrganizationId
 * - Fallback to single membership if no active org
 * - Role flags for authorization checks
 */
export const buildOrganizationContext = async (
  userData: UserData
): Promise<OrganizationContext> => {
  const isSystemAdmin = userData.isAdmin || false
  let activeOrganizationId = userData.activeOrganizationId || null

  // Find organization from activeOrganizationId
  let org: { id: string; name: string } | null = null
  let role: string | null = null
  let isAdmin = false
  let isOwner = false
  let isCoach = false
  let isPlayer = false
  let isMember = false

  // If no active organization but user has exactly one membership, use it
  // (matches frontend logic for single membership fallback)
  if (!activeOrganizationId && userData.organizationMemberships) {
    if (userData.organizationMemberships.length === 1) {
      activeOrganizationId = userData.organizationMemberships[0].organizationId
    }
  }

  if (activeOrganizationId && userData.organizationMemberships) {
    const membership = userData.organizationMemberships.find(
      (m) => m.organizationId === activeOrganizationId
    )
    if (membership) {
      role = membership.role
      const roleLower = membership.role.toLowerCase()

      // Set role flags (matches frontend OrganizationRole enum)
      // super_admin is treated as admin for authorization purposes
      isAdmin = roleLower === 'admin' || roleLower === 'super_admin'
      isOwner = roleLower === 'owner'
      isCoach = roleLower === 'coach'
      isPlayer = roleLower === 'player'
      isMember = roleLower === 'member'

      // Fetch organization details
      const orgResults = await db
        .select()
        .from(organization)
        .where(eq(organization.id, activeOrganizationId))
        .limit(1)

      if (orgResults.length > 0) {
        org = {
          id: orgResults[0].id,
          name: orgResults[0].name,
        }
      }
    }
  }

  return {
    isSystemAdmin,
    organization: org,
    activeOrganizationId,
    role,
    isAdmin,
    isOwner,
    isCoach,
    isPlayer,
    isMember,
  }
}

/**
 * Check if user has authorization to read/view events
 * Authorization logic matches frontend:
 * - System admin: can see all events
 * - Org members: can see their org events (public + private) + public events + events without org
 * - Non-authenticated: can see public events + events without org
 */
export const checkEventReadAuthorization = async (
  userData: UserData,
  event: { organizationId: string | null; visibility: string }
): Promise<{ authorized: boolean; error?: string }> => {
  const context = await buildOrganizationContext(userData)
  const { isSystemAdmin, organization } = context

  // System admin: can see all events
  if (isSystemAdmin) {
    return { authorized: true }
  }

  const isPublic = event.visibility === 'public'
  const hasNoOrganization = event.organizationId === null
  const isFromUserOrg =
    organization?.id && event.organizationId === organization.id

  // Allow if: public OR no organization OR from user's org
  // Block if: private AND has organization AND not from user's org
  if (!isPublic && !hasNoOrganization && !isFromUserOrg) {
    return {
      authorized: false,
      error: 'You do not have permission to access this event',
    }
  }

  return { authorized: true }
}

/**
 * Check if user has authorization to update events
 * Matches frontend checkEventUpdateAuthorization logic exactly:
 * - Only system admins, org admins, org owners, and org coaches can update events
 * - Org members (admin/owner/coach) must have an active organization
 * - Org members can only update events from their own organization
 */
export const checkEventUpdateAuthorization = async (
  userData: UserData,
  event: { organizationId: string | null }
): Promise<{ authorized: boolean; error?: string }> => {
  const context = await buildOrganizationContext(userData)
  const { isSystemAdmin, organization, isAdmin, isOwner, isCoach } = context

  // System admin: can update all events
  if (isSystemAdmin) {
    return { authorized: true }
  }

  // Authorization: Only system admins, org admins, org owners, and org coaches can update events
  // Additionally, org members (admin/owner/coach) must have an active organization
  if ((!isAdmin && !isOwner && !isCoach) || !organization?.id) {
    return {
      authorized: false,
      error:
        'Only system admins, club admins, club owners, and club coaches can update events',
    }
  }

  // Organization ownership check: org members can only update events from their own organization
  if (event.organizationId !== organization.id) {
    return {
      authorized: false,
      error: 'You can only update events from your own organization',
    }
  }

  return { authorized: true }
}

/**
 * Check if user has authorization to access a match
 * Matches inherit authorization from their parent event
 */
export const checkMatchAccess = async (
  userData: UserData,
  matchId: string
): Promise<{ authorized: boolean; error?: string }> => {
  try {
    // Get match
    const matchResult = await db
      .select()
      .from(matches)
      .where(eq(matches.id, matchId))
      .limit(1)

    if (matchResult.length === 0) {
      return {
        authorized: false,
        error: 'Match not found',
      }
    }

    const match = matchResult[0]

    // Get event - only select columns that exist in database
    const eventResults = await db
      .select({
        organizationId: events.organizationId,
        visibility: events.visibility,
      })
      .from(events)
      .where(eq(events.id, match.eventId))
      .limit(1)

    if (eventResults.length === 0) {
      return {
        authorized: false,
        error: 'Event not found',
      }
    }

    const event = eventResults[0]

    // Check event read authorization
    return await checkEventReadAuthorization(userData, {
      organizationId: event.organizationId,
      visibility: event.visibility,
    })
  } catch (error) {
    console.error('Error checking match access:', error)
    return {
      authorized: false,
      error: 'Failed to verify match access',
    }
  }
}
