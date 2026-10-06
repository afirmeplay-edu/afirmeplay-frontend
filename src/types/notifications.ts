/** Notificações da tabela central do backend (`/notifications`). */
export interface ServerNotification {
  id: string;
  type: string;
  title: string;
  message: string | null;
  payload: Record<string, unknown> | null;
  reference_type: string | null;
  reference_id: string | null;
  action_url: string | null;
  created_at: string;
  expires_at: string | null;
  school_id: string | null;
  read_at: string | null;
  is_read: boolean;
}

export interface ServerNotificationPage {
  items: ServerNotification[];
  page: number;
  per_page: number;
  total: number;
  has_next: boolean;
}
