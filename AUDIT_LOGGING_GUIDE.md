# Audit Logging Guide

## Overview

The audit logging system tracks all important actions in the timesheet application for compliance, security, and accountability. It captures:

- **Who** performed the action (user ID, name, email)
- **What** action was performed (action type and description)
- **When** it happened (timestamp)
- **Where** they were (IP address)
- **How** they accessed it (user agent/browser)
- **What resource** was affected (resource type and ID)

## Database Schema

The `audit_logs` table structure:

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,              -- Who did it
  action_type TEXT NOT NULL,          -- Type: login, payment_marked, shift_updated, etc.
  action_description TEXT NOT NULL,   -- Human-readable description
  resource_type TEXT,                 -- What was affected: shift, employee, etc.
  resource_id TEXT,                   -- ID of the resource
  metadata JSONB,                     -- Additional context
  ip_address TEXT,                    -- Client IP address
  user_agent TEXT,                    -- Browser/device info
  created_at TIMESTAMPTZ              -- When it happened
);
```

## IP Address Tracking

### How It Works

#### Client-Side (Pages)
For actions triggered from the browser (like login), IP address is fetched using:

```typescript
import { getClientIpAddress, getClientUserAgent } from '../lib/requestInfo';

// Automatically fetch IP and user agent
const ipAddress = await getClientIpAddress();
const userAgent = getClientUserAgent();

await logLogin(userId, ipAddress, userAgent);
```

**Method**: Uses public API (ipify.org) to get the client's public IP address.

**Pros**:
- Works from client-side code
- Gets the actual user's IP even behind proxies

**Cons**:
- Requires external API call
- Slightly slower
- May fail if API is down

#### Server-Side (API Routes)
For actions in API routes (like employee updates), IP address is extracted from request headers:

```typescript
import { getRequestInfo } from '../../../lib/requestInfo';
import { logEmployeeUpdatedServer } from '../../../lib/auditLogServer';

// In your API route handler
const { ipAddress, userAgent } = getRequestInfo(req);

// Or use the convenience function
await logEmployeeUpdatedServer(req, userId, employeeId, name, changes);
```

**Method**: Extracts from HTTP headers:
1. `X-Forwarded-For` - Set by proxies/load balancers (Vercel, nginx, etc.)
2. `X-Real-IP` - Alternative header used by some proxies
3. `req.socket.remoteAddress` - Direct connection IP (local dev)

**Pros**:
- Fast and reliable
- No external dependencies
- More accurate for server-side actions

**Cons**:
- Only works in API routes
- Requires proper proxy configuration in production

### Production Deployment (Vercel)

Vercel automatically sets the `X-Forwarded-For` header with the client's real IP address. No additional configuration needed.

For other hosting:
- Ensure your reverse proxy/load balancer sets `X-Forwarded-For`
- Example nginx config:
  ```nginx
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Real-IP $remote_addr;
  ```

## Resource Tracking

### Resource Types

The system tracks different resource types:

- `shift` - Work shift records
- `employee` - Employee/user profiles
- `shifts` (plural) - Multiple shifts (for batch operations like payments)

### Resource ID

Each audit log can store the specific ID of the affected resource:

```typescript
await createAuditLog({
  userId: adminId,
  actionType: 'shift_deleted',
  actionDescription: 'Deleted Breakdown shift',
  resourceType: 'shift',
  resourceId: shiftId,  // Specific shift that was deleted
});
```

### Metadata

Additional context can be stored as JSON:

```typescript
await logPayment(userId, shiftIds, totalAmount);
// Stores metadata: { shiftIds: [...], totalAmount: 150.00 }
```

## Current Implementation

### Actions Being Logged

#### Client-Side Actions
1. **Login** (`login`)
   - Location: `pages/index.tsx`
   - Captures: User login with IP and user agent

2. **Payment Undo** (`payment_undone`)
   - Location: `pages/payment-history.tsx`
   - Captures: When admin undoes a payment
   - Resource: `shift` with shift ID

3. **Payment Marking** (`payment_marked`)
   - Location: `pages/payroll.tsx`
   - Captures: When admin marks shifts as paid
   - Resource: `shifts` (multiple)
   - Metadata: Array of shift IDs and total amount

#### Server-Side Actions (API Routes)
4. **Employee Update** (`employee_updated`)
   - Location: `pages/api/employees/[id].ts`
   - Captures: Changes to employee profile (name, pay rate, role, etc.)
   - Resource: `employee` with employee ID
   - Includes: IP address, user agent, specific fields changed

5. **Employee Deactivation** (`employee_deactivated`)
   - Location: `pages/api/employees/[id].ts`
   - Captures: When employee is soft-deleted
   - Resource: `employee` with employee ID
   - Includes: IP address, user agent

### Actions NOT Yet Logged

These helper functions exist but are not yet integrated:

- `logShiftCreated()` - When creating new shifts
- `logShiftUpdated()` - When editing shifts
- `logShiftDeleted()` - When deleting shifts

## Adding Audit Logging to New Actions

### Client-Side Example

```typescript
import { createAuditLog } from '../lib/auditLog';
import { getClientIpAddress, getClientUserAgent } from '../lib/requestInfo';

async function handleSomeAction() {
  const userId = profile.id;
  const ipAddress = await getClientIpAddress();
  const userAgent = getClientUserAgent();

  await createAuditLog({
    userId,
    actionType: 'custom_action',
    actionDescription: 'User did something important',
    resourceType: 'shift',
    resourceId: shiftId,
    ipAddress,
    userAgent,
    metadata: { key: 'value' },
  });
}
```

### Server-Side Example (API Route)

```typescript
import { requireAdmin, type AuthenticatedRequest } from '../../../lib/middleware';
import { createAuditLogFromRequest } from '../../../lib/auditLogServer';

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  // Do your action
  const result = await doSomething();

  // Log it with automatic IP/UA extraction
  await createAuditLogFromRequest(req, {
    userId: req.user.id,
    actionType: 'custom_action',
    actionDescription: 'Admin did something',
    resourceType: 'shift',
    resourceId: shiftId,
  });

  return res.status(200).json({ result });
}

export default requireAdmin(handler);
```

## Viewing Audit Logs

### Admin Dashboard

Access audit logs at `/audit-logs` (admin only).

Features:
- **Search**: Filter by user name, email, or action description
- **Filters**: Filter by action type, user, date range
- **Columns**: Timestamp, User, Action Type, Description, Resource, IP Address, User Agent
- **Export**: Download filtered logs as CSV
- **Hover**: Hover over user agent to see full browser/device info

### Database Queries

Query audit logs directly in Supabase:

```sql
-- Find all actions by a specific user
SELECT * FROM audit_logs
WHERE user_id = 'user-uuid'
ORDER BY created_at DESC;

-- Find all payment actions
SELECT * FROM audit_logs
WHERE action_type = 'payment_marked'
ORDER BY created_at DESC;

-- Find all actions from a specific IP
SELECT * FROM audit_logs
WHERE ip_address = '123.45.67.89'
ORDER BY created_at DESC;

-- Find all actions on a specific resource
SELECT * FROM audit_logs
WHERE resource_type = 'employee'
  AND resource_id = 'employee-uuid'
ORDER BY created_at DESC;
```

## Security Considerations

### Row-Level Security (RLS)

The audit logs table has RLS enabled:

- **View**: Only admins can view audit logs
- **Insert**: Any authenticated user can insert (for logging their own actions)
- **Update/Delete**: Not allowed (audit logs are immutable)

### Data Retention

Currently, audit logs are kept indefinitely. Consider implementing:

```sql
-- Archive logs older than 1 year
CREATE TABLE audit_logs_archive AS
SELECT * FROM audit_logs
WHERE created_at < NOW() - INTERVAL '1 year';

-- Delete archived logs
DELETE FROM audit_logs
WHERE created_at < NOW() - INTERVAL '1 year';
```

### Privacy Considerations

- **IP Addresses**: Can identify individuals, comply with GDPR/privacy laws
- **User Agents**: Less sensitive but still personal data
- **Metadata**: Be careful not to log sensitive data (passwords, SSNs, etc.)

## Testing

### Test IP Address Capture (Local Dev)

```typescript
// Client-side test
const ip = await getClientIpAddress();
console.log('Client IP:', ip);

// Server-side test (in API route)
import { getIpAddress } from '../../../lib/requestInfo';
const ip = getIpAddress(req);
console.log('Server detected IP:', ip);
```

### Test Audit Logging

1. **Login**: Log in and check audit_logs table for new `login` entry with IP
2. **Update Employee**: Change an employee's pay rate and verify the log includes:
   - Correct user_id (admin who made change)
   - IP address
   - User agent
   - Resource type: 'employee'
   - Resource ID: employee's UUID
   - Description with fields changed

3. **Mark Payment**: Mark shifts as paid and verify:
   - Total amount is correct
   - Shift IDs are in metadata
   - IP and user agent are captured

## Troubleshooting

### IP Address Shows as "—"

**Client-Side**:
- Check browser console for errors from ipify.org
- May be blocked by ad blocker or firewall
- Try whitelisting api.ipify.org

**Server-Side**:
- Check if proxy is setting X-Forwarded-For header
- In local dev, should show `::1` or `127.0.0.1`
- In production (Vercel), should show client's public IP

### User Agent Shows as "—"

**Client-Side**:
- Should always work unless JavaScript is disabled
- Check: `console.log(navigator.userAgent)`

**Server-Side**:
- Should always be present in HTTP requests
- Check: `console.log(req.headers['user-agent'])`

### Audit Logs Not Appearing

1. Check RLS policies - user must be authenticated
2. Check browser console for errors
3. Verify Supabase connection
4. Check audit_logs table directly in Supabase dashboard

## Future Enhancements

1. **Real-time Alerts**: Notify admins of suspicious activity
2. **IP Geolocation**: Show login location on a map
3. **Device Fingerprinting**: Better identify unique devices
4. **Retention Policies**: Auto-archive old logs
5. **Export Formats**: PDF, Excel, JSON
6. **Advanced Filtering**: By IP range, device type, etc.
7. **Activity Dashboard**: Charts and graphs of user activity
8. **Anomaly Detection**: Flag unusual patterns (login from new country, etc.)

## API Reference

### Client-Side Functions

```typescript
// lib/requestInfo.ts
getClientIpAddress(): Promise<string | undefined>
getClientUserAgent(): string

// lib/auditLog.ts
createAuditLog(params: AuditLogParams): Promise<void>
logLogin(userId, ipAddress?, userAgent?): Promise<void>
logPayment(userId, shiftIds, totalAmount): Promise<void>
logUndoPayment(userId, shiftId, employeeName): Promise<void>
logShiftCreated(userId, shiftId, shiftType): Promise<void>
logShiftUpdated(userId, shiftId, changes): Promise<void>
logShiftDeleted(userId, shiftId, shiftType): Promise<void>
logEmployeeUpdated(userId, employeeId, employeeName, changes): Promise<void>
```

### Server-Side Functions

```typescript
// lib/requestInfo.ts
getIpAddress(req: NextApiRequest): string | undefined
getUserAgent(req: NextApiRequest): string | undefined
getRequestInfo(req: NextApiRequest): { ipAddress?, userAgent? }

// lib/auditLogServer.ts
createAuditLogServer(params: AuditLogParams): Promise<void>
createAuditLogFromRequest(req, params): Promise<void>
logEmployeeUpdatedServer(req, userId, employeeId, name, changes): Promise<void>
logEmployeeDeactivatedServer(req, userId, employeeId, name): Promise<void>
```

## Compliance

This audit logging system helps meet requirements for:

- **SOC 2**: User activity monitoring and access logs
- **HIPAA**: If handling health data, audit trails required
- **GDPR**: Data subject access requests (who accessed what data)
- **PCI DSS**: If handling payment data, comprehensive logging required
- **Labor Laws**: Employee time tracking and payroll records

Ensure you:
1. Document what is logged and why
2. Inform users their actions are logged
3. Protect audit logs from unauthorized access
4. Have a retention and deletion policy
5. Provide audit log access for compliance audits
