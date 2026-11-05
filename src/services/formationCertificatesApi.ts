import { api } from '@/lib/api';
import type {
  FormationCertificateEvent,
  FormationEventPayload,
  FormationParticipant,
} from '@/types/formation-certificates';

export class FormationCertificatesApiService {
  static async listEvents(): Promise<FormationCertificateEvent[]> {
    const response = await api.get<{ data: FormationCertificateEvent[] }>('/certificates/formation-events');
    return response.data?.data ?? [];
  }

  static async getEvent(eventId: string): Promise<FormationCertificateEvent> {
    const response = await api.get<FormationCertificateEvent>(`/certificates/formation-events/${eventId}`);
    return response.data;
  }

  static async createEvent(payload: FormationEventPayload): Promise<FormationCertificateEvent> {
    const response = await api.post<FormationCertificateEvent>('/certificates/formation-events', payload);
    return response.data;
  }

  static async updateEvent(
    eventId: string,
    payload: FormationEventPayload
  ): Promise<FormationCertificateEvent> {
    const response = await api.patch<FormationCertificateEvent>(
      `/certificates/formation-events/${eventId}`,
      payload
    );
    return response.data;
  }

  static async deleteEvent(eventId: string): Promise<void> {
    await api.delete(`/certificates/formation-events/${eventId}`);
  }

  static async addParticipants(
    eventId: string,
    participants: Array<{ name: string; externalRef?: string; userId?: string }>
  ): Promise<FormationParticipant[]> {
    const response = await api.post<{ data: FormationParticipant[] }>(
      `/certificates/formation-events/${eventId}/participants`,
      { participants }
    );
    return response.data?.data ?? [];
  }

  static async addParticipantsFromCsv(eventId: string, file: File): Promise<FormationParticipant[]> {
    const form = new FormData();
    form.append('file', file);
    const response = await api.post<{ data: FormationParticipant[] }>(
      `/certificates/formation-events/${eventId}/participants`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return response.data?.data ?? [];
  }

  static async addParticipantsFromUsers(
    eventId: string,
    userIds: string[]
  ): Promise<FormationParticipant[]> {
    const response = await api.post<{ data: FormationParticipant[] }>(
      `/certificates/formation-events/${eventId}/participants/from-users`,
      { userIds }
    );
    return response.data?.data ?? [];
  }

  static async removeParticipant(eventId: string, participantId: string): Promise<void> {
    await api.delete(`/certificates/formation-events/${eventId}/participants/${participantId}`);
  }

  static async issue(eventId: string, participantIds?: string[]) {
    const response = await api.post(`/certificates/formation-events/${eventId}/issue`, {
      participantIds,
    });
    return response.data as {
      eventId: string;
      issued: number;
      total: number;
      participants: FormationParticipant[];
    };
  }

  static async getBatch(eventId: string) {
    const response = await api.get(`/certificates/formation-events/${eventId}/batch`);
    return response.data as {
      event: FormationCertificateEvent;
      participants: FormationParticipant[];
    };
  }

  static async searchSystemUsers(search = '', role?: string) {
    const response = await api.get('/users/list', {
      params: {
        page: 1,
        per_page: 50,
        search: search || undefined,
        role: role || undefined,
      },
    });
    const raw = response.data?.data ?? response.data?.users ?? response.data ?? [];
    const list = Array.isArray(raw) ? raw : [];
    return list.map((user: any) => ({
      id: String(user.id || user.user_id || ''),
      name: String(user.name || user.nome || user.email || 'Usuário'),
      email: user.email as string | undefined,
      role: user.role as string | undefined,
    })).filter((user) => user.id);
  }
}
