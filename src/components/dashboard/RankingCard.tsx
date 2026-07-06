import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Trophy, ArrowUp, ArrowDown, Info, FileText, Loader2 } from "lucide-react";
import { AvatarPreview } from "@/components/profile/AvatarPreview";
import type { AvatarConfig } from "@/context/authContext";
import { MedalIcon } from "@/components/conquistas/medalConfig";
import type { MedalhaTipo } from "@/services/conquistasApi";

export type MedalhaRanking = "platina" | "ouro" | "prata" | "bronze";

export interface RankingListItem {
  id: number;
  nome: string;
  acertos: number;
  total: number;
  posicao: number;
  pontos: number;
  avatar?: string;
  profile_picture?: string | null;
  avatar_config?: AvatarConfig | Record<string, unknown> | null;
  /** Classificação por posição: 1º platina, 2º ouro, 3º prata, 4º bronze, 5º+ undefined */
  medalha?: MedalhaRanking | null;
  serie?: string;
  class_name?: string;
  school_name?: string;
  avaliacoes?: number;
}

interface RankingCardProps {
  ranking: {
    posicaoAtual: number;
    pontos: number;
    mudancaPosicao: number;
    lista: RankingListItem[];
    proximoObjetivo: {
      posicao: number;
      pontosNecessarios: number;
      progresso: number;
    };
  };
  rankingFilter: 'turma' | 'escola';
  onRankingFilterChange: (filter: 'turma' | 'escola') => void;
  userName?: string;
  /** Avatar do usuário logado (para a seção "Sua posição") */
  currentUserAvatar?: { profile_picture?: string | null; avatar_config?: AvatarConfig | Record<string, unknown> | null };
  /** Exibe carregamento ao trocar de escopo (turma/escola/município) */
  isLoading?: boolean;
}

/** Formata média do ranking (pt-BR, 1 casa decimal) — usado no bloco "Sua posição" e na lista */
function formatRankingMedia(value: number | string): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "0,0";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Normaliza avatar_config da API (pode vir com "icon") para AvatarConfig (usa "seed") */
function normalizeAvatarConfig(config: Record<string, unknown> | null | undefined): AvatarConfig | null {
  if (!config || typeof config !== "object") return null;
  const c = config as Record<string, unknown>;
  if (Object.keys(c).length === 0) return null;
  return {
    ...c,
    seed: (c.seed as string) ?? (c.icon as string) ?? String(config),
  } as AvatarConfig;
}

/** Renderiza avatar do item: foto > avatar_config (ícone) > iniciais */
function RankingAvatar({ item, size = 24, className = "" }: { item: RankingListItem; size?: number; className?: string }) {
  const initials = item.nome.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "?";
  if (item.profile_picture) {
    return (
      <Avatar className={`flex-shrink-0 ${className}`} style={{ width: size, height: size }}>
        <AvatarImage src={item.profile_picture} alt={item.nome} />
        <AvatarFallback className="text-xs bg-muted">{initials}</AvatarFallback>
      </Avatar>
    );
  }
  const avatarConfig = normalizeAvatarConfig(item.avatar_config as Record<string, unknown> | null | undefined);
  if (avatarConfig?.seed) {
    return (
      <div className={`flex-shrink-0 rounded-full overflow-hidden border border-border ${className}`} style={{ width: size, height: size }}>
        <AvatarPreview config={avatarConfig} size={size} className="w-full h-full rounded-full" />
      </div>
    );
  }
  return (
    <Avatar className={`flex-shrink-0 ${className}`} style={{ width: size, height: size }}>
      <AvatarFallback className="text-xs bg-muted">{initials}</AvatarFallback>
    </Avatar>
  );
}

const RankingCard: React.FC<RankingCardProps> = ({ 
  ranking, 
  rankingFilter, 
  onRankingFilterChange, 
  userName,
  currentUserAvatar,
  isLoading = false,
}) => {
  // Verificar se há dados de ranking (lista ou sua posição)
  const hasData = ranking.lista.length > 0;
  const hasMyPosition = ranking.posicaoAtual > 0;

  return (
    <Card className="h-full flex flex-col hover:shadow-lg transition-shadow duration-300 relative overflow-hidden animate-fade-in-up motion-reduce:animate-none">
      <CardHeader className="pb-3 flex-shrink-0">
        <CardTitle className="flex items-center gap-2 sm:gap-3">
          <div className="p-2 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-lg flex-shrink-0">
            <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-base sm:text-lg font-semibold truncate">Ranking</div>
            <div className="text-xs text-muted-foreground">Sua posição atual</div>
          </div>
        </CardTitle>
        
        {/* Filtros do Ranking */}
        <div className="flex gap-1 bg-muted rounded-lg p-1 mt-3">
          <Button 
            size="sm" 
            variant={rankingFilter === 'turma' ? 'default' : 'ghost'} 
            className="text-xs px-1 sm:px-2 py-1 animate-fade-in-up motion-reduce:animate-none"
            style={{ animationDelay: isLoading ? "0ms" : "0ms" }}
            onClick={() => onRankingFilterChange('turma')}
            disabled={isLoading}
          >
            <span className="hidden sm:inline">Turma</span>
            <span className="sm:hidden">T</span>
          </Button>
          <Button 
            size="sm" 
            variant={rankingFilter === 'escola' ? 'default' : 'ghost'} 
            className="text-xs px-1 sm:px-2 py-1 animate-fade-in-up motion-reduce:animate-none"
            style={{ animationDelay: isLoading ? "0ms" : "80ms" }}
            onClick={() => onRankingFilterChange('escola')}
            disabled={isLoading}
          >
            <span className="hidden sm:inline">Série</span>
            <span className="sm:hidden">S</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col min-h-0 relative">
        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-8 px-4 space-y-4">
            <Loader2 className="h-10 w-10 animate-spin text-amber-500" aria-hidden />
            <p className="text-sm font-medium text-muted-foreground text-center">Carregando ranking…</p>
            <div className="w-full max-w-[200px] h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full w-1/3 rounded-full bg-amber-500/70 animate-[ranking-loading_1.2s_ease-in-out_infinite]" />
            </div>
          </div>
        ) : !hasData ? (
          /* Mensagem quando não há dados */
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <Info className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Nenhum dado disponível</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Você ainda não possui dados de ranking. Complete avaliações para aparecer no ranking!
            </p>
          </div>
        ) : (
          <>
            {/* Sua Posição Destacada (ou mensagem se não estiver no ranking) */}
            {hasMyPosition ? (
              <div className="bg-gradient-to-r from-blue-50 dark:from-blue-950/30 to-purple-50 dark:to-purple-950/30 rounded-lg p-2 sm:p-3 mb-4 border-2 border-blue-200 dark:border-blue-800 flex items-center gap-2 sm:gap-3">
                {currentUserAvatar?.profile_picture ? (
                  <Avatar className="w-8 h-8 sm:w-10 sm:h-10 flex-shrink-0">
                    <AvatarImage src={currentUserAvatar.profile_picture} alt={userName ?? "Você"} />
                    <AvatarFallback className="text-white text-xs sm:text-sm font-bold bg-gradient-to-br from-blue-500 to-purple-600">{userName ? userName.charAt(0).toUpperCase() : "J"}</AvatarFallback>
                  </Avatar>
                ) : (() => {
                  const config = normalizeAvatarConfig(currentUserAvatar?.avatar_config as Record<string, unknown> | null | undefined);
                  return config?.seed ? (
                    <div className="w-8 h-8 sm:w-10 sm:h-10 flex-shrink-0 rounded-full overflow-hidden border border-border">
                      <AvatarPreview config={config} size={40} className="w-full h-full rounded-full" />
                    </div>
                  ) : null;
                })() ?? (
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-bold text-xs sm:text-sm">{userName ? userName.charAt(0).toUpperCase() : "J"}</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-xs sm:text-sm text-foreground truncate">Você está em</div>
                  <div className="flex items-center gap-1 sm:gap-2 mt-1">
                    <Badge className="bg-blue-100 dark:bg-blue-950/30 text-blue-800 dark:text-blue-400 text-xs px-1 sm:px-2 py-1 flex-shrink-0">{ranking.posicaoAtual}º lugar</Badge>
                    {ranking.mudancaPosicao !== 0 && (
                      <span className={`text-xs flex items-center gap-1 font-medium ${ranking.mudancaPosicao > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"} flex-shrink-0`}>
                        {ranking.mudancaPosicao > 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                        {ranking.mudancaPosicao > 0 ? "+" : ""}{ranking.mudancaPosicao} posição{Math.abs(ranking.mudancaPosicao) > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-lg sm:text-2xl font-bold text-blue-600 dark:text-blue-400 leading-none">{formatRankingMedia(ranking.pontos)}</div>
                  <div className="text-xs text-muted-foreground">Média</div>
                </div>
              </div>
            ) : (
              <div className="bg-muted/50 rounded-lg p-2 sm:p-3 mb-4 border border-border flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-muted-foreground font-bold text-xs sm:text-sm">{userName ? userName.charAt(0).toUpperCase() : "J"}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-xs sm:text-sm text-foreground">Complete avaliações para entrar no ranking</div>
                </div>
              </div>
            )}

            {/* Lista em formato de linha (como no painel admin): posição/medalha, avatar, nome, turma • escola, média, avaliações */}
            <div className="space-y-1 max-h-[320px] overflow-y-auto ranking-list-scroll">
              {ranking.lista.map((item, index) => {
                const medalha = item.medalha ?? (index === 0 ? "platina" : index === 1 ? "ouro" : index === 2 ? "prata" : index === 3 ? "bronze" : null);
                const colors: Record<NonNullable<typeof medalha>, { bg: string; border: string; text: string }> = {
                  platina: { bg: "bg-violet-50 dark:bg-violet-950/30", border: "border-violet-200 dark:border-violet-800", text: "text-violet-600 dark:text-violet-400" },
                  ouro: { bg: "bg-yellow-50 dark:bg-yellow-950/30", border: "border-yellow-200 dark:border-yellow-800", text: "text-yellow-600 dark:text-yellow-400" },
                  prata: { bg: "bg-slate-100 dark:bg-slate-800/50", border: "border-slate-300 dark:border-slate-600", text: "text-slate-600 dark:text-slate-400" },
                  bronze: { bg: "bg-amber-50 dark:bg-amber-950/30", border: "border-amber-200 dark:border-amber-800", text: "text-amber-700 dark:text-amber-400" },
                };
                const c = medalha ? colors[medalha] : null;
                const detalhe = [item.serie, item.class_name].filter(Boolean).join(" ") || item.class_name || item.serie || "";
                const escola = item.school_name ? (detalhe ? `${detalhe} • ${item.school_name}` : item.school_name) : detalhe;

                return (
                  <div
                    key={item.id}
                    className={`flex items-center gap-2 sm:gap-3 py-2 px-2 rounded-lg border transition-all duration-200 ${
                      c ? `${c.bg} ${c.border} border` : "border-border hover:bg-muted/50"
                    } animate-fade-in-up motion-reduce:animate-none`}
                    style={{
                      animationDelay: isLoading ? "0ms" : `${Math.min(index * 60, 240)}ms`,
                    }}
                  >
                    <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center">
                      {medalha ? (
                        <div className={`flex items-center justify-center w-7 h-7 rounded-full border ${c!.border} ${c!.text}`} aria-hidden>
                          <MedalIcon tipo={medalha as MedalhaTipo} size={16} className={c!.text} />
                        </div>
                      ) : (
                        <span className="text-xs font-bold text-muted-foreground">#{item.posicao}</span>
                      )}
                    </div>
                    <RankingAvatar item={item} size={32} className="flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs sm:text-sm font-semibold truncate text-foreground">{item.nome}</div>
                      {escola && (
                        <div className="text-xs text-muted-foreground truncate mt-0.5">{escola}</div>
                      )}
                    </div>
                    <div className="flex flex-col items-end flex-shrink-0 gap-0.5">
                      <span className={`text-sm font-bold ${c ? c.text : "text-green-600 dark:text-green-400"}`}>
                        {formatRankingMedia(item.pontos)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">Média</span>
                    </div>
                    <div className="flex flex-col items-center flex-shrink-0">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground">{item.avaliacoes ?? 0}</span>
                      <span className="text-[10px] text-muted-foreground">Aval.</span>
                    </div>
                  </div>
                );
              })}
            </div>

          </>
        )}
      </CardContent>
    </Card>
  );
};

export default RankingCard;
