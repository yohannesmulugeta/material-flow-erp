import { base44 } from '@/api/base44Client';

export async function logActivity({
  module,
  action,
  entityType,
  entityId,
  description,
  previousValue,
  newValue,
  userName,
}) {
  try {
    await base44.entities.ActivityLog.create({
      user_name: userName || 'System',
      module,
      action,
      entity_type: entityType,
      entity_id: entityId ? String(entityId) : undefined,
      description,
      previous_value: previousValue ? JSON.stringify(previousValue) : undefined,
      new_value: newValue ? JSON.stringify(newValue) : undefined,
    });
  } catch (e) {
    // Activity logging is non-fatal — never block business workflows.
    console.warn('[activityLogger] non-fatal error', e?.message);
  }
}
