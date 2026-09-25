import { api } from '@/lib/api';

/** Resposta bruta da API GET /forms/results/filter-options */
interface RawFilterOptionsResponse {
  estados?: Array<{ id: string; nome?: string; name?: string }>;
  municipios?: Array<{ id: string; nome?: string; name?: string; estado_id?: string }>;
  formularios?: Array<{
    id: string;
    titulo?: string;
    customName?: string;
    custom_name?: string;
    nome?: string;
    name?: string;
    formType?: string;
    selectedGrades?: string[];
    selectedClasses?: string[];
  }>;
  escolas?: Array<{ id: string; nome?: string; name?: string; city_id?: string; municipio_id?: string }>;
  series?: Array<{ id: string; nome?: string; name?: string; education_stage_id?: string; educationStageId?: string }>;
  turmas?: Array<{ id: string; nome?: string; name?: string; grade_id?: string; school_id?: string }>;
}

/** Opções normalizadas (sempre id + name) para uso na UI */
export interface NormalizedFilterOptions {
  estados: Array<{ id: string; name: string; uf?: string }>;
  municipios: Array<{ id: string; name: string; state?: string }>;
  formularios: Array<{
    id: string;
    name: string;
    customName: string;
    formType?: string;
    selectedGrades: string[];
    selectedClasses: string[];
  }>;
  escolas: Array<{ id: string; name: string }>;
  series: Array<{ id: string; name: string }>;
  turmas: Array<{ id: string; name: string }>;
}

const emptyOptions: NormalizedFilterOptions = {
  estados: [],
  municipios: [],
  formularios: [],
  escolas: [],
  series: [],
  turmas: [],
};

function normalizeName(value: string | undefined): string {
  return (value ?? '').trim() || '—';
}

/**
 * Serviço para opções de filtro da tela de **resultados** de formulários.
 * Usa apenas GET /forms/results/filter-options (cascata: Estado → Município → Formulário → Escola → Série → Turma).
 */
export class FormResultsFiltersApiService {
  /**
   * Busca opções de filtro em cascata.
   * Retorna apenas os níveis preenchidos até o último parâmetro enviado (e anteriores).
   */
  static async getFilterOptions(params: {
    estado?: string;
    municipio?: string;
    formulario?: string;
    customName?: string;
    escola?: string;
    serie?: string;
    turma?: string;
  }): Promise<NormalizedFilterOptions> {
    try {
      const queryParams = new URLSearchParams();
      if (params.estado && params.estado !== 'all') queryParams.append('estado', params.estado);
      if (params.municipio && params.municipio !== 'all') queryParams.append('municipio', params.municipio);
      if (params.formulario && params.formulario !== 'all') queryParams.append('formulario', params.formulario);
      if (params.customName?.trim()) queryParams.append('customName', params.customName.trim());
      if (params.escola && params.escola !== 'all') queryParams.append('escola', params.escola);
      if (params.serie && params.serie !== 'all') queryParams.append('serie', params.serie);
      if (params.turma && params.turma !== 'all') queryParams.append('turma', params.turma);

      const url = `/forms/results/filter-options${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const requestConfig =
        params.municipio && params.municipio !== 'all' ? { meta: { cityId: params.municipio } } : {};
      const response = await api.get<RawFilterOptionsResponse>(url, requestConfig);
      const data = response.data || {};

      return {
        estados: (data.estados ?? []).map((e) => ({
          id: e.id,
          name: normalizeName(e.nome ?? e.name),
          uf: e.id,
        })),
        municipios: (data.municipios ?? []).map((m) => ({
          id: m.id,
          name: normalizeName(m.nome ?? m.name),
          state: params.estado,
        })),
        formularios: (data.formularios ?? []).map((f) => ({
          id: f.id,
          customName: normalizeName(f.customName ?? f.custom_name ?? f.titulo ?? f.nome ?? f.name),
          name: normalizeName(f.customName ?? f.custom_name ?? f.titulo ?? f.nome ?? f.name),
          formType: f.formType,
          selectedGrades: f.selectedGrades ?? [],
          selectedClasses: f.selectedClasses ?? [],
        })),
        escolas: (data.escolas ?? []).map((e) => ({
          id: e.id,
          name: normalizeName(e.nome ?? e.name),
        })),
        series: (data.series ?? []).map((s) => ({
          id: s.id,
          name: normalizeName(s.nome ?? s.name),
        })),
        turmas: (data.turmas ?? []).map((t) => ({
          id: t.id,
          name: normalizeName(t.nome ?? t.name),
        })),
      };
    } catch (error) {
      console.error('Erro ao buscar opções de filtro (resultados):', error);
      return emptyOptions;
    }
  }
}
