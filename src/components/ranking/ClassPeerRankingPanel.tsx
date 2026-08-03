import { AlertCircle, School, Users } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  RankingMetricsTableHead,
  RankingMetricsTableRow,
  RANKING_TABLE_SCROLL_CLASS,
} from "@/components/ranking/RankingMetricsTable";
import { RankingContentShell, RankingLoadingState } from "@/components/ranking/RankingLoadingState";
import { LevelTag, PosBadge, formatPt } from "@/components/ranking/RankingVisualPrimitives";
import { getClassShiftLabel } from "@/lib/classShift";
import type {
  ClassPeerGroup,
  ClassPeerRankingResponse,
  ClassPeerSection,
} from "@/services/reports/rankingApi";

type Props = {
  data?: ClassPeerRankingResponse;
  isLoading: boolean;
  isRefreshing?: boolean;
  errorMessage?: string;
  page: number;
  onPageChange: (page: number) => void;
};

function ClassRankingTable({ group }: { group: ClassPeerGroup }) {
  const items = group.class_ranking || [];

  return (
    <Card className="overflow-hidden border border-border/70">
      <CardHeader className="bg-primary text-primary-foreground py-3">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <School className="h-4 w-4" />
            Ranking de turmas
          </span>
          <Badge className="bg-primary-foreground/10 text-primary-foreground border-primary-foreground/20">
            {items.length} turma{items.length === 1 ? "" : "s"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma turma neste grupo.</p>
        ) : (
          <div className={RANKING_TABLE_SCROLL_CLASS}>
            <table className="w-full min-w-[1100px] text-sm border-collapse">
              <thead>
                <RankingMetricsTableHead
                  nameHeader="Escola / Turma"
                  leadingHeaders={
                    <th className="px-3 py-2 text-xs font-semibold uppercase text-left">Turno</th>
                  }
                />
              </thead>
              <tbody>
                {items.map((row) => (
                  <RankingMetricsTableRow
                    key={String(row.class_id || `${row.school_id}-${row.position}`)}
                    rowKey={String(row.class_id || `${row.school_id}-${row.position}`)}
                    row={{
                      ...row,
                      average_proficiency: row.average_proficiency,
                      average_score: row.average_score,
                      classification: row.classification,
                      participating_students: row.participating_students,
                    }}
                    nameCell={
                      <span className="flex flex-col gap-0.5">
                        <span>{row.school_name || "Escola"}</span>
                        <span className="text-xs font-normal text-muted-foreground">
                          Turma {row.class_name || group.turma_nome}
                        </span>
                      </span>
                    }
                    leadingCells={
                      <td className="px-3 py-2 text-muted-foreground">
                        {getClassShiftLabel(String(row.shift || group.shift || ""))}
                      </td>
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StudentRankingTable({
  group,
  page,
  onPageChange,
}: {
  group: ClassPeerGroup;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const items = group.student_ranking || [];
  const pagination = group.students_pagination;
  const totalPages = Math.max(1, Number(pagination?.total_pages || 1));
  const currentPage = Number(pagination?.page || page || 1);
  const total = Number(pagination?.total || items.length || 0);

  return (
    <Card className="overflow-hidden border border-border/70">
      <CardHeader className="bg-muted/40 py-3">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Ranking de alunos
          </span>
          <Badge variant="secondary">
            {total} aluno{total === 1 ? "" : "s"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum aluno neste grupo.</p>
        ) : (
          <div className={RANKING_TABLE_SCROLL_CLASS}>
            <table className="w-full min-w-[1000px] text-sm border-collapse">
              <thead>
                <tr className="bg-primary text-primary-foreground">
                  <th className="px-3 py-2 text-xs font-semibold uppercase text-left">Pos.</th>
                  <th className="px-3 py-2 text-xs font-semibold uppercase text-left">Aluno</th>
                  <th className="px-3 py-2 text-xs font-semibold uppercase text-left">Escola</th>
                  <th className="px-3 py-2 text-xs font-semibold uppercase text-left">Turma</th>
                  <th className="px-3 py-2 text-xs font-semibold uppercase text-right">Proficiência</th>
                  <th className="px-3 py-2 text-xs font-semibold uppercase text-right">Nota</th>
                  <th className="px-3 py-2 text-xs font-semibold uppercase text-right">Acertos</th>
                  <th className="px-3 py-2 text-xs font-semibold uppercase text-center">Nível</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr
                    key={String(row.student_id || `${row.position}-${row.name}`)}
                    className="border-t border-border/60 odd:bg-muted/20"
                  >
                    <td className="px-3 py-2">
                      <PosBadge position={Number(row.position || 0)} />
                    </td>
                    <td className="px-3 py-2 font-semibold">{row.name || "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {row.school_display_name || row.school_name || "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {row.class_name || group.turma_nome}
                      {row.shift ? ` · ${getClassShiftLabel(row.shift)}` : ""}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">
                      {formatPt(Number(row.proficiency || 0))}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-primary">
                      {formatPt(Number(row.grade || 0))}
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {Number(row.correct_answers || 0)}/{Number(row.total_questions || 0)}
                      {row.accuracy_rate != null ? ` (${formatPt(Number(row.accuracy_rate))}%)` : ""}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <LevelTag value={row.classification} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Página {currentPage} de {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={currentPage <= 1}
                onClick={() => onPageChange(currentPage - 1)}
              >
                Anterior
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={currentPage >= totalPages}
                onClick={() => onPageChange(currentPage + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function PeerGroupBlock({
  group,
  page,
  onPageChange,
}: {
  group: ClassPeerGroup;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const shiftLabel = getClassShiftLabel(group.shift);
  const title = `Turma ${group.turma_nome || "—"} — ${shiftLabel}`;

  return (
    <div className="space-y-4 rounded-xl border border-border/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-base font-semibold">{title}</h4>
          <p className="text-xs text-muted-foreground">
            {group.totals?.classes_count ?? 0} turma
            {(group.totals?.classes_count ?? 0) === 1 ? "" : "s"} ·{" "}
            {group.totals?.students_count ?? 0} aluno
            {(group.totals?.students_count ?? 0) === 1 ? "" : "s"}
          </p>
        </div>
      </div>
      <ClassRankingTable group={group} />
      <StudentRankingTable group={group} page={page} onPageChange={onPageChange} />
    </div>
  );
}

function SectionBlock({
  section,
  page,
  onPageChange,
}: {
  section: ClassPeerSection;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const groups = section.peer_groups || [];

  return (
    <Card className="overflow-hidden border border-border/70">
      <CardHeader className="bg-primary/90 text-primary-foreground">
        <CardTitle className="flex items-center justify-between gap-2">
          <span>{section.serie_name || "Série"}</span>
          <Badge className="bg-primary-foreground/10 text-primary-foreground border-primary-foreground/20">
            {section.totals?.peer_groups_count ?? groups.length} grupo
            {(section.totals?.peer_groups_count ?? groups.length) === 1 ? "" : "s"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 p-4">
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum grupo de turmas iguais nesta série.</p>
        ) : (
          groups.map((group) => (
            <PeerGroupBlock
              key={group.peer_key || `${group.turma_nome}|${group.shift}`}
              group={group}
              page={page}
              onPageChange={onPageChange}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

export default function ClassPeerRankingPanel({
  data,
  isLoading,
  isRefreshing,
  errorMessage,
  page,
  onPageChange,
}: Props) {
  if (isLoading) {
    return <RankingLoadingState message="Carregando ranking geral de turmas..." variant="table" />;
  }

  if (errorMessage) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{errorMessage}</AlertDescription>
      </Alert>
    );
  }

  const sections = data?.sections || [];

  return (
    <RankingContentShell isRefreshing={isRefreshing} refreshingMessage="Atualizando ranking geral...">
      <div className="space-y-6">
        {data?.evaluation_title || (data?.evaluations && data.evaluations.length > 0) ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {data.evaluation_title ||
                data.evaluations?.map((item) => item.title).filter(Boolean).join(" · ")}
            </span>
            {(data.evaluation_ids?.length || data.evaluations?.length || 0) > 1 ? (
              <Badge variant="secondary" className="text-xs">
                {data.evaluation_ids?.length || data.evaluations?.length} avaliações
              </Badge>
            ) : null}
            <span>·</span>
            <span>
              {data.totals?.sections_count ?? sections.length} série
              {(data.totals?.sections_count ?? sections.length) === 1 ? "" : "s"}
            </span>
            <span>·</span>
            <span>
              {data.totals?.peer_groups_count ?? 0} grupo
              {(data.totals?.peer_groups_count ?? 0) === 1 ? "" : "s"}
            </span>
            <span>·</span>
            <span>
              {data.totals?.students_count ?? 0} aluno
              {(data.totals?.students_count ?? 0) === 1 ? "" : "s"}
            </span>
          </div>
        ) : null}

        {sections.length === 0 ? (
          <Card className="border border-dashed border-border/70">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Nenhum resultado para os filtros selecionados. Ajuste série, turma ou turno e tente novamente.
            </CardContent>
          </Card>
        ) : (
          sections.map((section) => (
            <SectionBlock
              key={section.serie_id || section.serie_name}
              section={section}
              page={page}
              onPageChange={onPageChange}
            />
          ))
        )}
      </div>
    </RankingContentShell>
  );
}
