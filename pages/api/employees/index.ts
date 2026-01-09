// pages/api/employees/index.ts
import type { NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { requireAdmin, type AuthenticatedRequest } from '../../../lib/middleware';

// Generate a secure random password
function generateSecurePassword(): string {
  const length = 16;
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  const randomValues = new Uint32Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(randomValues);
    for (let i = 0; i < length; i++) {
      password += charset[randomValues[i] % charset.length];
    }
  } else {
    // Fallback for environments without crypto
    for (let i = 0; i < length; i++) {
      password += charset[Math.floor(Math.random() * charset.length)];
    }
  }
  return password;
}

const CreateEmployeeSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(1).max(200),
  phone: z.string().nullable().optional(),
  venmo_url: z.string().nullable().optional(),
  pay_rate: z.number().min(0).max(1000).nullable().optional(),
  role: z.enum(['admin', 'employee']).default('employee'),
  password: z.string().min(6).optional(), // Optional - will generate if not provided
  send_invite_email: z.boolean().default(true), // Send invite email by default
});

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  // GET - List all employees
  if (req.method === 'GET') {
    try {
      const { data: profiles, error } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, role, phone, venmo_url, pay_rate, is_active, created_at')
        .order('full_name', { ascending: true });

      if (error) throw error;

      // Fetch all users in one batch query instead of N+1 individual queries
      const { data: allUsersData } = await supabaseAdmin.auth.admin.listUsers();

      // Create a Map for O(1) email lookup by user ID
      const usersById = new Map(
        (allUsersData?.users || []).map(user => [user.id, user])
      );

      // Enrich profiles with emails from the Map
      const enrichedProfiles = (profiles || []).map(profile => ({
        ...profile,
        email: usersById.get(profile.id)?.email || null,
      }));

      return res.status(200).json(enrichedProfiles);
    } catch (error: any) {
      console.error('Failed to fetch employees:', error);
      return res.status(500).json({ error: 'Failed to fetch employees' });
    }
  }

  // POST - Create new employee
  if (req.method === 'POST') {
    try {
      const parsed = CreateEmployeeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }

      const { email, full_name, phone, venmo_url, pay_rate, role, password, send_invite_email } = parsed.data;

      // Generate a secure random password if not provided
      const generatedPassword = password || generateSecurePassword();

      // Check if user already exists in auth
      let authData: any;
      let isReactivation = false;

      // Try to get existing user by email
      const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
      const existingUser = existingUsers?.users?.find((u: any) => u.email === email);

      if (existingUser) {
        // User already exists - reactivate them
        console.log('User already exists in auth, reactivating:', email);
        authData = { user: existingUser };
        isReactivation = true;

        // Update their password if we're sending an invite
        if (send_invite_email && !password) {
          await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
            password: generatedPassword,
            user_metadata: {
              full_name,
              requires_password_change: true,
            },
          });
        }
      } else {
        // 1. Create new auth user
        const { data: newAuthData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password: generatedPassword,
          email_confirm: true, // Auto-confirm email
          user_metadata: {
            full_name,
            requires_password_change: !password, // Flag if we generated the password
          },
        });

        if (authError) {
          console.error('Failed to create auth user:', authError);
          return res.status(500).json({ error: authError.message });
        }

        if (!newAuthData.user) {
          return res.status(500).json({ error: 'User creation failed' });
        }

        authData = newAuthData;
      }

      // 2. Create/update profile
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .upsert({
          id: authData.user.id,
          full_name,
          role,
          phone: phone || null,
          venmo_url: venmo_url || null,
          pay_rate: pay_rate || 25, // Default $25/hour
          is_active: true,
        })
        .select()
        .single();

      if (profileError) {
        console.error('Failed to create profile:', profileError);
        // Rollback: delete auth user if profile creation fails
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        return res.status(500).json({ error: profileError.message });
      }

      // 3. Send invite email if requested
      let emailSent = false;
      if (send_invite_email && !password) {
        try {
          // Use password reset email as invite (works even without SMTP configured in dev)
          const redirectTo =
            typeof process !== 'undefined' && process.env.NEXT_PUBLIC_SITE_URL
              ? `${process.env.NEXT_PUBLIC_SITE_URL}/update-password`
              : undefined;

          // First try the invite API
          const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
            email,
            { redirectTo }
          );

          if (inviteError) {
            console.error('Failed to send invite email (trying password reset instead):', inviteError);

            // Fallback: Send password reset email instead
            const { error: resetError } = await supabaseAdmin.auth.resetPasswordForEmail(
              email,
              { redirectTo }
            );

            if (resetError) {
              console.error('Failed to send password reset email:', resetError);
            } else {
              emailSent = true;
              console.log('Password reset email sent successfully to:', email);
            }
          } else {
            emailSent = true;
            console.log('Invite email sent successfully to:', email);
          }
        } catch (emailError: any) {
          console.error('Error sending invite email:', emailError);
          // Continue even if email fails
        }
      }

      return res.status(201).json({
        ...profile,
        email: authData.user.email,
        invite_sent: emailSent,
        reactivated: isReactivation,
      });
    } catch (error: any) {
      console.error('Failed to create employee:', error);
      return res.status(500).json({ error: error.message || 'Failed to create employee' });
    }
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: 'Method Not Allowed' });
}

export default requireAdmin(handler);
