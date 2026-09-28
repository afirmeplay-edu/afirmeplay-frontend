import { api } from '@/lib/api';
import type {
  CalendarEventDTO,
  CalendarTargetPayload,
  CalendarVisibilityScope,
} from '@/services/calendarApi';
import type { Aviso, CreateAvisoDTO, AvisosFilters } from '@/types/avisos';

/**
 * Lista avisos reais (`calendar_events` com metadata.kind=aviso).
 * Escopo por destinatário é resolvido no backend ao materializar `calendar_event_users`.
 */
export function avisoListDateRange(): { start: string; end: string } {
  const end = new Date();
  end.setFullYear(end.getFullYear() + 2);
  const start = new Date();
  start.setFullYear(start.getFullYear() - 10);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** Intervalo curto para o sino e o painel. A listagem completa continua em avisoListDateRange. */
export function avisoPreviewDateRange(): { start: string; end: string } {
  const end = new Date();
  end.setMonth(end.getMonth() + 1);
  const start = new Date();
  start.setMonth(start.getMonth() - 6);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function mapCalendarDtoToAviso(dto: CalendarEventDTO): Aviso {
  const ep = dto.extendedProps ?? {};
  const meta = ep.metadata as { destinatarios?: Aviso['destinatarios'] } | undefined;
  let dest = meta?.destinatarios;
  if (!dest?.tipo || (dest.tipo !== 'municipio' && dest.tipo !== 'escola')) {
    if (dest?.tipo === 'todos') {
      dest = { tipo: 'municipio', municipio_id: '', municipio_nome: '(escopo anterior — global)' };
    } else {
      dest = { tipo: 'municipio', municipio_id: '', municipio_nome: '—' };
    }
  }
  const createdBy = (ep.created_by as { id?: string; name?: string; role?: string } | undefined) ?? dto.created_by;
  const desc = typeof ep.description === 'string' ? ep.description : '';
  const ts = dto.start || new Date().toISOString();

  return {
    id: dto.id,
    titulo: dto.title,
    mensagem: desc,
    data: ts.slice(0, 10),
    autor: createdBy?.name || '—',
    autor_id: String(createdBy?.id ?? ''),
    autor_role: String(createdBy?.role ?? ''),
    destinatarios: dest,
    created_at: ts,
    updated_at: typeof dto.end === 'string' ? dto.end : undefined,
    readOnServer: Boolean(ep.read),
  };
}

/** Corpo público/alinhado ao POST /calendar/events para um aviso. */
export function buildAvisoCreatePayload(dto: CreateAvisoDTO): Record<string, unknown> {
  const { visibility_scope, targets } = buildTargetsAndVisibility(dto.destinatarios);
  const nowIso = new Date().toISOString();

  return {
    title: dto.titulo,
    description: dto.mensagem,
    start_at: nowIso,
    end_at: nowIso,
    all_day: true,
    timezone: 'America/Sao_Paulo',
    visibility_scope,
    targets,
    is_published: true,
    metadata: {
      kind: 'aviso',
      destinatarios: dto.destinatarios,
    },
  };
}

export function buildTargetsAndVisibility(dest: CreateAvisoDTO['destinatarios']): {
  visibility_scope: CalendarVisibilityScope;
  targets: CalendarTargetPayload[];
} {
  if (dest.tipo === 'municipio') {
    return {
      visibility_scope: 'MUNICIPALITY',
      targets: [{ target_type: 'MUNICIPALITY', target_id: dest.municipio_id ?? '' }],
    };
  }
  return {
    visibility_scope: 'SCHOOL',
    targets: [{ target_type: 'SCHOOL', target_id: dest.escola_id ?? '' }],
  };
}

export async function getFilteredAvisos(
  _filters?: AvisosFilters,
  range?: { start: string; end: string }
): Promise<Aviso[]> {
  const { start, end } = range ?? avisoListDateRange();
  const { data } = await api.get<CalendarEventDTO[]>('/calendar/my-events', {
    params: { start, end, kind: 'aviso' },
  });
  const items = Array.isArray(data) ? data : [];
  const avisos = items.map(mapCalendarDtoToAviso);
  avisos.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return avisos;
}

export async function getAvisoById(id: string): Promise<Aviso | null> {
  try {
    const { data } = await api.get<{ event: CalendarEventDTO }>(`/calendar/events/${id}`);
    if (!data?.event) return null;
    return mapCalendarDtoToAviso(data.event);
  } catch {
    return null;
  }
}

export async function createAviso(dto: CreateAvisoDTO): Promise<Aviso> {
  const body = buildAvisoCreatePayload(dto);
  const { data } = await api.post<{ event: CalendarEventDTO }>('/calendar/events', body);
  if (!data?.event) {
    throw new Error('Resposta inválida ao criar aviso');
  }
  return mapCalendarDtoToAviso(data.event);
}

export async function updateAviso(_id: string, _data: Partial<CreateAvisoDTO>): Promise<Aviso> {
  const body: Record<string, unknown> = {};
  if (typeof _data.titulo === 'string') body.title = _data.titulo;
  if (typeof _data.mensagem === 'string') body.description = _data.mensagem;
  if (_data.destinatarios) {
    const { visibility_scope, targets } = buildTargetsAndVisibility(_data.destinatarios);
    body.visibility_scope = visibility_scope;
    body.targets = targets;
    body.metadata = {
      kind: 'aviso',
      destinatarios: _data.destinatarios,
    };
  }
  const { data } = await api.put<{ event: CalendarEventDTO }>(`/calendar/events/${_id}`, body);
  if (!data?.event) {
    throw new Error('Resposta inválida ao editar aviso');
  }
  return mapCalendarDtoToAviso(data.event);
}

export async function deleteAviso(_id: string): Promise<void> {
  await api.delete(`/calendar/events/${_id}`);
}

export async function markAvisoReadOnServer(avisoId: string): Promise<void> {
  await api.post(`/calendar/events/${avisoId}/read`);
}

export async function markManyAvisosReadOnServer(avisoIds: string[]): Promise<void> {
  await Promise.all(avisoIds.map((id) => markAvisoReadOnServer(id)));
}
