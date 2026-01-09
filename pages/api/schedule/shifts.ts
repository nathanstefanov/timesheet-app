import type { NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { requireAdmin, type AuthenticatedRequest, handleApiError } from '../../../lib/middleware';

const CreateSchema = z.object({
	start_time: z.string().datetime(),
	end_time: z.string().datetime().optional().nullable(),
	location_name: z.string().min(1).max(200).optional(),
	address: z.string().min(3).max(300).optional(),
	job_type: z.enum(['setup','lights','breakdown','other']).optional(),
	notes: z.string().max(1000).optional(),
	status: z.enum(['draft','confirmed','changed']).optional(),
});

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
	try {
		if (req.method === 'POST') {
			const parsed = CreateSchema.safeParse(req.body);
			if (!parsed.success) {
				return res.status(400).json({
					error: 'Invalid request data',
					code: 'VALIDATION_ERROR'
				});
			}

			const {
				start_time, end_time, location_name, address,
				job_type, notes, status
			} = parsed.data;

			if (end_time && new Date(end_time) <= new Date(start_time)) {
				return res.status(400).json({
					error: 'End time must be after start time',
					code: 'VALIDATION_ERROR'
				});
			}

			const { data, error } = await supabaseAdmin
				.from('schedule_shifts')
				.insert([{
					start_time,
					end_time: end_time ?? null,
					location_name: location_name ?? null,
					address: address ?? null,
					job_type: job_type ?? 'setup',
					notes: notes ?? null,
					status: status ?? 'draft',
					created_by: req.user.id
				}])
				.select()
				.single();

			if (error) throw error;
			return res.status(200).json(data);
		}

		if (req.method === 'GET') {
			const { data, error } = await supabaseAdmin
				.from('schedule_shifts')
				.select('*')
				.order('start_time', { ascending: true });

			if (error) throw error;
			return res.status(200).json(data ?? []);
		}

		res.setHeader('Allow', ['GET','POST','OPTIONS']);
		return res.status(405).json({ error: 'Method Not Allowed' });
	} catch (error) {
		return handleApiError(error, res, 'Schedule shifts operation');
	}
}

export default requireAdmin(handler);
