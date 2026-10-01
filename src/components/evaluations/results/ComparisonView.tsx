import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { formatDecimal1PtBr } from "@/utils/numberFormat";
import { 
  ArrowLeft, 
  TrendingUp, 
  TrendingDown, 
  Equal,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Filter,
  Download
} from "lucide-react";

import { 
  EvaluationResultsData, 
  ProficiencyLevel, 
  proficiencyColors, 
  proficiencyLabels 
} from "@/types/evaluation-results";
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from "./constants";

interface ComparisonViewProps {
  results: EvaluationResultsData[];
  onBack: () => void;
}

interface ComparisonData {
  evaluation1: EvaluationResultsData;
  evaluation2: EvaluationResultsData;
  differences: {
    participationRate: number;
    averageScore: number;
    averageProficiency: number;
    distributionChanges: Record<ProficiencyLevel, number>;
  };
}

export function ComparisonView({ results, onBack }: ComparisonViewProps) {
  const [selectedEval1, setSelectedEval1] = useState<string>("");
  const [selectedEval2, setSelectedEval2] = useState<string>("");
  const [comparisonData, setComparisonData] = useState<ComparisonData | null>(null);
  const { toast } = useToast();

  const performComparison = () => {
    if (!selectedEval1 || !selectedEval2) {
      toast({
        title: "Seleção incompleta",
        description: ERROR_MESSAGES.DATA_NOT_FOUND,
        variant: "destructive",
      });
      return;
    }

    const eval1 = results.find(r => r.id === selectedEval1);
    const eval2 = results.find(r => r.id === selectedEval2);

    if (!eval1 || !eval2) {
      toast({
        title: "Erro",
        description: ERROR_MESSAGES.DATA_NOT_FOUND,
        variant: "destructive",
      });
      return;
    }

    const participationRate1 = (eval1.completedStudents / eval1.totalStudents) * 100;
    const participationRate2 = (eval2.completedStudents / eval2.totalStudents) * 100;

    const distributionChanges: Record<ProficiencyLevel, number> = {
      abaixo_do_basico: eval2.distributionByLevel.abaixo_do_basico - eval1.distributionByLevel.abaixo_do_basico,
      basico: eval2.distributionByLevel.basico - eval1.distributionByLevel.basico,
      adequado: eval2.distributionByLevel.adequado - eval1.distributionByLevel.adequado,
      avancado: eval2.distributionByLevel.avancado - eval1.distributionByLevel.avancado,
    };

    setComparisonData({
      evaluation1: eval1,
      evaluation2: eval2,
      differences: {
        participationRate: participationRate2 - participationRate1,
        averageScore: eval2.averageRawScore - eval1.averageRawScore,
        averageProficiency: eval2.averageProficiency - eval1.averageProficiency,
        distributionChanges
      }
    });
  };

  const getTrendIcon = (value: number) => {
    if (value > 0) return <TrendingUp className="h-4 w-4 text-green-600" />;
    if (value < 0) return <TrendingDown className="h-4 w-4 text-red-600" />;
    return <Equal className="h-4 w-4 text-gray-500" />;
  };

  const getTrendColor = (value: number) => {
    if (value > 0) return "text-green-600";
    if (value < 0) return "text-red-600";
    return "text-gray-500";
  };

  const formatDifference = (value: number, suffix: string = "", prefix: string = "") => {
    const sign = value > 0 ? "+" : "";
    return `${sign}${prefix}${formatDecimal1PtBr(value)}${suffix}`;
  };

  const getImprovementLevel = (value: number, threshold: number = 5) => {
    if (Math.abs(value) < threshold) return "stable";
    return value > 0 ? "improvement" : "decline";
  };

  const getComparisonInsights = () => {
    if (!comparisonData) return [];

    const insights = [];
    const { differences } = comparisonData;

    // Participação
    if (Math.abs(differences.participationRate) >= 5) {
      const direction = differences.participationRate > 0 ? "aumentou" : "diminuiu";
      insights.push({
        type: differences.participationRate > 0 ? "positive" : "negative",
        title: "Participação",
        description: `A taxa de participação ${direction} em ${formatDecimal1PtBr(Math.abs(differences.participationRate))}%`
      });
    }

    // Performance
    if (Math.abs(differences.averageScore) >= 0.5) {
      const direction = differences.averageScore > 0 ? "melhorou" : "piorou";
      insights.push({
        type: differences.averageScore > 0 ? "positive" : "negative",
        title: "Performance",
        description: `A média geral ${direction} em ${formatDecimal1PtBr(Math.abs(differences.averageScore))} pontos`
      });
    }

    // Proficiência
    if (Math.abs(differences.averageProficiency) >= 20) {
      const direction = differences.averageProficiency > 0 ? "aumentou" : "diminuiu";
      insights.push({
        type: differences.averageProficiency > 0 ? "positive" : "negative",
        title: "Proficiência",
        description: `A proficiência média ${direction} em ${formatDecimal1PtBr(Math.abs(differences.averageProficiency))} pontos`
      });
    }

    // Classificações
    const advancedChange = differences.distributionChanges.avancado;
    if (Math.abs(advancedChange) >= 2) {
      const direction = advancedChange > 0 ? "aumentou" : "diminuiu";
      insights.push({
        type: advancedChange > 0 ? "positive" : "negative",
        title: "Nível Avançado",
        description: `O número de alunos no nível avançado ${direction} em ${Math.abs(advancedChange)} estudantes`
      });
    }

    return insights;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <div>
            <h2 className="text-xl font-bold">Comparação de Avaliações</h2>
            <p className="text-sm text-muted-foreground">
              Compare o desempenho entre diferentes avaliações
            </p>
          </div>
        </div>
        
        {comparisonData && (
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Exportar Comparação
          </Button>
        )}
      </div>

      {/* Seleção de Avaliações */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Selecionar Avaliações para Comparar
          </CardTitle>
          <CardDescription>
            Escolha duas avaliações para análise comparativa
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Primeira Avaliação</label>
              <Select value={selectedEval1} onValueChange={setSelectedEval1}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a primeira avaliação" />
                </SelectTrigger>
                <SelectContent>
                  {results.map(result => (
                    <SelectItem key={result.id} value={result.id}>
                      <div>
                        <div className="font-medium">{result.evaluationTitle}</div>
                        <div className="text-xs text-muted-foreground">
                          {result.subject} • {new Date(result.appliedAt).toLocaleDateString('pt-BR')}
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Segunda Avaliação</label>
              <Select value={selectedEval2} onValueChange={setSelectedEval2}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a segunda avaliação" />
                </SelectTrigger>
                <SelectContent>
                  {results
                    .filter(r => r.id !== selectedEval1)
                    .map(result => (
                    <SelectItem key={result.id} value={result.id}>
                      <div>
                        <div className="font-medium">{result.evaluationTitle}</div>
                        <div className="text-xs text-muted-foreground">
                          {result.subject} • {new Date(result.appliedAt).toLocaleDateString('pt-BR')}
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button 
                onClick={performComparison}
                disabled={!selectedEval1 || !selectedEval2}
                className="w-full"
              >
                <BarChart3 className="h-4 w-4 mr-2" />
                Comparar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resultados da Comparação */}
      {comparisonData && (
        <>
          {/* Informações das Avaliações */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="bg-blue-50">
                <CardTitle className="text-blue-800">Avaliação A</CardTitle>
                <CardDescription className="text-blue-600">
                  {comparisonData.evaluation1.evaluationTitle}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Data:</span>
                    <span className="text-sm font-medium">
                      {new Date(comparisonData.evaluation1.appliedAt).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Participação:</span>
                    <span className="text-sm font-medium">
                      {comparisonData.evaluation1.completedStudents}/{comparisonData.evaluation1.totalStudents}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Média:</span>
                    <span className="text-sm font-medium">
                      {formatDecimal1PtBr(comparisonData.evaluation1.averageRawScore)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="bg-green-50">
                <CardTitle className="text-green-800">Avaliação B</CardTitle>
                <CardDescription className="text-green-600">
                  {comparisonData.evaluation2.evaluationTitle}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Data:</span>
                    <span className="text-sm font-medium">
                      {new Date(comparisonData.evaluation2.appliedAt).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Participação:</span>
                    <span className="text-sm font-medium">
                      {comparisonData.evaluation2.completedStudents}/{comparisonData.evaluation2.totalStudents}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Média:</span>
                    <span className="text-sm font-medium">
                      {formatDecimal1PtBr(comparisonData.evaluation2.averageRawScore)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Métricas de Comparação */}
          <Card>
            <CardHeader>
              <CardTitle>Análise Comparativa</CardTitle>
              <CardDescription>
                Diferenças entre as duas avaliações selecionadas
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Taxa de Participação</span>
                    {getTrendIcon(comparisonData.differences.participationRate)}
                  </div>
                  <div className={`text-2xl font-bold ${getTrendColor(comparisonData.differences.participationRate)}`}>
                    {formatDifference(comparisonData.differences.participationRate, "%")}
                  </div>
                </div>

                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Média de Nota</span>
                    {getTrendIcon(comparisonData.differences.averageScore)}
                  </div>
                  <div className={`text-2xl font-bold ${getTrendColor(comparisonData.differences.averageScore)}`}>
                    {formatDifference(comparisonData.differences.averageScore)}
                  </div>
                </div>

                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Proficiência Média</span>
                    {getTrendIcon(comparisonData.differences.averageProficiency)}
                  </div>
                  <div className={`text-2xl font-bold ${getTrendColor(comparisonData.differences.averageProficiency)}`}>
                    {formatDifference(comparisonData.differences.averageProficiency)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Distribuição por Classificação */}
          <Card>
            <CardHeader>
              <CardTitle>Mudanças na Distribuição por Classificação</CardTitle>
              <CardDescription>
                Variação no número de alunos em cada nível de proficiência
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-4">
                {Object.entries(comparisonData.differences.distributionChanges).map(([level, change]) => {
                  const proficiencyLevel = level as ProficiencyLevel;
                  const colors = proficiencyColors[proficiencyLevel];
                  
                  return (
                    <div key={level} className={`p-4 rounded-lg border ${colors.border} ${colors.bg}`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-sm font-medium ${colors.text}`}>
                          {proficiencyLabels[proficiencyLevel]}
                        </span>
                        {getTrendIcon(change)}
                      </div>
                      <div className={`text-2xl font-bold ${colors.text}`}>
                        {formatDifference(change)}
                      </div>
                      <div className={`text-xs ${colors.text} opacity-80`}>
                        alunos
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Insights da Comparação */}
          {getComparisonInsights().length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Insights da Comparação</CardTitle>
                <CardDescription>
                  Principais observações sobre as diferenças encontradas
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {getComparisonInsights().map((insight, index) => (
                    <div 
                      key={index}
                      className={`p-3 rounded-lg border ${
                        insight.type === 'positive' 
                          ? 'bg-green-50 border-green-200' 
                          : 'bg-red-50 border-red-200'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {insight.type === 'positive' ? (
                          <ArrowUpRight className="h-5 w-5 text-green-600 mt-0.5" />
                        ) : (
                          <ArrowDownRight className="h-5 w-5 text-red-600 mt-0.5" />
                        )}
                        <div>
                          <div className={`font-semibold ${
                            insight.type === 'positive' ? 'text-green-800' : 'text-red-800'
                          }`}>
                            {insight.title}
                          </div>
                          <div className={`text-sm ${
                            insight.type === 'positive' ? 'text-green-700' : 'text-red-700'
                          }`}>
                            {insight.description}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
} 