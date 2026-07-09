import { api } from '@/lib/api';

/** Resposta bruta da API GET /forms/results/inse-avaliacao/filter-options */
interface RawInseAvaliacaoFilterOptionsResponse {
  estados?: Array<{ id: string; nome?: string; name?: string; uf?: string }>;
  municipios?: Array<{ id: string; nome?: string; name?: string; estado_id?: string }>;
  formularios?: Array<{ id: string; titulo?: string; nome?: string; name?: string; formType?: string }>;
  avaliacoes?: Array<{ id: string; titulo?: string; nome?: string }>;
  escolas?: Array<{ id: string; nome?: string; name?: string; city_id?: string; municipio_id?: string }>;
  series?: Array<{ id: string; nome?: string; name?: string; education_stage_id?: string; educationStageId?: string }>;
  series_disponiveis?: Array<{ id: string; nome?: string; name?: string }>;
  turmas?: Array<{ id: string; nome?: string; name?: string; grade_id?: string; school_id?: string }>;
}

export interface InseAvaliacaoFilterOptions {
  estados: Array<{ id: string; name: string; uf?: string }>;
  municipios: Array<{ id: string; name: string }>;
  formularios: Array<{ id: string; name: string; formType?: string }>;
  avaliacoes: Array<{ id: string; name: string }>;
  escolas: Array<{ id: string; name: string }>;
  series: Array<{ id: string; name: string }>;
  series_disponiveis: Array<{ id: string; name: string }>;
  turmas: Array<{ id: string; name: string }>;
}

const emptyOptions: InseAvaliacaoFilterOptions = {
  estados: [],
  municipios: [],
  formularios: [],
  avaliacoes: [],
  escolas: [],
  series: [],
  series_disponiveis: [],
  turmas: [],
};

function normalizeName(value: string | undefined): string {
  return (value ?? '').trim() || '—';
}

/**
 * Serviço para opções de filtro da tela INSE x Avaliação.
 * GET /forms/results/inse-avaliacao/filter-options
 * Cascata: Estado → Município → Formulário + Avaliação → Escola → Série → Turma
 */
export class InseAvaliacaoFiltersApiService {
  static async getFilterOptions(params: {
    estado?: string;
    municipio?: string;
    formulario?: string;
    avaliacao?: string;
    escola?: string;
    serie?: string;
    turma?: string;
    serie_filtro?: string;
    nome?: string;
  }): Promise<InseAvaliacaoFilterOptions> {
    try {
      const queryParams = new URLSearchParams();
      if (params.estado && params.estado !== 'all') queryParams.append('estado', params.estado);
      if (params.municipio && params.municipio !== 'all') queryParams.append('municipio', params.municipio);
      if (params.formulario && params.formulario !== 'all') queryParams.append('formulario', params.formulario);
      if (params.avaliacao && params.avaliacao !== 'all') queryParams.append('avaliacao', params.avaliacao);
      if (params.escola && params.escola !== 'all') queryParams.append('escola', params.escola);
      if (params.serie && params.serie !== 'all') queryParams.append('serie', params.serie);
      if (params.turma && params.turma !== 'all') queryParams.append('turma', params.turma);
      if (params.serie_filtro && params.serie_filtro !== 'all') {
        queryParams.append('serie_filtro', params.serie_filtro);
      }
      if (params.nome?.trim()) queryParams.append('nome', params.nome.trim());

      const url = `/forms/results/inse-avaliacao/filter-options${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const requestConfig =
        params.municipio && params.municipio !== 'all' ? { meta: { cityId: params.municipio } } : {};
      const response = await api.get<RawInseAvaliacaoFilterOptionsResponse>(url, requestConfig);
      const data = response.data || {};

      return {
        estados: (data.estados ?? []).map((e) => ({
          id: e.id,
          name: normalizeName(e.nome ?? e.name),
          uf: e.uf,
        })),
        municipios: (data.municipios ?? []).map((m) => ({
          id: m.id,
          name: normalizeName(m.nome ?? m.name),
        })),
        formularios: (data.formularios ?? []).map((f) => ({
          id: f.id,
          name: normalizeName(f.titulo ?? f.nome ?? f.name),
          formType: f.formType,
        })),
        avaliacoes: (data.avaliacoes ?? []).map((a) => ({
          id: a.id,
          name: normalizeName(a.titulo ?? a.nome),
        })),
        escolas: (data.escolas ?? []).map((e) => ({
          id: e.id,
          name: normalizeName(e.nome ?? e.name),
        })),
        series: (data.series ?? []).map((s) => ({
          id: s.id,
          name: normalizeName(s.nome ?? s.name),
        })),
        series_disponiveis: (data.series_disponiveis ?? []).map((s) => ({
          id: s.id,
          name: normalizeName(s.nome ?? s.name),
        })),
        turmas: (data.turmas ?? []).map((t) => ({
          id: t.id,
          name: normalizeName(t.nome ?? t.name),
        })),
      };
    } catch (error) {
      console.error('Erro ao buscar opções de filtro (INSE x Avaliação):', error);
      return emptyOptions;
    }
  }
}
