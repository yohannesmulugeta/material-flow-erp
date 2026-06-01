import { base44 } from '@/api/base44Client';

export async function logActivity({ module, action, entityType, entityId, description, previousValue, newValue, userName }) {
  await base44.entities.ActivityLog.create({
    user_name: userName || 'System',
    module,
    action,
    entity_type: entityType,
    entity_id: entityId,
    description,
    previous_value: previousValue ? JSON.stringify(previousValue) : undefined,
    new_value: newValue ? JSON.stringify(newValue) : undefined,
  });
}