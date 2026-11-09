import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Loader2, Coins, Lock, ArrowLeft, Info } from "lucide-react";
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

export const ConquistasPage: React.FC = () => {
  const [conquistas, setConquistas] = useState<Conquista[]>([]);
  const [loading, setLoading] = useState(true);
  const [resgatandoId, setResgatandoId] = useState<string | null>(null);
  const [resgatandoTodas, setResgatandoTodas] = useState(false);
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
    if (sucesso > 0) await load();
    if (sucesso === resgataveis.length && resgataveis.length > 1) {
      toast({
        title: "Todas resgatadas",
        description: `${sucesso} conquista(s) resgatada(s) com sucesso.`,
        variant: "default",
      });
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

  const renderNivelGrande = (c: Conquista, nivel: ConquistaNivel) => {
    const key = `${c.achievement_id}-${nivel.medalha}`;
    const podeResgatar =
      nivel.desbloqueada && !nivel.resgatado && nivel.moedas_valor > 0;
    const estaResgatando = resgatandoId === key;
    const cardStyle = nivel.desbloqueada
      ? `rounded-lg border-2 p-3 relative overflow-hidden ${MEDALHA_CARD_STYLES[nivel.medalha].card}`
      : `rounded-lg p-3 relative overflow-hidden ${MEDALHA_CARD_BLOQUEADO[nivel.medalha]}`;

    return (
      <div key={key} className={cardStyle}>
        {/* Ícone de medalha na área vazia (fundo) */}
        <div
          className={`absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none ${
            nivel.desbloqueada ? "opacity-20 text-white" : "opacity-15 text-muted-foreground"
          }`}
          aria-hidden
        >
          <MedalIcon tipo={nivel.medalha} size={40} />
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 relative z-10">
          <div className="flex items-center gap-3 min-w-0">
            {nivel.desbloqueada ? (
              <MedalIcon tipo={nivel.medalha} size={24} withBg />
            ) : (
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-muted border-2 border-border flex items-center justify-center">
                <Lock className="w-5 h-5 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <span
                className={`text-sm font-bold ${
                  nivel.desbloqueada ? "text-current" : "text-muted-foreground"
                }`}
              >
                {MEDALHA_LABEL[nivel.medalha]}
              </span>
              <div className="mt-1 space-y-0.5 text-xs opacity-95">
                <p className={nivel.desbloqueada ? "" : "text-muted-foreground"}>
                  <span className="font-semibold">Requisito:</span> {textoRequisito(c, nivel)}
                </p>
                <p className={nivel.desbloqueada ? "" : "text-muted-foreground"}>
                  <span className="font-semibold">Progresso:</span> {textoProgresso(nivel)}
                  <span className="mx-1">·</span>
                  <span className="inline-flex items-center gap-1">
                    <Coins className="w-3.5 h-3.5" />
                    {nivel.resgatado ? "Resgatado" : `Ao passar para este nível: ${nivel.moedas_valor} moedas`}
                  </span>
                </p>
              </div>
            </div>
          </div>
          {podeResgatar && (
            <Button
              size="sm"
              className="flex-shrink-0"
              onClick={() => handleResgatar(c.achievement_id, nivel.medalha)}
              disabled={estaResgatando}
            >
              {estaResgatando ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Coins className="w-4 h-4 mr-2" />
                  Resgatar
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    );
  };

  const renderCardUnico = (c: Conquista) => {
    const podeResgatar =
      c.medalha &&
      c.moedas_valor != null &&
      c.moedas_valor > 0 &&
      !c.resgatado;
    const key = `${c.achievement_id}-${c.medalha}`;
    const estaResgatando = resgatandoId === key;
    const medalha = c.medalha as MedalhaTipo;
    const cardClass = c.medalha
      ? `rounded-xl border-2 p-4 relative overflow-hidden ${MEDALHA_CARD_STYLES[medalha].card}`
      : "rounded-xl border border-border bg-card p-4";

    return (
      <Card key={c.achievement_id} className={cardClass}>
        <CardContent className="p-4">
          {c.medalha && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-20 text-current pointer-events-none" aria-hidden>
              <MedalIcon tipo={medalha} size={56} />
            </div>
          )}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 relative z-10">
            {c.medalha && (
              <MedalIcon tipo={medalha} size={32} withBg />
            )}
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold truncate">{c.nome}</h3>
              {c.medalha && (
                <span
                  className={`inline-block mt-0.5 text-xs px-2 py-0.5 rounded-full border bg-white/20 border-white/40 ${MEDALHA_STYLES[medalha].text}`}
                >
                  {MEDALHA_LABEL[medalha]}
                </span>
              )}
              <div className="mt-2 space-y-0.5 text-xs opacity-95">
                <p>
                  <span className="font-semibold">Requisito:</span> {c.descricao || "Atingir esta conquista"}
                </p>
                {c.progresso != null && (
                  <p>
                    <span className="font-semibold">Progresso:</span> {Math.min(100, Math.round(c.progresso))}%
                  </p>
                )}
                <p className="flex items-center gap-1">
                  <Coins className="w-3.5 h-3.5" />
                  <span className="font-semibold">
                    {c.moedas_valor != null && c.moedas_valor > 0
                      ? (c.resgatado ? "Resgatado" : `Ao passar para este nível: ${c.moedas_valor} moedas`)
                      : "—"}
                  </span>
                </p>
              </div>
              {c.progresso != null && (
                <div className="mt-2">
                  <Progress value={Math.min(100, c.progresso)} className="h-1.5" />
                </div>
              )}
              {podeResgatar && (
                <Button
                  size="sm"
                  className="mt-2"
                  onClick={() => handleResgatar(c.achievement_id, medalha)}
                  disabled={estaResgatando}
                >
                  {estaResgatando ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Coins className="w-4 h-4 mr-2" />
                      Resgatar
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="container mx-auto py-6 px-4 max-w-4xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/aluno" aria-label="Voltar ao painel">
            <ArrowLeft className="w-5 h-5" />
          </Link>
        </Button>
        <div className="space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight bg-gradient-to-r from-amber-600 via-yellow-500 to-amber-600 dark:from-amber-500 dark:via-yellow-400 dark:to-amber-500 bg-clip-text text-transparent">
            Todas as conquistas
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            Desbloqueie níveis e resgate moedas por cada medalha.
          </p>
        </div>
      </div>

      <Card className="border-2 border-amber-200/60 dark:border-amber-800/50 bg-gradient-to-br from-amber-50/80 to-yellow-50/80 dark:from-amber-950/30 dark:to-yellow-950/20">
        <CardContent className="p-4 sm:p-5">
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-500/20 dark:bg-amber-500/30 flex items-center justify-center">
              <Info className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="min-w-0 space-y-3">
              <h2 className="font-semibold text-foreground">O que são as conquistas?</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Conquistas são medalhas que você ganha ao cumprir metas — como boas notas, avaliações e ranking.
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Muitas podem ser resgatadas por moedas para personalizar seu perfil na loja.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
        </div>
      ) : conquistas.length === 0 ? (
        <Card className="border-2 border-dashed">
          <CardContent className="py-16 text-center">
            <MedalIcon tipo="ouro" size={56} withBg />
            <p className="text-lg font-semibold mt-4">Nenhuma conquista ainda</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              Complete avaliações e competições para desbloquear conquistas e resgatar moedas.
            </p>
            <Button asChild className="mt-4" variant="outline">
              <Link to="/aluno">Voltar ao painel</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {resgataveis.length > 1 && (
            <Button
              size="lg"
              className="w-full gap-2 bg-amber-600 hover:bg-amber-700 text-white"
              onClick={handleResgatarTodas}
              disabled={resgatandoTodas}
            >
              {resgatandoTodas ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Coins className="w-5 h-5" />
                  Resgatar todas ({resgataveis.length} itens)
                </>
              )}
            </Button>
          )}
          {conquistas.map((c, index) => {
            const nome = c.estado === "oculta" && !c.nome ? "???" : (c.nome || "???");
            const descricao =
              c.estado === "oculta" && !c.descricao ? "???" : (c.descricao || "");
            const listKey = `conquista-${c.achievement_id}-${index}`;

            if (c.niveis && c.niveis.length > 0) {
              return (
                <Card key={listKey} className="overflow-hidden border-2">
                  <CardContent className="p-4">
                    <h2 className="text-base font-bold truncate mb-0.5">{nome}</h2>
                    {descricao && descricao !== "???" && (
                      <p className="text-muted-foreground text-xs mb-3 line-clamp-1">{descricao}</p>
                    )}
                    <div className="grid gap-3 sm:grid-cols-1">
                      {c.niveis.map((nivel) =>
                        renderNivelGrande({ ...c, nome, descricao }, nivel)
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            }

            return (
              <React.Fragment key={listKey}>
                {renderCardUnico({ ...c, nome, descricao })}
              </React.Fragment>
            );
          })}
        </div>
      )}

      <div className="pt-4">
        <Button variant="ghost" asChild>
          <Link to="/aluno" className="inline-flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Voltar ao painel
          </Link>
        </Button>
      </div>
    </div>
  );
};

export default ConquistasPage;
