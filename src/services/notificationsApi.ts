import { api } from '@/lib/api';
import { getStoredReferenceCityId } from '@/lib/planReferenceStorage';
import type { ServerNotificationPage } from '@/types/notifications';

/**
 * Só há contexto de município quando o usuário tem tenant próprio ou, no caso do admin,
 * um município de referência selecionado (enviado como X-City-ID pelo interceptor).
 * Sem contexto, o backend responderia 403; por isso nem chamamos.
 */
export function hasNotificationsCityContext(
  user: { role?: string | null; tenant_id?: string | null; city_id?: string | null } | null | undefined
): boolean {
  if (!user) return false;
  if ((user.role ?? '').toLowerCase() === 'admin') return Boolean(getStoredReferenceCityId());
  return Boolean(user.tenant_id || user.city_id);
}

export class NotificationsApiService {
  static async getUnreadCount(): Promise<number> {
    const { data } = await api.get<{ count: number }>('/notifications/unread-count');
    return Number(data?.count) || 0;
  }

  static async list(params: { page?: number; per_page?: number; unread_only?: boolean } = {}): Promise<ServerNotificationPage> {
    const { data } = await api.get<ServerNotificationPage>('/notifications', { params });
    return data;
  }

  static async markRead(id: string): Promise<void> {
    await api.post(`/notifications/${encodeURIComponent(id)}/read`);
  }

  static async markAllRead(): Promise<number> {
    const { data } = await api.post<{ updated: number }>('/notifications/read-all');
    return Number(data?.updated) || 0;
  }
}
