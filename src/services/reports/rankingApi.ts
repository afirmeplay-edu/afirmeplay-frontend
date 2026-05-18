import { api } from "@/lib/api";

export type RankingType = "general" | "specific_evaluation" | "specific_answer_sheet" | "teachers";
export type RankingScope = "turma" | "escola" | "municipio";

export interface RankingFilters {
  scope?: RankingScope;
  estado?: string;
  municipio?: string;
  escola?: string;
  serie?: string;
  turma?: string;
  periodo?: string;
  evaluation_id?: string;
  answer_sheet_id?: string;
}

export interface RankingResponseItem {
  position: number;
  [key: string]: unknown;
}

export interface RankingResponse {
  ranking_type: RankingType;
  scope: {
    scope?: string;
    city_id?: string | null;
    school_ids?: string[];
    class_ids?: string[];
  };
  filters: RankingFilters;
  items: RankingResponseItem[];
  students_items?: RankingResponseItem[];
  students_totals?: { count: number };
  students_pagination?: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
  series_labels?: string[];
  network_series_averages?: Array<{
    grade_name: string;
    average_score: number;
    average_proficiency: number;
    classification: string;
  }>;
  totals: { count: number };
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}

type GetRankingInput = {
  rankingType: RankingType;
  filters?: RankingFilters;
  page?: number;
  perPage?: number;
};

export class RankingApiService {
  static async getRanking({
    rankingType,
    filters = {},
    page = 1,
    perPage = 20,
  }: GetRankingInput): Promise<RankingResponse> {
    const estado = String(filters.estado || "").trim();
    const municipio = String(filters.municipio || "").trim();
    if (!estado || !municipio) {
      throw new Error("Selecione estado e município para consultar o ranking.");
    }
    if (rankingType === "specific_evaluation" && !String(filters.evaluation_id || "").trim()) {
      throw new Error("Selecione uma avaliação para consultar o ranking específico.");
    }
    if (rankingType === "specific_answer_sheet" && !String(filters.answer_sheet_id || "").trim()) {
      throw new Error("Selecione um cartão resposta para consultar o ranking específico.");
    }

    const params: Record<string, string | number> = {
      ranking_type: rankingType,
      page,
      per_page: perPage,
    };

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        params[key] = String(value);
      }
    });

    const response = await api.get<RankingResponse>("/ranking/report", { params });
    return response.data;
  }

  static getGeneralRanking(filters: RankingFilters, page = 1, perPage = 20) {
    return this.getRanking({ rankingType: "general", filters, page, perPage });
  }

  static getSpecificEvaluationRanking(filters: RankingFilters, page = 1, perPage = 20) {
    return this.getRanking({ rankingType: "specific_evaluation", filters, page, perPage });
  }

  static getSpecificAnswerSheetRanking(filters: RankingFilters, page = 1, perPage = 20) {
    return this.getRanking({ rankingType: "specific_answer_sheet", filters, page, perPage });
  }

  static getTeacherRanking(filters: RankingFilters, page = 1, perPage = 20) {
    return this.getRanking({ rankingType: "teachers", filters, page, perPage });
  }
}
