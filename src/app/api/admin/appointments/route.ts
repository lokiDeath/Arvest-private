// GET/PATCH /api/admin/appointments — manage branch/phone appointments.
import { NextRequest } from 'next/server';
import { handler, ok, requireAdmin, readJson, requireString, requireEnum } from '@/lib/api';
import { db } from '@/lib/db';
import { audit, notifyCustomer } from '@/lib/notify';

export const GET = handler(async (req: NextRequest) => {
  await requireAdmin(req);
  const sp = req.nextUrl.searchParams;
  const status = sp.get('status');
  const appointments = await db.appointment.findMany({
    where: status && status !== 'ALL' ? { status } : {},
    orderBy: { date: 'asc' },
    take: 200,
    include: { user: { select: { id: true, name: true, email: true, phone: true } } },
  });
  return ok({ appointments });
});

export const PATCH = handler(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  const body = await readJson<{ id?: string; status?: string; notes?: string }>(req);
  const id = requireString(body.id, 'Appointment id');
  const status = requireEnum(body.status, 'Status', ['SCHEDULED', 'CONFIRMED', 'CANCELLED', 'COMPLETED'] as const);
  const appointment = await db.appointment.update({
    where: { id },
    data: { status, ...(typeof body.notes === 'string' ? { notes: body.notes } : {}) },
  });
  await audit(admin.id, admin.email, 'ADMIN_APPOINTMENT', `${appointment.id} → ${status}`);
  await notifyCustomer(appointment.userId, 'APPOINTMENT', 'Appointment updated', `Your ${appointment.topic.toLowerCase()} appointment is now ${status.toLowerCase()}.`, appointment.userId);
  return ok({ success: true, appointment });
});
