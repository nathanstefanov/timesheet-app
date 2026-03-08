// lib/auditLogServer.ts
// Server-side audit logging functions for API routes
import type { NextApiRequest } from 'next';
import { supabaseAdmin } from './supabaseAdmin';
import { getRequestInfo } from './requestInfo';

type AuditLogParams = {
  userId: string;
  actionType: string;
  actionDescription: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: any;
  ipAddress?: string;
  userAgent?: string;
};

/**
 * Create an audit log entry using server-side Supabase admin client
 */
export async function createAuditLogServer(params: AuditLogParams) {
  try {
    const { error } = await supabaseAdmin
      .from('audit_logs')
      .insert({
        user_id: params.userId,
        action_type: params.actionType,
        action_description: params.actionDescription,
        resource_type: params.resourceType || null,
        resource_id: params.resourceId || null,
        metadata: params.metadata || {},
        ip_address: params.ipAddress || null,
        user_agent: params.userAgent || null,
      });

    if (error) {
      console.error('Failed to create audit log:', error);
    }
  } catch (err) {
    console.error('Failed to create audit log:', err);
  }
}

/**
 * Create audit log from API request (auto-extracts IP and user agent)
 */
export async function createAuditLogFromRequest(
  req: NextApiRequest,
  params: Omit<AuditLogParams, 'ipAddress' | 'userAgent'>
) {
  const requestInfo = getRequestInfo(req);

  await createAuditLogServer({
    ...params,
    ipAddress: requestInfo.ipAddress,
    userAgent: requestInfo.userAgent,
  });
}

/**
 * Log employee update from API route
 */
export async function logEmployeeUpdatedServer(
  req: NextApiRequest,
  userId: string,
  employeeId: string,
  employeeName: string,
  changes: string
) {
  await createAuditLogFromRequest(req, {
    userId,
    actionType: 'employee_updated',
    actionDescription: `Updated ${employeeName}: ${changes}`,
    resourceType: 'employee',
    resourceId: employeeId,
  });
}

/**
 * Log employee deactivation from API route
 */
export async function logEmployeeDeactivatedServer(
  req: NextApiRequest,
  userId: string,
  employeeId: string,
  employeeName: string
) {
  await createAuditLogFromRequest(req, {
    userId,
    actionType: 'employee_deactivated',
    actionDescription: `Deactivated employee: ${employeeName}`,
    resourceType: 'employee',
    resourceId: employeeId,
  });
}

/**
 * Log employee creation from API route
 */
export async function logEmployeeCreatedServer(
  req: NextApiRequest,
  userId: string,
  newEmployeeId: string,
  employeeName: string,
  role: string
) {
  await createAuditLogFromRequest(req, {
    userId,
    actionType: 'employee_created',
    actionDescription: `Created employee: ${employeeName} (${role})`,
    resourceType: 'employee',
    resourceId: newEmployeeId,
    metadata: { role },
  });
}

/**
 * Log schedule shift creation from API route
 */
export async function logScheduleShiftCreatedServer(
  req: NextApiRequest,
  userId: string,
  shiftId: string,
  jobType: string,
  startTime: string
) {
  await createAuditLogFromRequest(req, {
    userId,
    actionType: 'schedule_shift_created',
    actionDescription: `Created schedule shift: ${jobType} on ${startTime}`,
    resourceType: 'schedule_shift',
    resourceId: shiftId,
    metadata: { jobType, startTime },
  });
}

/**
 * Log schedule shift update from API route
 */
export async function logScheduleShiftUpdatedServer(
  req: NextApiRequest,
  userId: string,
  shiftId: string,
  changes: string,
  metadata?: Record<string, any>
) {
  await createAuditLogFromRequest(req, {
    userId,
    actionType: 'schedule_shift_updated',
    actionDescription: `Updated schedule shift: ${changes}`,
    resourceType: 'schedule_shift',
    resourceId: shiftId,
    metadata: metadata || {},
  });
}

/**
 * Log schedule shift deletion from API route
 */
export async function logScheduleShiftDeletedServer(
  req: NextApiRequest,
  userId: string,
  shiftId: string
) {
  await createAuditLogFromRequest(req, {
    userId,
    actionType: 'schedule_shift_deleted',
    actionDescription: `Deleted schedule shift`,
    resourceType: 'schedule_shift',
    resourceId: shiftId,
  });
}

/**
 * Log employees assigned to a schedule shift
 */
export async function logEmployeesAssignedServer(
  req: NextApiRequest,
  userId: string,
  shiftId: string,
  employeeIds: string[]
) {
  await createAuditLogFromRequest(req, {
    userId,
    actionType: 'employees_assigned',
    actionDescription: `Assigned ${employeeIds.length} employee(s) to schedule shift`,
    resourceType: 'schedule_shift',
    resourceId: shiftId,
    metadata: { employeeIds },
  });
}

/**
 * Log employees unassigned from a schedule shift
 */
export async function logEmployeesUnassignedServer(
  req: NextApiRequest,
  userId: string,
  shiftId: string,
  employeeIds: string[]
) {
  await createAuditLogFromRequest(req, {
    userId,
    actionType: 'employees_unassigned',
    actionDescription: `Removed ${employeeIds.length} employee(s) from schedule shift`,
    resourceType: 'schedule_shift',
    resourceId: shiftId,
    metadata: { employeeIds },
  });
}
