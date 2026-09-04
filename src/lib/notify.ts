// ============================================================
// Arvest Private Banking — Notification / Audit / Security events
// The trio applied after privileged or customer-visible changes.
// These helpers never throw — audit/notification failures must
// not roll back committed financial state.
// ============================================================
import { db } from '@/lib/db';

export async function notifyCustomer(
  recipientId: string,
  type: string,
  title: string,
  body: string,
  subjectUserId?: string
): Promise<void> {
  try {
    await db.notification.create({
      data: { recipientId, type, title, body, userId: subjectUserId ?? recipientId },
    });
  } catch (e) {
    console.error('[notify:customer]', e instanceof Error ? e.message : e);
  }
}

export async function notifyAdmins(type: string, title: string, body: string, subjectUserId?: string): Promise<void> {
  try {
    await db.notification.create({
      data: { recipientRole: 'ADMIN', type, title, body, userId: subjectUserId ?? null },
    });
  } catch (e) {
    console.error('[notify:admin]', e instanceof Error ? e.message : e);
  }
}

export async function audit(
  userId: string | null,
  actor: string,
  action: string,
  detail?: string,
  ctx?: { ip?: string; userAgent?: string }
): Promise<void> {
  try {
    await db.auditLog.create({
      data: { userId, actor, action, detail: detail ?? null, ip: ctx?.ip, userAgent: ctx?.userAgent },
    });
  } catch (e) {
    console.error('[audit]', e instanceof Error ? e.message : e);
  }
}

export async function securityEvent(
  userId: string | null,
  type: string,
  ip?: string,
  userAgent?: string,
  detail?: string
): Promise<void> {
  try {
    await db.securityEvent.create({
      data: { userId, type, ip, userAgent, detail: detail ?? null },
    });
  } catch (e) {
    console.error('[securityEvent]', e instanceof Error ? e.message : e);
  }
}
