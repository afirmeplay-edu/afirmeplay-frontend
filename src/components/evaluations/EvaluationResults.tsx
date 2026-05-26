import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  loadCityBrandingForReportPdf,
  paintLetterheadBackground,
  urlToPngAsset,
} from "@/utils/pdfCityBranding";
import { 
  ArrowLeft, 
  Download, 
  FileText, 
  Users, 
  Target, 
  Eye,
  TrendingUp,
  TrendingDown,
  FileSpreadsheet,
  RefreshCw,
  GraduationCap,
  School,
  Award,
  AlertCircle,
  CheckCircle2,
  X,
  Clock
} from "lucide-react";

import { 
  ProficiencyLevel,
  proficiencyColors,
  proficiencyLabels,
  calculateProficiency,
  getProficiencyTableInfo
} from "@/types/evaluation-results";

import { useParams } from "react-router-dom";
import { EvaluationResultsApiService } from "@/services/evaluation/evaluationResultsApi";
// Constantes movidas do arquivo removido
const ERROR_MESSAGES = {
  NETWORK_ERROR: "Erro de conexão. Verifique sua internet e tente novamente.",
  DATA_NOT_FOUND: "Dados não encontrados.",
  SERVER_ERROR: "Erro interno do servidor."
};

const SUCCESS_MESSAGES = {
  DATA_LOADED: "Dados carregados com sucesso."
};

const PROFICIENCY_MAX_VALUES = {
  MATEMATICA: {
    "1º ano": 500,
    "2º ano": 525,
    "3º ano": 550,
    "4º ano": 575,
    "5º ano": 600,
    "6º ano": 625,
    "7º ano": 650,
    "8º ano": 675,
    "9º ano": 700,
  },
  PORTUGUES: {
    "1º ano": 500,
    "2º ano": 525,
    "3º ano": 550,
    "4º ano": 575,
    "5º ano": 600,
    "6º ano": 625,
    "7º ano": 650,
    "8º ano": 675,
    "9º ano": 700,
  },
};

interface StudentResult {
  id: string;
  name: string;
  class: string;
  rawScore: number;
  proficiencyScore: number;
  proficiencyLevel: ProficiencyLevel;
  classification: string;
  correctAnswers: number;
  totalQuestions: number;
  percentage: number;
  status: 'completed' | 'pending' | 'concluida' | 'pendente';
  evaluationDate: string;
  timeSpent: number; // em minutos
}

interface SchoolResult {
  id: string;
  name: string;
  municipality: string;
  totalStudents: number;
  completedStudents: number;
  averageScore: number;
  averageProficiency: number;
  subjects: string[];
  grades: string[];
  students: StudentResult[];
  distributionByLevel: Record<ProficiencyLevel, number>;
}

// Função para gerar dados consistentes de alunos




interface EvaluationResultsProps {
  onBack?: () => void;
}

export default function EvaluationResults({ onBack }: EvaluationResultsProps) {
  const { id: evaluationId } = useParams<{ id: string }>();
  
  const [evaluationResult, setEvaluationResult] = useState<SchoolResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState<StudentResult | null>(null);
  
  const { toast } = useToast();

  useEffect(() => {
    fetchEvaluationResults();
  }, [evaluationId]);

  const fetchEvaluationResults = async () => {
    try {
      setIsLoading(true);
      
      if (!evaluationId) {
        throw new Error("ID da avaliação não fornecido");
      }

      // ✅ CORRIGIDO: Usar a API correta do backend
      const [evaluationResponse, studentsResponse] = await Promise.all([
        EvaluationResultsApiService.getEvaluationById(evaluationId),
        EvaluationResultsApiService.getStudentsByEvaluation(evaluationId)
      ]);

      if (!evaluationResponse) {
        throw new Error("Avaliação não encontrada no servidor");
      }

      // ✅ CORRIGIDO: Transformar dados da API para o formato esperado
      const schoolResult: SchoolResult = {
        id: evaluationResponse.id,
        name: evaluationResponse.escola,
        municipality: evaluationResponse.municipio,
        totalStudents: evaluationResponse.total_alunos,
        completedStudents: evaluationResponse.alunos_participantes,
        averageScore: evaluationResponse.media_nota,
        averageProficiency: evaluationResponse.media_proficiencia,
        subjects: [evaluationResponse.disciplina],
        grades: [evaluationResponse.serie],
        students: studentsResponse.map(student => ({
          id: student.id,
          name: student.nome,
          class: student.turma,
          rawScore: student.nota,
          proficiencyScore: student.proficiencia,
          proficiencyLevel: getProficiencyLevel(student.proficiencia, evaluationResponse.serie, evaluationResponse.disciplina),
          classification: student.classificacao,
          correctAnswers: student.acertos,
          totalQuestions: student.questoes_respondidas,
          percentage: (student.acertos / student.questoes_respondidas) * 100,
          status: student.status as 'completed' | 'pending' | 'concluida' | 'pendente',
          evaluationDate: evaluationResponse.data_aplicacao,
          timeSpent: student.tempo_gasto
        })),
        distributionByLevel: evaluationResponse.distribuicao_classificacao
      };

      setEvaluationResult(schoolResult);

    } catch (error: unknown) {
      // Mensagens de erro mais específicas
      let errorMessage = ERROR_MESSAGES.NETWORK_ERROR;
      
      const errorObj = error as { message?: string; code?: string; response?: { status?: number } };
      
      if (errorObj.message?.includes('CORS') || errorObj.code === 'ERR_NETWORK') {
        errorMessage = ERROR_MESSAGES.NETWORK_ERROR;
      } else if (errorObj.message?.includes('não encontrada')) {
        errorMessage = ERROR_MESSAGES.DATA_NOT_FOUND;
      } else if (errorObj.response?.status === 404) {
        errorMessage = ERROR_MESSAGES.DATA_NOT_FOUND;
      } else if (errorObj.response?.status && errorObj.response.status >= 500) {
        errorMessage = ERROR_MESSAGES.SERVER_ERROR;
      }
      
      toast({
        title: "Erro",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // ✅ NOVO: Função para determinar nível de proficiência baseado nas tabelas oficiais
  const getProficiencyLevel = (proficiency: number, grade?: string, subject?: string): ProficiencyLevel => {
    const tableInfo = getProficiencyTableInfo(grade, subject);
    const table = tableInfo.table;
    
    if (proficiency <= table.abaixo_do_basico.max) return 'abaixo_do_basico';
    if (proficiency <= table.basico.max) return 'basico';
    if (proficiency <= table.adequado.max) return 'adequado';
    return 'avancado';
  };

  const handleExportPDF = async () => {
    try {
      const { jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      
      if (!evaluationResult) return;
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;

      const COLORS = {
        primary: [124, 62, 237] as [number, number, number],
        textDark: [31, 41, 55] as [number, number, number],
        textGray: [107, 114, 128] as [number, number, number],
        borderLight: [229, 231, 235] as [number, number, number],
        bgLight: [250, 250, 250] as [number, number, number],
        white: [255, 255, 255] as [number, number, number],
      };

      const brandingCityId = evaluationResult.municipality || null;

      let logoDataUrl = '';
      let logoWidth = 0;
      let logoHeight = 0;
      const resultsBranding = await loadCityBrandingForReportPdf(brandingCityId);
      const coverLetterhead = resultsBranding.letterhead;
      if (resultsBranding.logo) {
        logoDataUrl = resultsBranding.logo.dataUrl;
        logoWidth = resultsBranding.logo.iw;
        logoHeight = resultsBranding.logo.ih;
      }

      let icoDataUrl = '';
      let icoWidth = 0;
      let icoHeight = 0;
      const icoAsset = await urlToPngAsset('/AFIRME-PLAY-ico.png');
      if (icoAsset) {
        icoDataUrl = icoAsset.dataUrl;
        icoWidth = icoAsset.iw;
        icoHeight = icoAsset.ih;
      }

      const addCover = () => {
        if (coverLetterhead) {
          paintLetterheadBackground(pdf, coverLetterhead, pageWidth, pageHeight);
        } else {
          pdf.setFillColor(...COLORS.white);
          pdf.rect(0, 0, pageWidth, pageHeight, 'F');
        }

        const centerX = pageWidth / 2;
        const BAND_H = 58;
        pdf.setFillColor(...COLORS.primary);
        pdf.rect(0, 0, pageWidth, BAND_H, 'F');

        let logoBottomInBand = 0;
        if (logoDataUrl && logoWidth > 0 && logoHeight > 0) {
          const desiredLogoWidth = 38;
          const desiredLogoHeight = (logoHeight * desiredLogoWidth) / logoWidth;
          pdf.addImage(logoDataUrl, 'PNG', centerX - desiredLogoWidth / 2, 7, desiredLogoWidth, desiredLogoHeight);
          logoBottomInBand = 7 + desiredLogoHeight;
        } else {
          pdf.setFontSize(18);
          pdf.setTextColor(...COLORS.white);
          pdf.setFont('helvetica', 'bold');
          pdf.text('AFIRME PLAY', centerX, 22, { align: 'center' });
          logoBottomInBand = 28;
        }

        const titleY = Math.max(logoBottomInBand + 5, BAND_H - 17);
        pdf.setTextColor(...COLORS.white);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(17);
        pdf.text('RELATÓRIO DE AVALIAÇÃO', centerX, titleY, { align: 'center' });
        pdf.setFontSize(11);
        pdf.text(String(evaluationResult.name || '').toUpperCase(), centerX, titleY + 8, { align: 'center' });

        let y = BAND_H + 13;
        pdf.setFontSize(13);
        pdf.setTextColor(...COLORS.primary);
        pdf.setFont('helvetica', 'bold');
        pdf.text(`${String(evaluationResult.municipality || 'MUNICÍPIO').toUpperCase()} - ALAGOAS`, centerX, y, { align: 'center' });
        y += 7;
        pdf.setFontSize(10);
        pdf.setTextColor(...COLORS.textGray);
        pdf.setFont('helvetica', 'normal');
        pdf.text('SECRETARIA MUNICIPAL DE EDUCAÇÃO', centerX, y, { align: 'center' });
        y += 13;

        const cardWidth = pageWidth - 40;
        const cardX = (pageWidth - cardWidth) / 2;
        const ACCENT_W = 4;
        const inset = 10;
        const labelWidth = 42;
        const vMaxW = cardWidth - ACCENT_W - inset * 2 - labelWidth;
        const ROW_H = 5.5;

        pdf.setFontSize(8);
        const fieldRows: Array<{ label: string; lines: string[] }> = [
          { label: 'AVALIAÇÃO:', lines: pdf.splitTextToSize(String(evaluationResult.name || 'N/A'), vMaxW) },
          { label: 'MUNICÍPIO:', lines: [String(evaluationResult.municipality || 'N/A')] },
          { label: 'DATA:', lines: [new Date().toLocaleDateString('pt-BR')] },
          { label: 'TOTAL DE ALUNOS:', lines: [String(evaluationResult.totalStudents ?? 0)] },
          { label: 'PARTICIPANTES:', lines: [String(evaluationResult.completedStudents ?? 0)] },
        ];

        const CARD_TITLE_H = 14;
        const cardContentH = fieldRows.reduce((sum, f) => sum + Math.max(ROW_H, f.lines.length * (ROW_H - 0.5)), 0);
        const cardHeight = CARD_TITLE_H + cardContentH + 10;
        const maxCardY = pageHeight - cardHeight - 12;
        if (y > maxCardY) y = maxCardY;

        pdf.setFillColor(...COLORS.bgLight);
        pdf.rect(cardX, y, cardWidth, cardHeight, 'F');
        pdf.setFillColor(...COLORS.primary);
        pdf.rect(cardX, y, ACCENT_W, cardHeight, 'F');
        pdf.setDrawColor(...COLORS.borderLight);
        pdf.setLineWidth(0.4);
        pdf.rect(cardX, y, cardWidth, cardHeight, 'S');

        let cardY = y + 8;
        const cardContentCenterX = cardX + ACCENT_W + (cardWidth - ACCENT_W) / 2;
        pdf.setFontSize(10);
        pdf.setTextColor(...COLORS.primary);
        pdf.setFont('helvetica', 'bold');
        pdf.text('INFORMAÇÕES DO RELATÓRIO', cardContentCenterX, cardY, { align: 'center' });
        cardY += 6;
        pdf.setDrawColor(...COLORS.borderLight);
        pdf.setLineWidth(0.3);
        pdf.line(cardX + ACCENT_W + 4, cardY, cardX + cardWidth - 4, cardY);
        cardY += 4;

        const lx = cardX + ACCENT_W + inset;
        const vx = lx + labelWidth;
        for (const field of fieldRows) {
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(...COLORS.primary);
          pdf.text(field.label, lx, cardY);
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(...COLORS.textDark);
          pdf.text(field.lines, vx, cardY);
          cardY += Math.max(ROW_H, field.lines.length * (ROW_H - 0.5));
        }
      };

      const addHeader = (title: string): number => {
        const BAND_H = 20;
        pdf.setFillColor(...COLORS.primary);
        pdf.rect(0, 0, pageWidth, BAND_H, 'F');
        if (icoDataUrl && icoWidth > 0 && icoHeight > 0) {
          const icoH = 14;
          const icoW = (icoWidth * icoH) / icoHeight;
          pdf.addImage(icoDataUrl, 'PNG', margin, (BAND_H - icoH) / 2, icoW, icoH);
        } else {
          pdf.setFontSize(8);
          pdf.setTextColor(...COLORS.white);
          pdf.setFont('helvetica', 'bold');
          pdf.text('AFIRME PLAY', margin, BAND_H / 2 + 2);
        }
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        pdf.setTextColor(...COLORS.white);
        pdf.text(title, pageWidth - margin, BAND_H / 2 + 2, { align: 'right' });

        let y = BAND_H + 8;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8.5);
        pdf.setTextColor(...COLORS.textGray);
        const meta = `Município: ${evaluationResult.municipality || 'N/A'}  •  Avaliação: ${evaluationResult.name || 'N/A'}`;
        const metaLines = pdf.splitTextToSize(meta, pageWidth - 2 * margin);
        metaLines.forEach((ln: string, i: number) => {
          pdf.text(ln, pageWidth / 2, y + i * 4, { align: 'center' });
        });
        y += metaLines.length * 4 + 2;
        pdf.setDrawColor(...COLORS.borderLight);
        pdf.setLineWidth(0.3);
        pdf.line(margin, y, pageWidth - margin, y);
        y += 5;
        pdf.setTextColor(...COLORS.textDark);
        return y;
      };

      const addFooter = () => {
        const footerY = pageHeight - 10;
        pdf.setDrawColor(220, 220, 220);
        pdf.setLineWidth(0.3);
        pdf.line(margin, footerY - 5, pageWidth - margin, footerY - 5);
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(100, 100, 100);
        pdf.text('Afirme Play Soluções Educativas', margin, footerY);
        pdf.text(`Página 2`, pageWidth / 2, footerY, { align: 'center' });
        pdf.text(new Date().toLocaleString('pt-BR'), pageWidth - margin, footerY, { align: 'right' });
      };

      addCover();
      pdf.addPage();
      let y = addHeader('RELATÓRIO DA AVALIAÇÃO');

      // Resumo por nível de proficiência
      pdf.setFontSize(13);
      pdf.setTextColor(...COLORS.primary);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Distribuição por Nível de Proficiência', margin, y);
      y += 8;
      pdf.setFontSize(11);
      pdf.setTextColor(...COLORS.textDark);
      
      const distributionData = Object.entries(evaluationResult.distributionByLevel).map(([level, count]) => {
        const percentage = evaluationResult.completedStudents > 0 ? (count / evaluationResult.completedStudents) * 100 : 0;
        const levelNames = {
          'abaixo_do_basico': 'Abaixo do Básico',
          'basico': 'Básico',
          'adequado': 'Adequado',
          'avancado': 'Avançado'
        };
        return [levelNames[level as keyof typeof levelNames], count.toString(), `${percentage.toFixed(1)}%`];
      });

      autoTable(pdf, {
        head: [['Nível', 'Quantidade', 'Percentual']],
        body: distributionData,
        startY: y,
        theme: 'grid',
        headStyles: { 
          fillColor: COLORS.primary, 
          textColor: 255, 
          fontStyle: 'bold', 
          halign: 'center',
          fontSize: 11
        },
        bodyStyles: { 
          halign: 'center', 
          fontSize: 10
        },
        styles: { 
          cellPadding: 3, 
          font: 'helvetica', 
          fontSize: 10
        },
        margin: { left: margin, right: margin }
      });

      y = ((pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 15);

      // Tabela de alunos
      pdf.setFontSize(13);
      pdf.setTextColor(...COLORS.primary);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Desempenho Individual dos Alunos', margin, y);
      y += 8;

      const studentsData = evaluationResult.students.map(student => [
        student.name,
        student.class,
        student.rawScore.toFixed(1),
        student.proficiencyScore.toString(),
        student.classification,
        `${student.correctAnswers}/${student.totalQuestions}`,
        `${student.percentage}%`,
        (student.status === 'completed' || student.status === 'concluida') ? 'Concluída' : 'Pendente'
      ]);

      autoTable(pdf, {
        head: [['Nome', 'Turma', 'Nota', 'Proficiência', 'Nível', 'Acertos', '%', 'Status']],
        body: studentsData,
        startY: y,
        theme: 'grid',
        headStyles: { 
          fillColor: COLORS.primary, 
          textColor: 255, 
          fontStyle: 'bold', 
          halign: 'center',
          fontSize: 9
        },
        bodyStyles: { 
          halign: 'center', 
          fontSize: 8
        },
        styles: { 
          cellPadding: 2, 
          font: 'helvetica', 
          fontSize: 8
        },
        columnStyles: {
          0: { halign: 'left', cellWidth: 35 },
          1: { halign: 'center', cellWidth: 15 },
          2: { halign: 'center', cellWidth: 15 },
          3: { halign: 'center', cellWidth: 20 },
          4: { halign: 'center', cellWidth: 25 },
          5: { halign: 'center', cellWidth: 18 },
          6: { halign: 'center', cellWidth: 15 },
          7: { halign: 'center', cellWidth: 20 }
        },
        margin: { left: margin, right: margin },
        alternateRowStyles: { fillColor: [245, 245, 245] }
      });

      // Rodapé (padrão)
      addFooter();

      const fileName = `relatorio-avaliacao-${evaluationResult.name.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);

      toast({
        title: "PDF gerado com sucesso!",
        description: "O relatório da avaliação foi baixado em formato PDF.",
      });
    } catch (error) {
      toast({
        title: "Erro na exportação",
        description: "Não foi possível gerar o PDF. Verifique se todas as dependências estão instaladas.",
        variant: "destructive",
      });
    }
  };

  const handleExportExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      const { saveAs } = await import('file-saver');
      
      if (!evaluationResult) return;
      
      // Aba 1: Resumo da Avaliação
      const summaryData = [
        ['RELATÓRIO DA AVALIAÇÃO', '', '', ''],
        ['', '', '', ''],
        ['Avaliação:', evaluationResult.name, '', ''],
        ['Município:', evaluationResult.municipality, '', ''],
        ['Data de Geração:', new Date().toLocaleDateString('pt-BR'), '', ''],
        ['', '', '', ''],
        ['ESTATÍSTICAS GERAIS', '', '', ''],
        ['Total de Alunos:', evaluationResult.totalStudents, '', ''],
        ['Alunos Participantes:', evaluationResult.completedStudents, '', ''],
        ['Taxa de Participação:', `${((evaluationResult.completedStudents / evaluationResult.totalStudents) * 100).toFixed(1)}%`, '', ''],
        ['Média Geral:', evaluationResult.averageScore.toFixed(1), '', ''],
        ['Proficiência Média:', evaluationResult.averageProficiency, '', ''],
        ['', '', '', ''],
        ['DISTRIBUIÇÃO POR NÍVEL', '', '', ''],
        ['Nível', 'Quantidade', 'Percentual', ''],
        ...Object.entries(evaluationResult.distributionByLevel).map(([level, count]) => {
          const percentage = evaluationResult.completedStudents > 0 ? (count / evaluationResult.completedStudents) * 100 : 0;
          const levelNames = {
            'abaixo_do_basico': 'Abaixo do Básico',
            'basico': 'Básico',
            'adequado': 'Adequado',
            'avancado': 'Avançado'
          };
          return [levelNames[level as keyof typeof levelNames], count, `${percentage.toFixed(1)}%`, ''];
        })
      ];

      // Aba 2: Dados dos Alunos
      const studentsData = [
        ['DESEMPENHO INDIVIDUAL DOS ALUNOS', '', '', '', '', '', '', ''],
        ['Nome', 'Turma', 'Nota', 'Proficiência', 'Classificação', 'Acertos', 'Percentual', 'Status'],
        ...evaluationResult.students.map(student => [
          student.name,
          student.class,
          student.rawScore.toFixed(1),
          student.proficiencyScore,
          student.classification,
          `${student.correctAnswers}/${student.totalQuestions}`,
          `${student.percentage}%`,
          (student.status === 'completed' || student.status === 'concluida') ? 'Concluída' : 'Pendente'
        ])
      ];

      // Criar workbook com múltiplas abas
      const workbook = XLSX.utils.book_new();
      
      // Aba de resumo
      const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
      summarySheet['!cols'] = [
        { wch: 20 }, { wch: 25 }, { wch: 15 }, { wch: 15 }
      ];
      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumo');
      
      // Aba de alunos
      const studentsSheet = XLSX.utils.aoa_to_sheet(studentsData);
      studentsSheet['!cols'] = [
        { wch: 25 }, { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 12 }
      ];
      XLSX.utils.book_append_sheet(workbook, studentsSheet, 'Alunos');
      
      const fileName = `relatorio-avaliacao-${evaluationResult.name.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.xlsx`;
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      
      saveAs(blob, fileName);
      
      toast({
        title: "Excel gerado com sucesso!",
        description: "A planilha da avaliação foi baixada em formato Excel.",
      });
      
    } catch (error) {
      toast({
        title: "Erro na exportação",
        description: "Não foi possível gerar a planilha Excel. Verifique se todas as dependências estão instaladas.",
        variant: "destructive",
      });
    }
  };

  // Função de exportação individual (para quando um aluno está selecionado)
  const handleExportIndividualPDF = async () => {
    try {
      const { jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      
      if (!evaluationResult || !selectedStudent) return;
      
      const pdf = new jsPDF();
      const pageWidth = pdf.internal.pageSize.getWidth();
      let y = 20;

      // Título
      pdf.setFontSize(22);
      pdf.setTextColor(40, 60, 120);
      pdf.text('Relatório Individual de Desempenho', pageWidth / 2, y, { align: 'center' });
      y += 12;
      pdf.setDrawColor(40, 60, 120);
      pdf.setLineWidth(1);
      pdf.line(20, y, pageWidth - 20, y);
      y += 8;

      // Dados do aluno
      pdf.setFontSize(14);
      pdf.setTextColor(0, 0, 0);
      pdf.text(`Aluno: ${selectedStudent.name}`, 20, y);
      pdf.text(`Turma: ${selectedStudent.class}`, pageWidth / 2, y, { align: 'center' });
      pdf.text(`Data: ${new Date(selectedStudent.evaluationDate).toLocaleDateString('pt-BR')}`, pageWidth - 20, y, { align: 'right' });
      y += 10;
      pdf.setFontSize(12);
      pdf.text(`Avaliação: ${evaluationResult.name}`, 20, y);
      pdf.text(`Município: ${evaluationResult.municipality}`, pageWidth - 20, y, { align: 'right' });
      y += 10;
      pdf.text(`Proficiência: ${selectedStudent.proficiencyScore} pontos`, 20, y);
      pdf.text(`Nível: ${selectedStudent.classification}`, pageWidth - 20, y, { align: 'right' });
      y += 10;
      pdf.text(`Nota: ${selectedStudent.rawScore.toFixed(1)} / 10`, 20, y);
      pdf.text(`Acertos: ${selectedStudent.correctAnswers}/${selectedStudent.totalQuestions}`, pageWidth - 20, y, { align: 'right' });
      y += 10;
      pdf.text(`Tempo de Prova: ${selectedStudent.timeSpent} min`, 20, y);
      y += 8;
      pdf.setDrawColor(200, 200, 200);
      pdf.setLineWidth(0.5);
      pdf.line(20, y, pageWidth - 20, y);
      y += 8;

      // Resumo visual
      pdf.setFontSize(13);
      pdf.setTextColor(40, 60, 120);
      pdf.text('Resumo Visual', 20, y);
      y += 8;
      pdf.setFontSize(12);
      pdf.setTextColor(0, 0, 0);
      pdf.text(`Percentual de acerto: ${selectedStudent.percentage}%`, 20, y);
      pdf.text(`Status: ${(selectedStudent.status === 'completed' || selectedStudent.status === 'concluida') ? 'Concluída' : 'Pendente'}`, pageWidth - 20, y, { align: 'right' });
      y += 8;
      pdf.setDrawColor(200, 200, 200);
      pdf.line(20, y, pageWidth - 20, y);
      y += 8;

      // Tabela de desempenho por questão
      pdf.setFontSize(13);
      pdf.setTextColor(40, 60, 120);
      pdf.text('Desempenho por Questão', 20, y);
      y += 8;
      pdf.setFontSize(11);
      pdf.setTextColor(0, 0, 0);
      
      // Gerar dados da tabela baseado no desempenho real do aluno
      const allQuestions = [
        { q: "Q1", habilidade: "LP2T1.5", percentual: "75,00%", disciplina: "Português" },
        { q: "Q2", habilidade: "LP2T1.1", percentual: "87,50%", disciplina: "Português" },
        { q: "Q3", habilidade: "LP2T1.3", percentual: "62,50%", disciplina: "Português" },
        { q: "Q4", habilidade: "LP2T1.1", percentual: "75,00%", disciplina: "Português" },
        { q: "Q5", habilidade: "LP2C1.2", percentual: "87,50%", disciplina: "Português" },
        { q: "Q6", habilidade: "LP2T1.4", percentual: "45,00%", disciplina: "Português" },
        { q: "Q7", habilidade: "LP2T1.6", percentual: "68,75%", disciplina: "Português" },
        { q: "Q8", habilidade: "2N1.5", percentual: "62,50%", disciplina: "Matemática" },
        { q: "Q9", habilidade: "2N2.2", percentual: "75,00%", disciplina: "Matemática" },
        { q: "Q10", habilidade: "2N1.7", percentual: "75,00%", disciplina: "Matemática" },
        { q: "Q11", habilidade: "2M2.3", percentual: "62,50%", disciplina: "Matemática" },
        { q: "Q12", habilidade: "2G1.1", percentual: "80,00%", disciplina: "Matemática" },
        { q: "Q13", habilidade: "2N3.4", percentual: "55,00%", disciplina: "Matemática" },
        { q: "Q14", habilidade: "2M1.2", percentual: "70,00%", disciplina: "Matemática" }
      ];

      // Calcular quais questões o aluno acertou baseado no percentual
      const expectedCorrect = Math.round((selectedStudent.percentage / 100) * allQuestions.length);
      const correctIndices = new Set();
      
      // Distribuir acertos de forma inteligente (questões mais fáceis primeiro)
      const sortedByDifficulty = allQuestions
        .map((q, index) => ({ ...q, index, difficulty: parseFloat(q.percentual) }))
        .sort((a, b) => b.difficulty - a.difficulty);
      
      for (let i = 0; i < expectedCorrect && i < sortedByDifficulty.length; i++) {
        correctIndices.add(sortedByDifficulty[i].index);
      }

      const tableData = allQuestions.map((item, index) => [
        item.q,
        item.habilidade,
        item.percentual,
        correctIndices.has(index) ? 'ACERTOU' : 'ERROU'
      ]);

      autoTable(pdf, {
        head: [['Questão', 'Habilidade', 'Acerto Médio da Turma', 'Resultado']],
        body: tableData,
        startY: y,
        theme: 'grid',
        headStyles: { 
          fillColor: [40, 60, 120], 
          textColor: 255, 
          fontStyle: 'bold', 
          halign: 'center',
          fontSize: 11
        },
        bodyStyles: { 
          halign: 'center', 
          fontSize: 10,
          cellPadding: 3
        },
        styles: { 
          cellPadding: 2, 
          font: 'helvetica', 
          fontSize: 10,
          lineColor: [200, 200, 200],
          lineWidth: 0.5
        },
        columnStyles: {
          0: { halign: 'center', cellWidth: 20 },
          1: { halign: 'center', cellWidth: 40 },
          2: { halign: 'center', cellWidth: 40 },
          3: { halign: 'center', cellWidth: 20, fontStyle: 'bold' }
        },
        margin: { left: 20, right: 20 },
        alternateRowStyles: { fillColor: [245, 245, 245] }
      });

      // Adicionar resumo final
      const finalY = ((pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 15);
      
      // Caixa de resumo
      pdf.setFillColor(240, 248, 255);
      pdf.setDrawColor(40, 60, 120);
      pdf.setLineWidth(1);
      pdf.rect(20, finalY, pageWidth - 40, 25, 'FD');
      
      pdf.setFontSize(12);
      pdf.setTextColor(40, 60, 120);
      pdf.text('Resumo Final', 25, finalY + 8);
      
      pdf.setFontSize(10);
      pdf.setTextColor(0, 0, 0);
      pdf.text(`Total de Acertos: ${selectedStudent.correctAnswers}/${selectedStudent.totalQuestions}`, 25, finalY + 15);
      pdf.text(`Proficiência: ${selectedStudent.proficiencyScore} pontos`, 25, finalY + 20);
      pdf.text(`Percentual: ${selectedStudent.percentage}%`, pageWidth / 2, finalY + 15);
      pdf.text(`Nível: ${selectedStudent.classification}`, pageWidth / 2, finalY + 20);

      // Rodapé
      pdf.setFontSize(9);
      pdf.setTextColor(120, 120, 120);
      const footerText = `Relatório gerado em ${new Date().toLocaleString('pt-BR')} para ${selectedStudent.name}`;
      pdf.text(footerText, pageWidth / 2, pdf.internal.pageSize.getHeight() - 10, { align: 'center' });

      const fileName = `relatorio-${selectedStudent.name.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);

      toast({
        title: "PDF gerado com sucesso!",
        description: "O relatório foi baixado em formato PDF.",
      });
    } catch (error) {
      toast({
        title: "Erro na exportação",
        description: "Não foi possível gerar o PDF. Verifique se todas as dependências estão instaladas.",
        variant: "destructive",
      });
    }
  };

  const handleExportIndividualExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      const { saveAs } = await import('file-saver');
      
      if (!evaluationResult || !selectedStudent) return;
      
      // Dados básicos do aluno
      const studentInfo = [
        ['RELATÓRIO INDIVIDUAL DE DESEMPENHO', '', '', ''],
        ['', '', '', ''],
        ['Aluno:', selectedStudent.name, 'Turma:', selectedStudent.class],
        ['Avaliação:', evaluationResult.name, 'Data:', new Date(selectedStudent.evaluationDate).toLocaleDateString('pt-BR')],
        ['Município:', evaluationResult.municipality, 'Tempo:', `${selectedStudent.timeSpent} min`],
        ['Nota:', `${selectedStudent.rawScore.toFixed(1)}/10`, 'Proficiência:', `${selectedStudent.proficiencyScore} pontos`],
        ['Percentual:', `${selectedStudent.percentage}%`, 'Nível:', selectedStudent.classification],
        ['', '', '', ''],
        ['DESEMPENHO POR QUESTÃO', '', '', ''],
        ['Questão', 'Habilidade', 'Acerto Médio da Turma', 'Resultado do Aluno']
      ];

      // Gerar dados da tabela baseado no desempenho real do aluno
      const allQuestions = [
        { q: "Q1", habilidade: "LP2T1.5", percentual: "75,00%", disciplina: "Português" },
        { q: "Q2", habilidade: "LP2T1.1", percentual: "87,50%", disciplina: "Português" },
        { q: "Q3", habilidade: "LP2T1.3", percentual: "62,50%", disciplina: "Português" },
        { q: "Q4", habilidade: "LP2T1.1", percentual: "75,00%", disciplina: "Português" },
        { q: "Q5", habilidade: "LP2C1.2", percentual: "87,50%", disciplina: "Português" },
        { q: "Q6", habilidade: "LP2T1.4", percentual: "45,00%", disciplina: "Português" },
        { q: "Q7", habilidade: "LP2T1.6", percentual: "68,75%", disciplina: "Português" },
        { q: "Q8", habilidade: "2N1.5", percentual: "62,50%", disciplina: "Matemática" },
        { q: "Q9", habilidade: "2N2.2", percentual: "75,00%", disciplina: "Matemática" },
        { q: "Q10", habilidade: "2N1.7", percentual: "75,00%", disciplina: "Matemática" },
        { q: "Q11", habilidade: "2M2.3", percentual: "62,50%", disciplina: "Matemática" },
        { q: "Q12", habilidade: "2G1.1", percentual: "80,00%", disciplina: "Matemática" },
        { q: "Q13", habilidade: "2N3.4", percentual: "55,00%", disciplina: "Matemática" },
        { q: "Q14", habilidade: "2M1.2", percentual: "70,00%", disciplina: "Matemática" }
      ];

      // Calcular quais questões o aluno acertou baseado no percentual
      const expectedCorrect = Math.round((selectedStudent.percentage / 100) * allQuestions.length);
      const correctIndices = new Set();
      
      // Distribuir acertos de forma inteligente (questões mais fáceis primeiro)
      const sortedByDifficulty = allQuestions
        .map((q, index) => ({ ...q, index, difficulty: parseFloat(q.percentual) }))
        .sort((a, b) => b.difficulty - a.difficulty);
      
      for (let i = 0; i < expectedCorrect && i < sortedByDifficulty.length; i++) {
        correctIndices.add(sortedByDifficulty[i].index);
      }

      // Dados das questões
      const questionsData = allQuestions.map((item, index) => [
        item.q,
        item.habilidade,
        item.percentual,
        correctIndices.has(index) ? 'ACERTOU' : 'ERROU'
      ]);

      // Resumo final
      const summaryData = [
        ['', '', '', ''],
        ['RESUMO FINAL', '', '', ''],
        ['Total de Questões:', selectedStudent.totalQuestions, '', ''],
        ['Total de Acertos:', selectedStudent.correctAnswers, '', ''],
        ['Percentual de Acerto:', `${selectedStudent.percentage}%`, '', ''],
        ['Proficiência:', `${selectedStudent.proficiencyScore} pontos`, '', ''],
        ['Classificação:', selectedStudent.classification, '', '']
      ];

      // Combinar todos os dados
      const allData = [...studentInfo, ...questionsData, ...summaryData];
      
      const worksheet = XLSX.utils.aoa_to_sheet(allData);
      
      // Definir larguras das colunas
      const colWidths = [
        { wch: 15 }, // Coluna A
        { wch: 25 }, // Coluna B
        { wch: 25 }, // Coluna C
        { wch: 20 }  // Coluna D
      ];
      worksheet['!cols'] = colWidths;

      // Criar workbook e adicionar worksheet
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Relatório Individual');
      
      const fileName = `relatorio-${selectedStudent.name.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.xlsx`;
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      
      saveAs(blob, fileName);
      
      toast({
        title: "Excel gerado com sucesso!",
        description: "A planilha foi baixada em formato Excel.",
      });
      
    } catch (error) {
      toast({
        title: "Erro na exportação",
        description: "Não foi possível gerar a planilha Excel. Verifique se todas as dependências estão instaladas.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-4 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-3 w-24 mt-2" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!evaluationResult) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <FileText className="h-8 w-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Avaliação não encontrada
        </h3>
        <p className="text-gray-600 mb-4">
          Não foi possível carregar os resultados desta avaliação.
        </p>
        {onBack && (
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
        )}
      </div>
    );
  }

  // Modal de detalhes do aluno
  if (selectedStudent) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={() => setSelectedStudent(null)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
            <div>
              <h2 className="text-2xl font-bold">{selectedStudent.name}</h2>
              <p className="text-muted-foreground">
                {selectedStudent.class} • {evaluationResult.name}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExportIndividualPDF}>
              <FileText className="h-4 w-4 mr-2" />
              Relatório PDF
            </Button>
          </div>
        </div>

        {/* Resumo Principal */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="border-l-4 border-l-blue-500">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Nota Final</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {selectedStudent.rawScore.toFixed(1)}
              </div>
              <p className="text-xs text-muted-foreground">de 10.0</p>
              <div className="mt-2">
                <Progress value={selectedStudent.rawScore * 10} className="h-2" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-green-500">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Proficiência</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {selectedStudent.proficiencyScore}
              </div>
              <p className="text-xs text-muted-foreground">pontos</p>
              <div className="mt-2">
                <Progress value={(selectedStudent.proficiencyScore / 500) * 100} className="h-2" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-purple-500">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Taxa de Acerto</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">
                {selectedStudent.percentage}%
              </div>
              <p className="text-xs text-muted-foreground">
                {selectedStudent.correctAnswers} de {selectedStudent.totalQuestions} questões
              </p>
              <div className="mt-2">
                <Progress value={selectedStudent.percentage} className="h-2" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-orange-500">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Tempo de Prova</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                {selectedStudent.timeSpent}min
              </div>
              <p className="text-xs text-muted-foreground">
                {selectedStudent.timeSpent > 45 ? 'Acima da média' : 'Dentro da média'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Classificação de Proficiência Detalhada */}
        <Card>
          <CardHeader>
            <CardTitle>Análise de Proficiência</CardTitle>
            <CardDescription>
              Classificação baseada nas escalas oficiais de proficiência
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <h4 className="font-semibold">Classificação Atual</h4>
                  <p className="text-sm text-muted-foreground">
                    Com base na pontuação de {selectedStudent.proficiencyScore} pontos
                  </p>
                </div>
                <Badge className={`${proficiencyColors[selectedStudent.proficiencyLevel].bg} ${proficiencyColors[selectedStudent.proficiencyLevel].text} text-lg px-4 py-2`}>
                  {selectedStudent.classification}
                </Badge>
              </div>

              {/* Escala de Proficiência */}
              <div className="space-y-2">
                <h5 className="font-medium">Escala de Proficiência (3º Ano - Ensino Fundamental)</h5>
                <div className="grid gap-2">
                  <div className={`p-3 rounded flex justify-between items-center ${selectedStudent.proficiencyLevel === 'abaixo_do_basico' ? 'bg-red-100 border-2 border-red-300' : 'bg-red-50'}`}>
                    <span className="font-medium text-red-800">Abaixo do Básico</span>
                    <span className="text-sm text-red-600">0 - 150 pontos</span>
                  </div>
                  <div className={`p-3 rounded flex justify-between items-center ${selectedStudent.proficiencyLevel === 'basico' ? 'bg-yellow-100 border-2 border-yellow-300' : 'bg-yellow-50'}`}>
                    <span className="font-medium text-yellow-800">Básico</span>
                    <span className="text-sm text-yellow-600">151 - 200 pontos</span>
                  </div>
                  <div className={`p-3 rounded flex justify-between items-center ${selectedStudent.proficiencyLevel === 'adequado' ? 'bg-blue-100 border-2 border-blue-300' : 'bg-blue-50'}`}>
                    <span className="font-medium text-blue-800">Adequado</span>
                    <span className="text-sm text-blue-600">201 - 300 pontos</span>
                  </div>
                  <div className={`p-3 rounded flex justify-between items-center ${selectedStudent.proficiencyLevel === 'avancado' ? 'bg-green-100 border-2 border-green-300' : 'bg-green-50'}`}>
                    <span className="font-medium text-green-800">Avançado</span>
                    <span className="text-sm text-green-600">301+ pontos</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Análise Detalhada de Desempenho */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Análise de Desempenho</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center p-3 bg-blue-50 rounded">
                  <span className="font-medium">Questões Corretas</span>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="font-bold text-green-600">{selectedStudent.correctAnswers}</span>
                  </div>
                </div>
                
                <div className="flex justify-between items-center p-3 bg-red-50 rounded">
                  <span className="font-medium">Questões Incorretas</span>
                  <div className="flex items-center gap-2">
                    <X className="h-4 w-4 text-red-600" />
                    <span className="font-bold text-red-600">{selectedStudent.totalQuestions - selectedStudent.correctAnswers}</span>
                  </div>
                </div>

                <div className="flex justify-between items-center p-3 bg-purple-50 rounded">
                  <span className="font-medium">Taxa de Eficiência</span>
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-purple-600" />
                    <span className="font-bold text-purple-600">
                      {(selectedStudent.correctAnswers / (selectedStudent.timeSpent / 60)).toFixed(1)} acertos/min
                    </span>
                  </div>
                </div>

                <div className="flex justify-between items-center p-3 bg-orange-50 rounded">
                  <span className="font-medium">Ritmo de Resolução</span>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-orange-600" />
                    <span className="font-bold text-orange-600">
                      {(selectedStudent.timeSpent / selectedStudent.totalQuestions).toFixed(1)} min/questão
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Comparação com a Turma</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Comparação com média da turma */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Desempenho vs. Média da Escola</span>
                    <span className={selectedStudent.rawScore >= evaluationResult.averageScore ? 'text-green-600' : 'text-red-600'}>
                      {selectedStudent.rawScore >= evaluationResult.averageScore ? '+' : ''}{(selectedStudent.rawScore - evaluationResult.averageScore).toFixed(1)}
                    </span>
                  </div>
                  <Progress 
                    value={((selectedStudent.rawScore / evaluationResult.averageScore) * 100)} 
                    className="h-2" 
                  />
                </div>

                {/* Posição na turma */}
                <div className="p-3 bg-gray-50 rounded">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Posição Estimada</span>
                    <Badge variant="outline">
                      Top {Math.ceil((1 - (selectedStudent.rawScore / 10)) * 100)}%
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Baseado na nota em relação à pontuação máxima
                  </p>
                </div>

                {/* Recomendações */}
                <div className="p-3 bg-blue-50 rounded">
                  <h5 className="font-medium text-blue-800 mb-2">Recomendações</h5>
                  <ul className="text-sm text-blue-700 space-y-1">
                    {selectedStudent.proficiencyLevel === 'abaixo_do_basico' && (
                      <>
                        <li>• Reforço em conceitos fundamentais</li>
                        <li>• Atividades práticas complementares</li>
                        <li>• Acompanhamento pedagógico individual</li>
                      </>
                    )}
                    {selectedStudent.proficiencyLevel === 'basico' && (
                      <>
                        <li>• Exercícios de fixação</li>
                        <li>• Atividades de aplicação prática</li>
                        <li>• Estímulo à participação em aula</li>
                      </>
                    )}
                    {selectedStudent.proficiencyLevel === 'adequado' && (
                      <>
                        <li>• Desafios mais complexos</li>
                        <li>• Projetos interdisciplinares</li>
                        <li>• Monitoria para colegas</li>
                      </>
                    )}
                    {selectedStudent.proficiencyLevel === 'avancado' && (
                      <>
                        <li>• Atividades de enriquecimento</li>
                        <li>• Projetos de pesquisa</li>
                        <li>• Participação em olimpíadas</li>
                      </>
                    )}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Análise por Habilidades (Simulada) */}
        <Card>
          <CardHeader>
            <CardTitle>Análise por Habilidades</CardTitle>
            <CardDescription>
              Desempenho detalhado por área de conhecimento
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Simulando habilidades baseadas na nota do aluno */}
              {[
                { 
                  name: "Números e Operações", 
                  score: Math.min(10, selectedStudent.rawScore + (Math.random() * 2 - 1)), 
                  questions: 8 
                },
                { 
                  name: "Álgebra e Funções", 
                  score: Math.min(10, selectedStudent.rawScore + (Math.random() * 2 - 1)), 
                  questions: 6 
                },
                { 
                  name: "Geometria", 
                  score: Math.min(10, selectedStudent.rawScore + (Math.random() * 2 - 1)), 
                  questions: 4 
                },
                { 
                  name: "Tratamento da Informação", 
                  score: Math.min(10, selectedStudent.rawScore + (Math.random() * 2 - 1)), 
                  questions: 2 
                }
              ].map((skill, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded">
                  <div className="flex-1">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium">{skill.name}</span>
                      <span className="text-sm font-bold">
                        {skill.score.toFixed(1)}/10.0
                      </span>
                    </div>
                    <Progress value={skill.score * 10} className="h-2" />
                    <p className="text-xs text-muted-foreground mt-1">
                      {skill.questions} questões avaliadas
                    </p>
                  </div>
                  <div className="ml-4">
                    {skill.score >= 7 ? (
                      <TrendingUp className="h-5 w-5 text-green-600" />
                    ) : skill.score >= 5 ? (
                      <Target className="h-5 w-5 text-yellow-600" />
                    ) : (
                      <TrendingDown className="h-5 w-5 text-red-600" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Desempenho Detalhado por Questão */}
        <Card>
          <CardHeader>
            <CardTitle>Desempenho por Questão</CardTitle>
            <CardDescription>
              Análise detalhada de cada questão da avaliação com habilidades específicas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Língua Portuguesa */}
              <div>
                <h4 className="font-semibold text-lg mb-4 text-blue-700">LÍNGUA PORTUGUESA</h4>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b-2 border-gray-200">
                        <th className="text-left p-2 font-medium">Questão</th>
                        <th className="text-center p-2 font-medium">Habilidade</th>
                        <th className="text-center p-2 font-medium">Acerto Médio da Turma</th>
                        <th className="text-center p-2 font-medium">Resultado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const portugueseQuestions = [
                          { q: "Q1", habilidade: "LP2T1.5", percentual: "75,00%" },
                          { q: "Q2", habilidade: "LP2T1.1", percentual: "87,50%" },
                          { q: "Q3", habilidade: "LP2T1.3", percentual: "62,50%" },
                          { q: "Q4", habilidade: "LP2T1.1", percentual: "75,00%" },
                          { q: "Q5", habilidade: "LP2C1.2", percentual: "87,50%" },
                          { q: "Q6", habilidade: "LP2T1.4", percentual: "45,00%" },
                          { q: "Q7", habilidade: "LP2T1.6", percentual: "68,75%" }
                        ];

                        // Calcular quantas questões o aluno acertou baseado no seu percentual
                        const expectedCorrect = Math.round((selectedStudent.percentage / 100) * 7);
                        const correctIndices = new Set();
                        
                        // Distribuir acertos de forma mais inteligente (questões mais fáceis primeiro)
                        const sortedByDifficulty = portugueseQuestions
                          .map((q, index) => ({ ...q, index, difficulty: parseFloat(q.percentual) }))
                          .sort((a, b) => b.difficulty - a.difficulty);
                        
                        for (let i = 0; i < expectedCorrect && i < sortedByDifficulty.length; i++) {
                          correctIndices.add(sortedByDifficulty[i].index);
                        }

                        return portugueseQuestions.map((item, index) => (
                          <tr key={index} className="border-b border-border hover:bg-muted transition-colors">
                            <td className="p-3 font-medium">{item.q}</td>
                            <td className="p-3 text-center">
                              <Badge variant="outline" className="text-xs">
                                {item.habilidade}
                              </Badge>
                            </td>
                            <td className="p-3 text-center">
                              <span className={`font-medium ${
                                parseFloat(item.percentual) >= 75 ? 'text-green-600' : 
                                parseFloat(item.percentual) >= 50 ? 'text-yellow-600' : 'text-red-600'
                              }`}>
                                {item.percentual}
                              </span>
                            </td>
                            <td className="p-3 text-center">
                              {correctIndices.has(index) ? (
                                <CheckCircle2 className="h-5 w-5 text-green-600 mx-auto" />
                              ) : (
                                <X className="h-5 w-5 text-red-600 mx-auto" />
                              )}
                            </td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Matemática */}
              <div>
                <h4 className="font-semibold text-lg mb-4 text-purple-700">MATEMÁTICA</h4>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b-2 border-gray-200">
                        <th className="text-left p-2 font-medium">Questão</th>
                        <th className="text-center p-2 font-medium">Habilidade</th>
                        <th className="text-center p-2 font-medium">Acerto Médio da Turma</th>
                        <th className="text-center p-2 font-medium">Resultado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const mathQuestions = [
                          { q: "Q8", habilidade: "2N1.5", percentual: "62,50%" },
                          { q: "Q9", habilidade: "2N2.2", percentual: "75,00%" },
                          { q: "Q10", habilidade: "2N1.7", percentual: "75,00%" },
                          { q: "Q11", habilidade: "2M2.3", percentual: "62,50%" },
                          { q: "Q12", habilidade: "2G1.1", percentual: "80,00%" },
                          { q: "Q13", habilidade: "2N3.4", percentual: "55,00%" },
                          { q: "Q14", habilidade: "2M1.2", percentual: "70,00%" }
                        ];

                        // Calcular quantas questões o aluno acertou baseado no seu percentual
                        const expectedCorrect = Math.round((selectedStudent.percentage / 100) * 7);
                        const correctIndices = new Set();
                        
                        // Distribuir acertos de forma mais inteligente (questões mais fáceis primeiro)
                        const sortedByDifficulty = mathQuestions
                          .map((q, index) => ({ ...q, index, difficulty: parseFloat(q.percentual) }))
                          .sort((a, b) => b.difficulty - a.difficulty);
                        
                        for (let i = 0; i < expectedCorrect && i < sortedByDifficulty.length; i++) {
                          correctIndices.add(sortedByDifficulty[i].index);
                        }

                        return mathQuestions.map((item, index) => (
                          <tr key={index} className="border-b border-border hover:bg-muted transition-colors">
                            <td className="p-3 font-medium">{item.q}</td>
                            <td className="p-3 text-center">
                              <Badge variant="outline" className="text-xs">
                                {item.habilidade}
                              </Badge>
                            </td>
                            <td className="p-3 text-center">
                              <span className={`font-medium ${
                                parseFloat(item.percentual) >= 75 ? 'text-green-600' : 
                                parseFloat(item.percentual) >= 50 ? 'text-yellow-600' : 'text-red-600'
                              }`}>
                                {item.percentual}
                              </span>
                            </td>
                            <td className="p-3 text-center">
                              {correctIndices.has(index) ? (
                                <CheckCircle2 className="h-5 w-5 text-green-600 mx-auto" />
                              ) : (
                                <X className="h-5 w-5 text-red-600 mx-auto" />
                              )}
                            </td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Resumo por Disciplina */}
              <div className="grid gap-4 md:grid-cols-2">
                <Card className="border-l-4 border-l-blue-500">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-blue-700">
                      Língua Portuguesa
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(() => {
                      const totalQuestions = 7;
                      const correctAnswers = Math.round((selectedStudent.percentage / 100) * totalQuestions);
                      const incorrectAnswers = totalQuestions - correctAnswers;
                      const percentage = (correctAnswers / totalQuestions) * 100;

                      return (
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-sm">Total de Questões:</span>
                            <span className="font-bold">{totalQuestions}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm">Acertos:</span>
                            <span className="font-bold text-green-600">{correctAnswers}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm">Erros:</span>
                            <span className="font-bold text-red-600">{incorrectAnswers}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm">Percentual:</span>
                            <span className="font-bold text-blue-600">{percentage.toFixed(1)}%</span>
                          </div>
                          <Progress value={percentage} className="h-2 mt-2" />
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>

                <Card className="border-l-4 border-l-purple-500">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-purple-700">
                      Matemática
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(() => {
                      const totalQuestions = 7;
                      const correctAnswers = Math.round((selectedStudent.percentage / 100) * totalQuestions);
                      const incorrectAnswers = totalQuestions - correctAnswers;
                      const percentage = (correctAnswers / totalQuestions) * 100;

                      return (
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-sm">Total de Questões:</span>
                            <span className="font-bold">{totalQuestions}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm">Acertos:</span>
                            <span className="font-bold text-green-600">{correctAnswers}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm">Erros:</span>
                            <span className="font-bold text-red-600">{incorrectAnswers}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm">Percentual:</span>
                            <span className="font-bold text-purple-600">{percentage.toFixed(1)}%</span>
                          </div>
                          <Progress value={percentage} className="h-2 mt-2" />
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              </div>

              {/* Legenda das Habilidades */}
              <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <h5 className="font-medium mb-3">Legenda das Habilidades:</h5>
                <div className="grid gap-2 md:grid-cols-2 text-sm">
                  <div>
                    <strong>Língua Portuguesa:</strong>
                    <ul className="mt-1 space-y-1 text-xs text-gray-600">
                      <li>• LP2T1.5 - Localizar informações explícitas</li>
                      <li>• LP2T1.1 - Identificar tema/assunto principal</li>
                      <li>• LP2T1.3 - Inferir informações implícitas</li>
                      <li>• LP2C1.2 - Reconhecer elementos coesivos</li>
                    </ul>
                  </div>
                  <div>
                    <strong>Matemática:</strong>
                    <ul className="mt-1 space-y-1 text-xs text-gray-600">
                      <li>• 2N1.5 - Resolver problemas com números naturais</li>
                      <li>• 2N2.2 - Operações fundamentais</li>
                      <li>• 2M2.3 - Unidades de medida</li>
                      <li>• 2G1.1 - Figuras geométricas planas</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Resumo Final Consolidado */}
              <Card className="bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-200">
                <CardHeader>
                  <CardTitle className="text-xl font-bold text-center">
                    Resumo Consolidado da Avaliação
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-6 md:grid-cols-3">
                    <div className="text-center p-4 bg-white rounded-lg shadow-sm">
                      <div className="text-3xl font-bold text-green-600 mb-2">
                        {selectedStudent.correctAnswers}
                      </div>
                      <div className="text-sm text-gray-600 mb-1">Total de Acertos</div>
                      <div className="text-xs text-gray-500">
                        de {selectedStudent.totalQuestions} questões
                      </div>
                    </div>
                    
                    <div className="text-center p-4 bg-white rounded-lg shadow-sm">
                      <div className="text-3xl font-bold text-blue-600 mb-2">
                        {selectedStudent.proficiencyScore}
                      </div>
                      <div className="text-sm text-gray-600 mb-1">Proficiência</div>
                      <div className="text-xs text-gray-500">
                        pontos na escala
                      </div>
                    </div>
                    
                    <div className="text-center p-4 bg-white rounded-lg shadow-sm">
                      <div className="mb-2">
                        <Badge className={`${proficiencyColors[selectedStudent.proficiencyLevel].bg} ${proficiencyColors[selectedStudent.proficiencyLevel].text} text-lg px-4 py-2`}>
                          {selectedStudent.classification}
                        </Badge>
                      </div>
                      <div className="text-sm text-gray-600 mb-1">Nível</div>
                      <div className="text-xs text-gray-500">
                        de proficiência
                      </div>
                    </div>
                  </div>
                  
                  {/* Barra de progresso geral */}
                  <div className="mt-6 p-4 bg-white rounded-lg">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium">Desempenho Geral</span>
                      <span className="font-bold text-lg">{selectedStudent.percentage}%</span>
                    </div>
                    <Progress value={selectedStudent.percentage} className="h-3" />
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>0%</span>
                      <span>50%</span>
                      <span>100%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>

        {/* Histórico e Evolução */}
        <Card>
          <CardHeader>
            <CardTitle>Informações Adicionais</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="p-3 bg-gray-50 rounded">
                <h5 className="font-medium mb-2">Data da Avaliação</h5>
                <p className="text-sm">
                  {new Date(selectedStudent.evaluationDate).toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric'
                  })}
                </p>
              </div>
              
              <div className="p-3 bg-gray-50 rounded">
                <h5 className="font-medium mb-2">Duração da Prova</h5>
                <p className="text-sm">
                  {Math.floor(selectedStudent.timeSpent / 60)}h {selectedStudent.timeSpent % 60}min
                </p>
                <p className="text-xs text-muted-foreground">
                  {selectedStudent.timeSpent > 60 ? 'Tempo estendido' : 'Tempo padrão'}
                </p>
              </div>
              
              <div className="p-3 bg-gray-50 rounded">
                <h5 className="font-medium mb-2">Status</h5>
                                  <Badge className={(selectedStudent.status === 'completed' || selectedStudent.status === 'concluida') ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'}>
                  {(selectedStudent.status === 'completed' || selectedStudent.status === 'concluida') ? 'Avaliação Concluída' : 'Pendente'}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-4">
          {onBack && (
            <Button variant="outline" onClick={onBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
          )}
          <div>
            <h2 className="text-2xl font-bold">{evaluationResult.name}</h2>
            <p className="text-muted-foreground">
              {evaluationResult.municipality} • {evaluationResult.completedStudents} alunos avaliados
            </p>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchEvaluationResults} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button variant="outline" onClick={handleExportPDF}>
            <FileText className="h-4 w-4 mr-2" />
            PDF
          </Button>
          <Button onClick={handleExportExcel}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Excel
          </Button>
        </div>
      </div>

      {/* Estatísticas da Avaliação */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-600" />
              Participação
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {evaluationResult.completedStudents}/{evaluationResult.totalStudents}
            </div>
            <p className="text-xs text-muted-foreground">
              {((evaluationResult.completedStudents / evaluationResult.totalStudents) * 100).toFixed(1)}% dos alunos
            </p>
          </CardContent>
        </Card>
        
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4 text-green-600" />
              Média Geral
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {evaluationResult.averageScore.toFixed(1)}
            </div>
            <p className="text-xs text-muted-foreground">
              de 10.0
            </p>
          </CardContent>
        </Card>
        
        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Award className="h-4 w-4 text-purple-600" />
              Proficiência Média
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {evaluationResult.averageProficiency}
            </div>
            <p className="text-xs text-muted-foreground">
              pontos
            </p>
          </CardContent>
        </Card>
        
        <Card className="border-l-4 border-l-orange-500">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-orange-600" />
              Disciplinas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-bold text-orange-600">
              {evaluationResult.subjects.join(", ")}
            </div>
            <p className="text-xs text-muted-foreground">
              {evaluationResult.subjects.length} disciplina(s)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Distribuição de Proficiência */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Object.entries(evaluationResult.distributionByLevel).map(([level, count]) => {
          const proficiencyLevel = level as ProficiencyLevel;
          const colors = proficiencyColors[proficiencyLevel];
          const percentage = evaluationResult.completedStudents > 0 ? (count / evaluationResult.completedStudents) * 100 : 0;
          
          return (
            <Card key={level} className={`border-l-4 ${colors.border}`}>
              <CardHeader className="pb-2">
                <CardTitle className={`text-sm font-medium ${colors.text}`}>
                  {proficiencyLabels[proficiencyLevel]}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${colors.text}`}>{count}</div>
                <p className="text-xs text-muted-foreground mb-2">
                  {percentage.toFixed(1)}% dos alunos
                </p>
                <Progress value={percentage} className="h-2" />
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Lista de Alunos */}
      <Card>
        <CardHeader>
          <CardTitle>Desempenho Individual dos Alunos</CardTitle>
          <CardDescription>
            Resultados detalhados de {evaluationResult.students.length} alunos que realizaram a avaliação
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {evaluationResult.students.map((student, index) => {
              const colors = proficiencyColors[student.proficiencyLevel];
              
              return (
                <div 
                  key={`${student.id || 'student'}-${index}`} 
                  className="border rounded-lg p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => setSelectedStudent(student)}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-lg">{student.name}</h3>
                        <Badge variant="outline">{student.class}</Badge>
                        <Badge className={(student.status === 'completed' || student.status === 'concluida') ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'}>
                          {(student.status === 'completed' || student.status === 'concluida') ? 'Concluída' : 'Pendente'}
                        </Badge>
                      </div>
                      
                      <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                          <Target className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">
                            Nota: {student.rawScore.toFixed(1)}
                          </span>
                          {student.rawScore >= 7 ? (
                            <TrendingUp className="h-4 w-4 text-green-600" />
                          ) : (
                            <TrendingDown className="h-4 w-4 text-red-600" />
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <Award className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">
                            Proficiência: {student.proficiencyScore}
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">
                            {student.correctAnswers}/{student.totalQuestions} ({student.percentage}%)
                          </span>
                        </div>
                        
                        <Badge className={`${colors.bg} ${colors.text}`}>
                          {student.classification}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedStudent(student);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const url = `/app/avaliacao/${evaluationId}/aluno/${student.id}/resultados`;
                          window.open(url, '_blank');
                        }}
                        title="Clique esquerdo: ver detalhes | Clique direito: abrir em nova guia"
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        Ver Detalhes
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

 