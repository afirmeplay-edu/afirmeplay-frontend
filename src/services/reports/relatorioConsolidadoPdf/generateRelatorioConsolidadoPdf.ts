import { api } from '@/lib/api';
import { loadCityBrandingForReportPdf } from '@/utils/pdfCityBranding';
import type { RelatorioConsolidado } from '@/types/relatorio-consolidado';
import {
  drawRelatorioConsolidadoCoverPage,
  type RelatorioConsolidadoCoverParams,
} from './drawCoverPage';
import { buildSumarioSections } from './buildSumarioSections';
import { drawRelatorioConsolidadoSumarioPage } from './drawSumarioPage';
import { drawRelatorioConsolidadoApresentacaoPage } from './drawApresentacaoPage';
import { drawRelatorioConsolidadoFrequenciaPages } from './drawFrequenciaConsolidadoPages';
import { drawRelatorioConsolidadoConsideracoesGeraisPage } from './drawConsideracoesGeraisPage';
import {
  drawRelatorioConsolidadoMediasNotaPages,
  drawRelatorioConsolidadoMediasProficienciaPages,
} from './drawMediasConsolidadoPages';
import { drawRelatorioConsolidadoAcertosHabilidadePages } from './drawAcertosHabilidadePages';
import { drawRelatorioConsolidadoDistribuicaoPages } from './drawDistribuicaoProficienciaPages';
import { drawRelatorioConsolidadoFooters } from './pdfShared';

export type GenerateRelatorioConsolidadoPdfOptions = {
  report: RelatorioConsolidado;
  cityId: string;
  /** REDE ou nome da escola (já resolvido na UI). */
  scopeLabel: string;
  /** Título customizado da avaliação fornecido pelo usuário. */
  tituloAvaliacao: string;
  /** Nome da prefeitura/instituição; se omitido, tenta buscar no `/city/:id`. */
  institutionName?: string;
  year?: number;
  fileName?: string;
};

function sanitizeFileName(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9\s\-_]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase() || 'relatorio-geral'
  );
}

async function resolveInstitutionName(
  cityId: string,
  explicit?: string
): Promise<string> {
  const trimmed = explicit?.trim();
  if (trimmed) return trimmed;

  try {
    const { data } = await api.get<Record<string, unknown>>(`/city/${cityId}`, {
      meta: { cityId },
    });
    const candidates = [
      data.institution,
      data.institution_name,
      data.instituicao,
      data.instituicao_nome,
      data.prefeitura_label,
      data.prefeitura,
    ];
    for (const raw of candidates) {
      if (typeof raw === 'string' && raw.trim()) return raw.trim();
    }
  } catch {
    // sem instituição configurada
  }
  return '';
}

export async function generateRelatorioConsolidadoPdf(
  opts: GenerateRelatorioConsolidadoPdfOptions
): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const { logo } = await loadCityBrandingForReportPdf(opts.cityId);
  const institutionName = await resolveInstitutionName(opts.cityId, opts.institutionName);

  const coverParams: RelatorioConsolidadoCoverParams = {
    institutionName,
    scopeLabel: opts.scopeLabel,
    year: opts.year,
    logo,
  };

  drawRelatorioConsolidadoCoverPage(pdf, coverParams);

  const sumarioSections = buildSumarioSections(opts.report);
  drawRelatorioConsolidadoSumarioPage(pdf, sumarioSections);

  drawRelatorioConsolidadoApresentacaoPage(pdf, {
    report: opts.report,
    logo,
    institutionName,
    year: opts.year,
    scopeLabel: opts.scopeLabel,
    tituloAvaliacao: opts.tituloAvaliacao,
  });

  await drawRelatorioConsolidadoFrequenciaPages(pdf, {
    report: opts.report,
    logo,
    institutionName,
    year: opts.year,
  });

  drawRelatorioConsolidadoConsideracoesGeraisPage(pdf, {
    logo,
    institutionName,
    year: opts.year,
  });

  await drawRelatorioConsolidadoMediasNotaPages(pdf, {
    report: opts.report,
    logo,
    institutionName,
    year: opts.year,
  });

  await drawRelatorioConsolidadoMediasProficienciaPages(pdf, {
    report: opts.report,
    logo,
    institutionName,
    year: opts.year,
  });

  await drawRelatorioConsolidadoAcertosHabilidadePages(pdf, {
    report: opts.report,
    logo,
    institutionName,
    year: opts.year,
  });

  await drawRelatorioConsolidadoDistribuicaoPages(pdf, {
    report: opts.report,
    logo,
    institutionName,
    year: opts.year,
  });

  drawRelatorioConsolidadoFooters(pdf, true);

  const municipio = opts.report.filtros.municipio_nome || 'municipio';
  const scope = sanitizeFileName(opts.scopeLabel);
  const base = opts.fileName ?? `relatorio-geral-${sanitizeFileName(municipio)}-${scope}`;
  const dated = `${base}-${new Date().toISOString().slice(0, 10)}.pdf`;
  pdf.save(dated);
}
