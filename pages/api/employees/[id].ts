// pages/api/employees/[id].ts
import type { NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { requireAdmin, type AuthenticatedRequest } from '../../../lib/middleware';
import { logEmployeeUpdatedServer, logEmployeeDeactivatedServer } from '../../../lib/auditLogServer';

const UpdateEmployeeSchema = z.object({
  full_name: z.string().min(1).max(200).optional(),
  phone: z.string().nullable().optional(),
  venmo_url: z.string().nullable().optional(),
  pay_rate: z.number().min(0).max(1000).nullable().optional(),
  role: z.enum(['admin', 'employee']).optional(),
  is_active: z.boolean().optional(),
});

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Missing employee ID' });
  }

  // PATCH - Update employee
  if (req.method === 'PATCH') {
    try {
      const parsed = UpdateEmployeeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }

      const updates = parsed.data;

      // Update profile
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (profileError) {
        console.error('Failed to update profile:', profileError);
        return res.status(500).json({ error: profileError.message });
      }

      // Get email from auth
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(id);

      // Log the employee update with IP and user agent
      const changes = Object.keys(updates)
        .map(key => `${key}: ${JSON.stringify(updates[key as keyof typeof updates])}`)
        .join(', ');

      await logEmployeeUpdatedServer(
        req,
        req.user.id,
        id,
        profile.full_name || 'Unknown',
        changes
      );

      return res.status(200).json({
        ...profile,
        email: userData.user?.email || null,
      });
    } catch (error: any) {
      console.error('Failed to update employee:', error);
      return res.status(500).json({ error: error.message || 'Failed to update employee' });
    }
  }

  // DELETE - Delete employee (soft delete by setting is_active = false)
  if (req.method === 'DELETE') {
    try {
      // Soft delete: set is_active to false
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .update({ is_active: false })
        .eq('id', id)
        .select()
        .single();

      if (profileError) {
        console.error('Failed to deactivate employee:', profileError);
        return res.status(500).json({ error: profileError.message });
      }

      // Log the employee deactivation with IP and user agent
      await logEmployeeDeactivatedServer(
        req,
        req.user.id,
        id,
        profile.full_name || 'Unknown'
      );

      return res.status(200).json({ ok: true, profile });
    } catch (error: any) {
      console.error('Failed to delete employee:', error);
      return res.status(500).json({ error: error.message || 'Failed to delete employee' });
    }
  }

  res.setHeader('Allow', ['PATCH', 'DELETE']);
  return res.status(405).json({ error: 'Method Not Allowed' });
}

export default requireAdmin(handler);
