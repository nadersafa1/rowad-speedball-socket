# Socket Server Alignment with App Server

This document describes the alignment between the socket server (`rowad-speedball-socket`) and the frontend app server (`rowad-speedball-frontend`), including intentional differences and their rationale.

## Overview

The socket server handles real-time match updates via WebSocket connections, while the frontend app server handles HTTP API requests. Both servers share the same database and must maintain consistent authorization logic and data structures.

## Aligned Components

### 1. Authorization Logic

Both servers now use identical authorization logic:

- **`checkEventUpdateAuthorization`**: Matches exactly between servers

  - System admins can update all events
  - Org admins, owners, and coaches can update events from their organization
  - Requires active organization membership for non-system admins

- **`checkEventReadAuthorization`**: Matches exactly between servers
  - System admins can see all events
  - Org members can see their org events (public + private) + public events + events without org
  - Non-authenticated users can see public events + events without org

### 2. Organization Context Building

Both servers build organization context consistently:

- System admin detection (role === 'admin')
- Active organization from session.activeOrganizationId
- Fallback to single membership if no active org
- Role flags (isAdmin, isOwner, isCoach, isPlayer, isMember)
- Support for 'super_admin' role (treated as admin)

### 3. Database Schema

Shared tables are aligned:

- **user**: ✅ Identical
- **organization**: ✅ Identical
- **member**: ✅ Identical
- **session**: ✅ Identical (including foreign key constraint on activeOrganizationId)
- **events**: ✅ Identical
- **sets**: ✅ Identical

## Intentional Differences

### 1. Admin Permission Check

**Frontend App Server:**

- Uses `auth.api.userHasPermission` API call with permission `{ user: ['list'] }`
- Checks `session.user.role === 'admin'` AND permission check

**Socket Server:**

- Uses direct database query: `user.role === 'admin'`
- Does not check permissions table (no access to better-auth API)

**Rationale:**
The socket server runs as a separate service without access to the better-auth API. The role check (`role === 'admin'`) is the primary indicator for system admin status. Users with `role === 'admin'` are system admins with full access, so the permission check is redundant for the socket server's use case.

**Impact:**
Minimal - both approaches identify system admins correctly. The socket server's approach is simpler and sufficient for its authorization needs.

### 2. Matches Table Schema

**Frontend App Server:**

- `registration1Id` and `registration2Id` reference `registrations.id`
- Full relationship with registrations table

**Socket Server:**

- `registration1Id` and `registration2Id` are UUID fields without foreign key constraints
- No registrations table in schema

**Rationale:**
The socket server only needs to work with match IDs and set scores. It doesn't need to query or manipulate registrations data. The matches table structure is compatible - both use UUID fields, and the socket server can read/write match data without needing the registrations relationship.

**Impact:**
None - the socket server operates at a different abstraction level and doesn't need registration details.

### 3. Missing Tables

The socket server schema intentionally excludes tables not needed for match operations:

- `players` - Not needed for match score updates
- `coaches` - Not needed for match operations
- `trainingSessions` - Not needed for match operations
- `tests` / `testResults` - Not needed for match operations
- `registrations` - Not needed (see above)
- `groups` - Not needed for match operations
- `invitation` - Not needed for match operations
- `account` - Not needed (auth handled via session token)
- `verification` - Not needed (auth handled via session token)

**Rationale:**
The socket server has a focused responsibility: real-time match score updates. It doesn't need tables related to player management, training sessions, or other features. This keeps the socket server lightweight and focused.

**Impact:**
None - the socket server only needs to read/write match and set data, which it can do with its minimal schema.

## Verification Checklist

- [x] Admin permission logic aligned (with documented difference)
- [x] Authorization functions match exactly
- [x] Organization context building matches
- [x] Shared database tables aligned
- [x] Schema differences documented with rationale
- [x] Role handling (including super_admin) aligned

## Maintenance Notes

When updating authorization logic in the frontend app server:

1. **Authorization Functions**: Update both `src/lib/event-authorization-helpers.ts` (frontend) and `src/utils/authorization.ts` (socket) simultaneously
2. **Organization Context**: Update both `src/lib/organization-helpers.ts` (frontend) and `src/utils/authorization.ts` (socket) simultaneously
3. **Schema Changes**: Update both schemas if shared tables change
4. **Role Handling**: Ensure both servers handle new roles consistently

## Testing Recommendations

1. Test authorization logic with same user roles on both servers
2. Verify organization context building produces identical results
3. Test match access control on both servers
4. Verify system admin detection works on both servers
