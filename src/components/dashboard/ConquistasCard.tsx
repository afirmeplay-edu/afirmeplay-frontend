import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Coins, Lock, Sparkles, ArrowRight, HelpCircle } from "lucide-react";
import {
  getConquistas,
  resgatarConquista,
  type Conquista,
  type ConquistaNivel,
  type MedalhaTipo,
} from "@/services/conquistasApi";
import { useToast } from "@/hooks/use-toast";
import {
  MEDALHA_LABEL,
  MEDALHA_STYLES,
  MEDALHA_CARD_STYLES,
  MEDALHA_CARD_BLOQUEADO,
  MedalIcon,
} from "@/components/conquistas/medalConfig";

interface ConquistasCardProps {
  /** Chamado após resgatar uma conquista (ex.: atualizar saldo de moedas) */
  onRedeem?: () => void;
}

/** Retorna lista de { achievement_id, medalha } que podem ser resgatados */
function getResgataveis(conquistas: Conquista[]): { achievement_id: string; medalha: MedalhaTipo }[] {
  const out: { achievement_id: string; medalha: MedalhaTipo }[] = [];
  for (const c of conquistas) {
    if (c.niveis?.length) {
      for (const n of c.niveis) {
        if (n.desbloqueada && !n.resgatado && n.moedas_valor > 0)
          out.push({ achievement_id: c.achievement_id, medalha: n.medalha });
      }
    } else if (c.medalha && (c.moedas_valor ?? 0) > 0 && !c.resgatado) {
      out.push({ achievement_id: c.achievement_id, medalha: c.medalha as MedalhaTipo });
    }
  }
  return out;
}

const ConquistasCard: React.FC<ConquistasCardProps> = ({ onRedeem }) => {
  const [conquistas, setConquistas] = useState<Conquista[]>([]);
  const [loading, setLoading] = useState(true);
  const [resgatandoId, setResgatandoId] = useState<string | null>(null);
  const [resgatandoTodas, setResgatandoTodas] = useState(false);
  const [modalOQueSaoAberto, setModalOQueSaoAberto] = useState(false);
  const { toast } = useToast();
  const resgataveis = React.useMemo(() => getResgataveis(conquistas), [conquistas]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getConquistas();
      setConquistas(data ?? []);
    } catch {
      setConquistas([]);
      toast({
        title: "Erro",
        description: "Não foi possível carregar suas conquistas.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleResgatar = async (achievementId: string, medalha: MedalhaTipo) => {
    const key = `${achievementId}-${medalha}`;
    setResgatandoId(key);
    try {
      const result = await resgatarConquista({ achievement_id: achievementId, medalha });
      toast({
        title: "Resgate realizado",
        description: `+${result.moedas_creditadas} moedas creditadas. Novo saldo: ${result.novo_saldo}`,
        variant: "default",
      });
      onRedeem?.();
      await load();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        "Não foi possível resgatar.";
      toast({
        title: "Erro ao resgatar",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setResgatandoId(null);
    }
  };

  const handleResgatarTodas = async () => {
    if (resgataveis.length === 0) return;
    setResgatandoTodas(true);
    let sucesso = 0;
    for (const { achievement_id, medalha } of resgataveis) {
      try {
        const result = await resgatarConquista({ achievement_id, medalha });
        sucesso++;
        toast({
          title: "Resgate realizado",
          description: `+${result.moedas_creditadas} moedas. Saldo: ${result.novo_saldo}`,
          variant: "default",
        });
      } catch {
        toast({
          title: "Erro ao resgatar",
          description: "Não foi possível resgatar um dos itens.",
          variant: "destructive",
        });
      }
    }
    if (sucesso > 0) {
      onRedeem?.();
      await load();
      if (sucesso === resgataveis.length) {
        toast({
          title: "Todas resgatadas",
          description: `${sucesso} conquista(s) resgatada(s) com sucesso.`,
          variant: "default",
        });
      }
    }
    setResgatandoTodas(false);
  };

  const textoRequisito = (c: Conquista, nivel: ConquistaNivel) =>
    nivel.requisito ?? c.descricao ?? "Atingir este nível";
  const textoProgresso = (nivel: ConquistaNivel) => {
    if (nivel.progresso_atual != null && nivel.progresso_meta != null && nivel.progresso_meta > 0) {
      return `${nivel.progresso_atual} de ${nivel.progresso_meta}`;
    }
    return `${Math.min(100, Math.round(nivel.progresso))}%`;
  };

  const renderNivel = (
    c: Conquista,
    nivel: ConquistaNivel,
    index: number
  ) => {
    const key = `${c.achievement_id}-${nivel.medalha}`;
    const podeResgatar =
      nivel.desbloqueada && !nivel.resgatado && nivel.moedas_valor > 0;
    const estaResgatando = resgatandoId === key;
    const cardStyle = nivel.desbloqueada
      ? `rounded-lg border-2 p-2 shadow-sm relative overflow-hidden ${MEDALHA_CARD_STYLES[nivel.medalha].card}`
      : `rounded-lg p-1.5 relative overflow-hidden ${MEDALHA_CARD_BLOQUEADO[nivel.medalha]}`;

    return (
      <div key={key} className={`flex flex-col gap-1 ${cardStyle}`}>
        {/* Medalha de fundo (mantida) */}
        <div
          className={`absolute right-0.5 top-1/2 -translate-y-1/2 pointer-events-none ${
            nivel.desbloqueada ? "opacity-20 text-white" : "opacity-15 text-muted-foreground"
          }`}
          aria-hidden
        >
          <MedalIcon tipo={nivel.medalha} size={28} />
        </div>
        {/* Topo: badge Bronze/Prata/Ouro/Platina no canto superior direito */}
        <div className="flex items-start justify-end gap-1 relative z-10">
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${MEDALHA_STYLES[nivel.medalha]}`}
          >
            {MEDALHA_LABEL[nivel.medalha]}
          </span>
          {podeResgatar && (
            <Button
              size="sm"
              variant="secondary"
              className="h-5 text-[10px] px-1.5 shrink-0"
              onClick={() => handleResgatar(c.achievement_id, nivel.medalha)}
              disabled={estaResgatando}
            >
              {estaResgatando ? (
                <Loader2 className="w-2.5 h-2.5 animate-spin" />
              ) : (
                <>
                  <Coins className="w-2.5 h-2.5 mr-0.5" />
                  Resgatar
                </>
              )}
            </Button>
          )}
        </div>
        {/* Título em destaque: Requisito */}
        <p className={`relative z-10 text-xs font-bold leading-tight line-clamp-1 ${nivel.desbloqueada ? "" : "text-muted-foreground"}`}>
          {textoRequisito(c, nivel)}
        </p>
        <div className="relative z-10 space-y-0.5 text-[11px] leading-tight opacity-95">
          <p className={`flex flex-wrap items-center gap-1 ${nivel.desbloqueada ? "" : "text-muted-foreground"}`}>
            <span className="font-medium">Progresso:</span> {textoProgresso(nivel)}
            <span className="font-medium">·</span>
            <span className="inline-flex items-center gap-0.5">
              <Coins className="w-2.5 h-2.5" />
              {nivel.resgatado ? "Resgatado" : `Ao passar: ${nivel.moedas_valor} moedas`}
            </span>
          </p>
        </div>
      </div>
    );
  };

  const renderConquistaUnica = (c: Conquista) => {
    const podeResgatar =
      c.medalha &&
      c.moedas_valor != null &&
      c.moedas_valor > 0 &&
      !c.resgatado;
    const key = `${c.achievement_id}-${c.medalha}`;
    const estaResgatando = resgatandoId === key;
    const medalha = c.medalha as MedalhaTipo;
    const cardClass = c.medalha
      ? `rounded-lg border-2 p-2 space-y-1.5 relative overflow-hidden ${MEDALHA_CARD_STYLES[medalha].card}`
      : "rounded-lg border border-border bg-card p-2 space-y-1.5";

    return (
      <div key={c.achievement_id} className={cardClass}>
        {/* Medalha de fundo (mantida) */}
        {c.medalha && (
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-20 text-current pointer-events-none" aria-hidden>
            <MedalIcon tipo={medalha} size={36} />
          </div>
        )}
        {/* Topo: título em destaque + badge no canto superior direito */}
        <div className="flex items-start justify-between gap-2 relative z-10">
          <h3 className="font-bold text-sm truncate leading-tight min-w-0">{c.nome}</h3>
          {c.medalha && (
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${MEDALHA_STYLES[medalha]}`}
            >
              {MEDALHA_LABEL[medalha]}
            </span>
          )}
        </div>
        <div className="relative z-10 space-y-0.5 text-[11px] leading-tight opacity-95">
          <p className="line-clamp-1">
            <span className="font-medium">Requisito:</span> {c.descricao || "Atingir esta conquista"}
          </p>
          {c.progresso != null && (
            <p>
              <span className="font-medium">Progresso:</span> {Math.min(100, Math.round(c.progresso))}%
            </p>
          )}
          <p className="flex items-center gap-1">
            <Coins className="w-3 h-3" />
            <span className="font-medium">
              {c.moedas_valor != null && c.moedas_valor > 0
                ? (c.resgatado ? "Resgatado" : `Ao passar para este nível: ${c.moedas_valor} moedas`)
                : "—"}
            </span>
          </p>
        </div>
        {c.progresso != null && (
          <Progress value={Math.min(100, c.progresso)} className="h-1.5 relative z-10" />
        )}
        <div className="flex items-center justify-end relative z-10">
          {podeResgatar && (
            <Button
              size="sm"
              variant="secondary"
              className="h-6 text-[11px] px-1.5"
              onClick={() => handleResgatar(c.achievement_id, medalha)}
              disabled={estaResgatando}
            >
              {estaResgatando ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <>
                  <Coins className="w-3 h-3 mr-1" />
                  Resgatar
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <Card className="h-full flex flex-col hover:shadow-lg transition-shadow duration-300">
      <CardHeader className="pb-3 flex-shrink-0">
        <CardTitle className="flex items-center gap-2 sm:gap-3 text-base sm:text-lg">
          <div className="p-2 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-lg flex-shrink-0">
            <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </div>
          <div className="min-w-0">
            <div className="truncate">Conquistas</div>
            <div className="text-xs text-muted-foreground font-normal">
              Desbloqueie e resgate por moedas
            </div>
            <button
              type="button"
              onClick={() => setModalOQueSaoAberto(true)}
              className="mt-1 text-xs text-primary hover:underline inline-flex items-center gap-1 font-normal focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded"
              aria-label="O que são as conquistas? Abre explicação"
            >
              <HelpCircle className="w-3.5 h-3.5 flex-shrink-0" />
              O que são as conquistas?
            </button>
          </div>
        </CardTitle>
      </CardHeader>

      <Dialog open={modalOQueSaoAberto} onOpenChange={setModalOQueSaoAberto}>
        <DialogContent ariaTitle="O que são as conquistas?">
          <DialogHeader>
            <DialogTitle className="text-lg flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              O que são as conquistas?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>
              Conquistas são medalhas que você ganha ao cumprir metas — como boas notas, avaliações e ranking.
            </p>
            <p>
              Muitas podem ser resgatadas por moedas para personalizar seu perfil na loja.
            </p>
          </div>
        </DialogContent>
      </Dialog>
      <CardContent className="pt-0 flex-1 flex flex-col min-h-0">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : conquistas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <MedalIcon tipo="ouro" size={40} withBg />
            <p className="text-sm font-medium text-foreground mt-3">Nenhuma conquista ainda</p>
            <p className="text-xs text-muted-foreground mt-1">
              Complete avaliações e competições para desbloquear conquistas.
            </p>
            <Link
              to="/aluno/conquistas"
              className="mt-3 text-sm font-medium text-primary hover:underline inline-flex items-center gap-1"
            >
              Ver página de conquistas
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        ) : (
          <>
            {resgataveis.length > 1 && (
              <Button
                size="sm"
                variant="default"
                className="w-full mb-3 flex-shrink-0 gap-2 bg-amber-600 hover:bg-amber-700 text-white"
                onClick={handleResgatarTodas}
                disabled={resgatandoTodas}
              >
                {resgatandoTodas ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Coins className="w-4 h-4" />
                    Resgatar todas ({resgataveis.length})
                  </>
                )}
              </Button>
            )}
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-1 space-y-2">
              {conquistas.slice(0, 3).map((c, index) => {
                const nome = c.estado === "oculta" && !c.nome ? "???" : (c.nome || "???");
                const descricao =
                  c.estado === "oculta" && !c.descricao ? "???" : (c.descricao || "");
                const listKey = `conquista-${c.achievement_id}-${index}`;

                if (c.niveis && c.niveis.length > 0) {
                  return (
                    <div
                      key={listKey}
                      className="rounded-lg border border-border bg-card/80 dark:bg-card/90 p-2 space-y-1.5"
                    >
                      <div className="font-semibold text-xs truncate">{nome}</div>
                      {descricao && descricao !== "???" && (
                        <p className="text-[11px] text-muted-foreground line-clamp-1">
                          {descricao}
                        </p>
                      )}
                      <div className="space-y-1.5">
                        {c.niveis.map((nivel, idx) =>
                          renderNivel({ ...c, nome, descricao }, nivel, idx)
                        )}
                      </div>
                    </div>
                  );
                }

                return (
                  <React.Fragment key={listKey}>
                    {renderConquistaUnica({ ...c, nome, descricao })}
                  </React.Fragment>
                );
              })}
            </div>
            <Link
              to="/aluno/conquistas"
              className="mt-3 flex-shrink-0 flex items-center justify-center gap-1.5 text-sm font-medium text-primary hover:underline py-2"
            >
              Ver todas as conquistas
              <ArrowRight className="w-4 h-4" />
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default ConquistasCard;
