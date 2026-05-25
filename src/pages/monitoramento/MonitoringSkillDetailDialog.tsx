import { useQuery } from "@tanstack/react-query";
import { BookOpen, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  MonitoramentoApiService,
  type MonitoringFilters,
  type MonitoringSkillDetail,
} from "@/services/monitoramento/monitoramentoApi";

export type MonitoringSkillDetailRequest = {
  codigo: string;
  disciplina?: string;
  source_type: MonitoringFilters["tipo_origem"];
  source_id: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: MonitoringSkillDetailRequest | null;
  pageFilters: MonitoringFilters;
};

export function MonitoringSkillDetailDialog({ open, onOpenChange, request, pageFilters }: Props) {
  const detailQuery = useQuery({
    queryKey: [
      "monitoramento-habilidade-detalhe",
      request?.codigo,
      request?.disciplina,
      request?.source_type,
      request?.source_id,
      pageFilters.municipio,
      pageFilters.tipo_origem,
      pageFilters.avaliacao_id,
      pageFilters.gabarito_id,
    ],
    queryFn: () =>
      MonitoramentoApiService.getSkillDetail({
        ...pageFilters,
        tipo_origem: request!.source_type,
        avaliacao_id: request!.source_type === "avaliacao" ? request!.source_id : pageFilters.avaliacao_id,
        gabarito_id: request!.source_type === "cartao_resposta" ? request!.source_id : pageFilters.gabarito_id,
        codigo: request!.codigo,
        disciplina: request?.disciplina || pageFilters.disciplina || "",
      }),
    enabled: open && Boolean(request?.codigo && request?.source_id),
  });

  const detail: MonitoringSkillDetail | undefined = detailQuery.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6 text-left text-lg">
            <BookOpen className="h-5 w-5 shrink-0 text-primary" />
            {detail?.codigo || request?.codigo || "Habilidade"}
          </DialogTitle>
        </DialogHeader>

        {detailQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Carregando detalhes…
          </div>
        ) : detailQuery.isError ? (
          <p className="py-6 text-sm text-destructive">Não foi possível carregar o detalhe desta habilidade.</p>
        ) : detail ? (
          <div className="space-y-5 text-sm">
            {detail.disciplina ? (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Disciplina</p>
                <p className="mt-1 font-medium">{detail.disciplina}</p>
              </div>
            ) : null}

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Código</p>
              <p className="mt-1 font-mono text-base">{detail.codigo}</p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Descrição</p>
              <p className="mt-1 leading-relaxed text-foreground/90">{detail.descricao || "—"}</p>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Questões da avaliação com esta habilidade
              </p>
              {detail.questoes.length ? (
                <ul className="space-y-2">
                  {detail.questoes.map((questao) => (
                    <li
                      key={`${questao.numero}-${questao.disciplina}`}
                      className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2"
                    >
                      <Badge variant="secondary" className="font-mono">
                        Q{questao.numero}
                      </Badge>
                      {detail.questoes.length > 1 || !detail.disciplina ? (
                        <span className="text-muted-foreground">{questao.disciplina}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">
                  Nenhuma questão vinculada a esta habilidade foi encontrada neste instrumento.
                </p>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
