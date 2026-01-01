// lib/auditLog.ts
import { supabase } from './supabaseClient';
import { getClientIpAddress, getClientUserAgent } from './requestInfo';

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
 * Create an audit log entry
 */
export async function createAuditLog(params: AuditLogParams) {
  try {
    const { error } = await supabase
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
 * Log a user login
 * Automatically fetches IP address and user agent if not provided
 */
export async function logLogin(userId: string, ipAddress?: string, userAgent?: string) {
  // If IP/UA not provided, try to fetch them from client side
  const finalIpAddress = ipAddress || await getClientIpAddress();
  const finalUserAgent = userAgent || getClientUserAgent();

  await createAuditLog({
    userId,
    actionType: 'login',
    actionDescription: 'User logged in',
    ipAddress: finalIpAddress,
    userAgent: finalUserAgent,
  });
}

/**
 * Log a payment action
 */
export async function logPayment(userId: string, shiftIds: string[], totalAmount: number) {
  await createAuditLog({
    userId,
    actionType: 'payment_marked',
    actionDescription: `Marked ${shiftIds.length} shift(s) as paid (Total: $${totalAmount.toFixed(2)})`,
    resourceType: 'shifts',
    metadata: { shiftIds, totalAmount },
  });
}

/**
 * Log undo payment
 */
export async function logUndoPayment(userId: string, shiftId: string, employeeName: string) {
  await createAuditLog({
    userId,
    actionType: 'payment_undone',
    actionDescription: `Undid payment for ${employeeName}`,
    resourceType: 'shift',
    resourceId: shiftId,
  });
}

/**
 * Log shift creation
 */
export async function logShiftCreated(userId: string, shiftId: string, shiftType: string) {
  await createAuditLog({
    userId,
    actionType: 'shift_created',
    actionDescription: `Created ${shiftType} shift`,
    resourceType: 'shift',
    resourceId: shiftId,
  });
}

/**
 * Log shift update
 */
export async function logShiftUpdated(userId: string, shiftId: string, changes: string) {
  await createAuditLog({
    userId,
    actionType: 'shift_updated',
    actionDescription: `Updated shift: ${changes}`,
    resourceType: 'shift',
    resourceId: shiftId,
  });
}

/**
 * Log shift deletion
 */
export async function logShiftDeleted(userId: string, shiftId: string, shiftType: string) {
  await createAuditLog({
    userId,
    actionType: 'shift_deleted',
    actionDescription: `Deleted ${shiftType} shift`,
    resourceType: 'shift',
    resourceId: shiftId,
  });
}

/**
 * Log employee update
 */
export async function logEmployeeUpdated(userId: string, employeeId: string, employeeName: string, changes: string) {
  await createAuditLog({
    userId,
    actionType: 'employee_updated',
    actionDescription: `Updated ${employeeName}: ${changes}`,
    resourceType: 'employee',
    resourceId: employeeId,
  });
}
