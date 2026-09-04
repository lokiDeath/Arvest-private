// GET/POST/PATCH /api/appointments — schedule & manage appointments.
import { NextRequest } from 'next/server';
import { handler, ok, requireAuth, readJson, requireString, requireDate, requireEnum } from '@/lib/api';
import { db } from '@/lib/db';
import { notifyAdmins } from '@/lib/notify';

export const GET = handler(async (req: NextRequest) => {
  const user = await requireAuth(req);
  const appointments = await db.appointment.findMany({
    where: { userId: user.id },
    orderBy: { date: 'asc' },
    take: 100,
  });
  return ok({ appointments });
});

export const POST = handler(async (req: NextRequest) => {
  const user = await requireAuth(req);
  const body = await readJson<Record<string, unknown>>(req);
  const type = requireEnum(body.type, 'Appointment type', ['BRANCH', 'PHONE'] as const);
  const topic = requireString(body.topic, 'Topic', { min: 2, max: 120 });
  const date = requireDate(body.date, 'Date');
  if (date.getTime() < Date.now() - 60_000) {
    return ok({ error: 'Appointments must be scheduled in the future' }, { status: 422 });
  }
  const appointment = await db.appointment.create({
    data: {
      userId: user.id,
      type,
      topic,
      date,
      branchId: typeof body.branchId === 'string' && body.branchId ? body.branchId : null,
      notes: typeof body.notes === 'string' ? body.notes.trim() : null,
    },
  });
  await notifyAdmins('APPOINTMENT', 'New appointment request', `${user.name} requested a ${type.toLowerCase()} appointment — ${topic}.`, user.id);
  return ok({ success: true, appointment });
});

export const PATCH = handler(async (req: NextRequest) => {
  const user = await requireAuth(req);
  const body = await readJson<{ id?: string; action?: string }>(req);
  const id = requireString(body.id, 'Appointment id');
  const appointment = await db.appointment.findFirst({ where: { id, userId: user.id } });
  if (!appointment) return ok({ error: 'Appointment not found' }, { status: 404 });
  if (body.action === 'CANCEL') {
    if (appointment.status === 'CANCELLED' || appointment.status === 'COMPLETED') {
      return ok({ error: `A ${appointment.status.toLowerCase()} appointment can't be cancelled` }, { status: 409 });
    }
    await db.appointment.update({ where: { id: appointment.id }, data: { status: 'CANCELLED' } });
    return ok({ success: true });
  }
  return ok({ error: 'Unknown action' }, { status: 422 });
});
