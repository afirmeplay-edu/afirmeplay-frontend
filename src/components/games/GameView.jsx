import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { ArrowLeft, Play, Calendar, User, BookOpen } from 'lucide-react';
import { useContentReward } from '@/hooks/useContentReward';
import { RewardEarnedModal } from '@/components/rewards/RewardEarnedModal';
import { getMyContentRewards } from '@/services/contentRewardsApi';
import { useToast } from '@/hooks/use-toast';

const GameView = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { toast } = useToast();
    const [game, setGame] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [alreadyClaimed, setAlreadyClaimed] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const isStudentView = location.pathname.includes('/aluno');

    useEffect(() => {
        fetchGame();
    }, [id]);

    useEffect(() => {
        if (!isStudentView || !id) return;
        let cancelled = false;
        getMyContentRewards('game')
            .then((res) => {
                if (!cancelled && res.content_ids?.includes(id)) {
                    setAlreadyClaimed(true);
                }
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [isStudentView, id]);

    const { visibleSeconds, requiredSeconds, claimResult, progressRatio } = useContentReward({
        type: 'game',
        id,
        enabled: isStudentView && Boolean(id) && !alreadyClaimed,
        alreadyClaimed,
    });

    useEffect(() => {
        if (!claimResult) return;
        if (claimResult.status === 'granted') {
            setAlreadyClaimed(true);
            setModalOpen(true);
        } else if (claimResult.status === 'daily_cap_reached') {
            toast({
                title: 'Limite diário de moedas',
                description: 'Você já ganhou o máximo de moedas de Jogos e Play TV hoje. Tente este jogo amanhã.',
            });
        } else if (claimResult.status === 'already_claimed') {
            setAlreadyClaimed(true);
        }
    }, [claimResult, toast]);

    // Remover banner do Wordwall após o iframe carregar
    useEffect(() => {
        if (!game) return;

        const removeWordwallBanner = () => {
            // Procurar pelo elemento embed-banner em todo o documento
            const banner = document.querySelector('.embed-banner');
            if (banner) {
                banner.remove();
                return true;
            }
            return false;
        };

        // Tentar remover imediatamente
        removeWordwallBanner();

        // Usar MutationObserver para detectar quando o banner é adicionado
        const observer = new MutationObserver(() => {
            if (removeWordwallBanner()) {
                observer.disconnect();
            }
        });

        // Observar mudanças no body
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Também usar um intervalo como fallback (caso o observer não capture)
        const interval = setInterval(() => {
            if (removeWordwallBanner()) {
                clearInterval(interval);
            }
        }, 500);

        // Limpar após 10 segundos (tempo suficiente para o iframe carregar)
        const timeout = setTimeout(() => {
            observer.disconnect();
            clearInterval(interval);
        }, 10000);

        return () => {
            observer.disconnect();
            clearInterval(interval);
            clearTimeout(timeout);
        };
    }, [game]);

    const fetchGame = async () => {
        try {
            setIsLoading(true);
            const response = await api.get(`/games/${id}`);
            // Verificar se a resposta tem a estrutura correta
            const gameData = response.data.jogo || response.data;
            setGame(gameData);
        } catch (error) {
            console.error('Erro ao carregar jogo:', error);
            setError('Erro ao carregar o jogo');
        } finally {
            setIsLoading(false);
        }
    };

    const handleBack = () => {
        // Verificar se o usuário é aluno ou admin/professor
        const isStudent = window.location.pathname.includes('/aluno');
        navigate(isStudent ? '/aluno/jogos' : '/app/jogos');
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <span className="ml-2">Carregando jogo...</span>
            </div>
        );
    }

    if (error || !game) {
        return (
            <div className="text-center py-12">
                <p className="text-destructive mb-4">{error || 'Jogo não encontrado'}</p>
                <Button onClick={handleBack} variant="outline">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Voltar aos Jogos
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button onClick={handleBack} variant="outline" size="sm">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Voltar
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold">{game.title}</h1>
                        <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                            {game.subject && (
                                <div className="flex items-center gap-1">
                                    <BookOpen className="w-4 h-4" />
                                    {game.subject}
                                </div>
                            )}
                            {game.author && (
                                <div className="flex items-center gap-1">
                                    <User className="w-4 h-4" />
                                    {game.author}
                                </div>
                            )}
                            {game.createdAt && (
                                <div className="flex items-center gap-1">
                                    <Calendar className="w-4 h-4" />
                                    {new Date(game.createdAt).toLocaleDateString('pt-BR')}
                                </div>
                            )}
                            {game.created_at && (
                                <div className="flex items-center gap-1">
                                    <Calendar className="w-4 h-4" />
                                    {new Date(game.created_at).toLocaleDateString('pt-BR')}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <Badge variant="secondary">
                    {game.provider === 'wordwall' ? 'Wordwall' : 'Jogo Educativo'}
                </Badge>
            </div>

            {/* Game Container */}
            <div className="flex justify-center">
                <Card className=" max-w-6xl">
                    <CardContent className="p-0">
                        <div className="w-full min-h-[600px] bg-muted rounded-lg overflow-hidden">
                            {game.iframeHtml ? (
                                <div
                                    className="w-full h-full min-h-[600px]"
                                    dangerouslySetInnerHTML={{ __html: game.iframeHtml }}
                                />
                            ) : game.url ? (
                                <iframe
                                    src={game.url}
                                    className="w-full h-full min-h-[600px] border-0"
                                    allowFullScreen
                                    title={game.title}
                                />
                            ) : (
                                <div className="flex items-center justify-center h-[600px]">
                                    <div className="text-center">
                                        <Play className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                                        <p className="text-muted-foreground">Jogo não disponível</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Como Jogar */}
            <div className="flex justify-center">
                <Card className="max-w-6xl w-full">
                    <CardHeader>
                        <CardTitle>Como Jogar</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            <div className="flex items-start gap-3">
                                <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium mt-0.5">
                                    1
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    Leia atentamente as instruções do jogo
                                </p>
                            </div>

                            <div className="flex items-start gap-3">
                                <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium mt-0.5">
                                    2
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    Clique nos elementos interativos para jogar
                                </p>
                            </div>

                            <div className="flex items-start gap-3">
                                <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium mt-0.5">
                                    3
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    Complete as atividades propostas pelo jogo
                                </p>
                            </div>

                            <div className="flex items-start gap-3">
                                <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium mt-0.5">
                                    4
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    Divirta-se aprendendo!
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {isStudentView && !alreadyClaimed && requiredSeconds > 0 && progressRatio < 1 && (
                <div className="flex justify-center">
                    <p className="text-xs text-muted-foreground">
                        Continue jogando para ganhar moedas ({Math.min(visibleSeconds, requiredSeconds)}s / {requiredSeconds}s)
                    </p>
                </div>
            )}

            <RewardEarnedModal
                open={modalOpen}
                onOpenChange={setModalOpen}
                coins={claimResult?.coins ?? 0}
                description="Você ganhou moedas por jogar!"
            />

        </div>
    );
};

export default GameView; 