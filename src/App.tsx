import React, { Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { ToastContainer } from 'react-toastify'
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/authContext";
import { StudentPreferencesProvider } from "./context/StudentPreferencesContext";
import { PlanProvider } from "./context/PlanContext";
import Layout from "./components/layout/Layout";
import FullscreenLayout from "./components/layout/FullscreenLayout";
import { AppThemeStyles } from "./components/layout/AppThemeStyles";
import { PrivateRoute } from "./components/PrivateRoute";
import { RoleRoute } from "./components/layout/RoleRoute";

// Lazy loading para reduzir o tamanho dos chunks

// auth
const Login = React.lazy(() => import("@/pages/auth/Login"));
const ForgotPassword = React.lazy(() => import("@/pages/auth/ForgotPassword"));
const ResetPassword = React.lazy(() => import("@/pages/auth/ResetPassword"));
const ChangePassword = React.lazy(() => import("@/pages/auth/ChangePassword"));

// dashboard
const Index = React.lazy(() => import("@/pages/dashboard/Index"));
const ProfessorDashboard = React.lazy(() => import("@/pages/dashboard/ProfessorDashboard"));
const StudentDashboard = React.lazy(() => import("@/pages/dashboard/StudentDashboard"));

// evaluations
const Evaluations = React.lazy(() => import("@/pages/evaluations/Evaluations"));
const CreateEvaluation = React.lazy(() => import("@/pages/evaluations/CreateEvaluation"));
const EditEvaluation = React.lazy(() => import("@/pages/evaluations/EditEvaluation"));
const EvaluationCorrection = React.lazy(() => import("@/pages/evaluations/EvaluationCorrection"));
const ViewEvaluation = React.lazy(() => import("@/pages/evaluations/ViewEvaluation"));
const SkillsHeatMapPage = React.lazy(() => import("@/pages/evaluations/SkillsHeatMapPage"));
const AnaliseAvaliacoes = React.lazy(() => import("@/pages/evaluations/AnaliseAvaliacoes"));

// answer-sheet
const AnswerSheetGenerator = React.lazy(() => import("@/pages/answer-sheet/AnswerSheetGenerator"));
const AnswerSheetStudentDetailedResults = React.lazy(() => import("@/pages/answer-sheet/AnswerSheetStudentDetailedResults"));
const AnswerSheetCreateGabarito = React.lazy(() => import("@/pages/answer-sheet/AnswerSheetCreateGabarito"));
const AnswerSheetGenerateCards = React.lazy(() => import("@/pages/answer-sheet/AnswerSheetGenerateCards"));
const AnswerSheetCorrection = React.lazy(() => import("@/pages/answer-sheet/AnswerSheetCorrection"));

// reports
const RelatoriosAcertoNiveisHub = React.lazy(() => import("@/pages/reports/RelatoriosAcertoNiveisHub"));
const RelatoriosRelatorioEscolarHub = React.lazy(() => import("@/pages/reports/RelatoriosRelatorioEscolarHub"));
const RelatoriosResultadosHub = React.lazy(() => import("@/pages/reports/RelatoriosResultadosHub"));
const RankingHub = React.lazy(() => import("@/pages/reports/RankingHub"));
const RelatorioApresentacao19Slides = React.lazy(() => import("@/pages/reports/RelatorioApresentacao19Slides"));
const InseSaebReport = React.lazy(() => import("@/pages/reports/InseSaebReport"));
const PneerqReport = React.lazy(() => import("@/pages/reports/PneerqReport"));
const FormReports = React.lazy(() => import("@/pages/reports/FormReports"));
const FormRespostasReport = React.lazy(() => import("@/pages/reports/FormRespostasReport"));
const StudentResult = React.lazy(() => import("@/pages/reports/StudentResult"));
const StudentResultsPage = React.lazy(() => import("@/pages/reports/StudentResultsPage"));
const RelatoriosEvolucaoHub = React.lazy(() => import("@/pages/reports/RelatoriosEvolucaoHub"));
const MonitoramentoPage = React.lazy(() => import("@/pages/monitoramento/MonitoramentoPage"));

// questions
const CreateQuestionPage = React.lazy(() => import("@/pages/questions/CreateQuestionPage"));
const EditQuestionPage = React.lazy(() => import("@/pages/questions/EditQuestionPage"));
const QuestionsPage = React.lazy(() => import("@/pages/questions/QuestionsPage"));
const HabilidadesPage = React.lazy(() => import("@/pages/questions/HabilidadesPage"));

// forms
const FormRegistration = React.lazy(() => import("@/pages/forms/FormRegistration"));
const FormView = React.lazy(() => import("@/pages/forms/FormView"));
const FormCreate = React.lazy(() => import("@/pages/forms/FormCreate"));
const QuestionarioList = React.lazy(() => import("@/pages/forms/QuestionarioList"));
const QuestionarioRespond = React.lazy(() => import("@/pages/forms/QuestionarioRespond"));

// competitions
const CompetitionList = React.lazy(() => import("@/pages/competitions/Competitions"));
const CompetitionDetails = React.lazy(() => import("@/pages/competitions/CompetitionDetails"));
const CompetitionAnalytics = React.lazy(() => import("@/pages/competitions/CompetitionAnalytics"));
const CompetitionTemplatesList = React.lazy(() => import("@/pages/competitions/CompetitionTemplatesList"));
const CompetitionTemplateDetails = React.lazy(() => import("@/pages/competitions/CompetitionTemplateDetails"));
const CompetitionsStudent = React.lazy(() => import("@/pages/competitions/CompetitionsStudent"));
const CompetitionStudentDetail = React.lazy(() => import("@/pages/competitions/CompetitionStudentDetail"));
const CompetitionTest = React.lazy(() => import("@/pages/competitions/CompetitionTest"));
const CompetitionRankingPage = React.lazy(() => import("@/pages/competitions/CompetitionRanking"));

// games
const GamesManagement = React.lazy(() => import("@/pages/games/GamesManagement"));
const AddGame = React.lazy(() => import("@/pages/games/AddGame"));
const StudentGames = React.lazy(() => import("@/pages/games/StudentGames"));
const GameView = React.lazy(() => import("./components/games/GameView"));

// store
const Loja = React.lazy(() => import("@/pages/store/Loja"));
const StoreAdmin = React.lazy(() => import("@/pages/store/StoreAdmin"));
const StoreAdminForm = React.lazy(() => import("@/pages/store/StoreAdminForm"));
const StoreAdminBatchForm = React.lazy(() => import("@/pages/store/StoreAdminBatchForm"));
const CoinHistory = React.lazy(() => import("@/pages/store/CoinHistory"));
const CoinsAdmin = React.lazy(() => import("@/pages/store/CoinsAdmin"));
const OfflinePackPage = React.lazy(() => import("@/pages/offline/OfflinePackPage"));
const OfflinePackEditPage = React.lazy(() => import("@/pages/offline/OfflinePackEditPage"));

// olimpiadas
const Olimpiadas = React.lazy(() => import("@/pages/olimpiadas/Olimpiadas"));
const OlimpiadasStudent = React.lazy(() => import("@/pages/olimpiadas/OlimpiadasStudent"));
const OlimpiadaStudent = React.lazy(() => import("@/pages/olimpiadas/OlimpiadaStudent"));
const TorneioExecucao = React.lazy(() => import("@/pages/olimpiadas/TorneioExecucao"));

// playtv
const PlayTvManagement = React.lazy(() => import("@/pages/playtv/PlayTvManagement"));
const PlayTvStudent = React.lazy(() => import("@/pages/playtv/PlayTvStudent"));
const PlayTvVideoView = React.lazy(() => import("@/pages/playtv/PlayTvVideoView"));

// plantao
const PlantaoOnline = React.lazy(() => import("@/pages/plantao/PlantaoOnline"));
const PlantaoOnlineStudent = React.lazy(() => import("@/pages/plantao/PlantaoOnlineStudent"));

// cadastros
const Cities = React.lazy(() => import("@/pages/cadastros/Cities"));
const Gestao = React.lazy(() => import("@/pages/cadastros/Gestao"));
const Serie = React.lazy(() => import("@/pages/cadastros/Serie"));
const Disciplina = React.lazy(() => import("@/pages/cadastros/Disciplina"));

// physical-test
const PhysicalTestPage = React.lazy(() => import("@/pages/physical-test/PhysicalTestPage"));

// profile
const Profile = React.lazy(() => import("@/pages/profile/Profile"));
const ConquistasPage = React.lazy(() => import("@/pages/profile/ConquistasPage"));
const Certificates = React.lazy(() => import("@/pages/profile/Certificates"));
const StudentCertificates = React.lazy(() => import("@/pages/profile/StudentCertificates"));

// raiz (misc / sem domínio próprio)
const NotFound = React.lazy(() => import("@/pages/misc/NotFound"));
const SubdominioInvalido = React.lazy(() => import("@/pages/auth/SubdominioInvalido"));
const EmBreve = React.lazy(() => import("@/pages/misc/EmBreve"));
const Settings = React.lazy(() => import("@/pages/profile/Settings"));
const Avisos = React.lazy(() => import("@/pages/dashboard/Avisos"));
const EditQuickLinks = React.lazy(() => import("@/pages/dashboard/EditQuickLinks"));
const ListaFrequencia = React.lazy(() => import("@/pages/dashboard/ListaFrequencia"));
const AtaSalaPage = React.lazy(() => import("@/pages/documents/AtaSalaPage"));
const FolhaRascunhoPage = React.lazy(() => import("@/pages/documents/FolhaRascunhoPage"));
const TermoCompromissoPage = React.lazy(() => import("@/pages/documents/TermoCompromissoPage"));
const EtiquetasPage = React.lazy(() => import("@/pages/documents/EtiquetasPage"));
const StudentAgenda = React.lazy(() => import("@/pages/agenda/StudentAgendaOptimized"));
const AdminAgenda = React.lazy(() => import("@/pages/agenda/AdminAgendaOptimized"));
const IdebCalculatorPage = React.lazy(() => import("@/pages/reports/IdebCalculatorPage"));
const IdebMetaCalculatorPage = React.lazy(() => import("@/pages/reports/IdebMetaCalculatorPage"));

// componentes carregados lazy via App (não são pages)
const SubdomainCheck = React.lazy(() => import("./components/SubdomainCheck"));
const StudentEvaluations = React.lazy(() => import("./components/evaluations/StudentEvaluations"));
const ClassDetails = React.lazy(() => import("./components/schools/ClassDetails"));
const SchoolDetails = React.lazy(() => import("./components/schools/SchoolDetails"));
const TakeEvaluation = React.lazy(() => import("./components/evaluations/TakeEvaluation/index"));
const EvaluationResults = React.lazy(() => import("./components/evaluations/EvaluationResults"));
const DetailedResultsView = React.lazy(() => import("./components/evaluations/results/DetailedResultsView"));
const StudentDetailedResults = React.lazy(() => import("./components/evaluations/student/StudentDetailedResults"));

// Loading component
const LoadingSpinner = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
  </div>
);

const queryClient = new QueryClient();

const App = () => {
  const { user } = useAuth();

  // Função para determinar a rota baseada no papel do usuário
  const getBaseRoute = () => {
    if (!user.id) return '/';
    return user.role === 'aluno' ? '/aluno' : '/app';
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <ToastContainer
          position="bottom-right"
          style={{ zIndex: 2001 }}
          autoClose={5000}
          hideProgressBar={false}
          newestOnTop={false}
          closeOnClick={false}
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
          theme="light"
        />
        <Sonner />

        <StudentPreferencesProvider>
        <PlanProvider>
        <Suspense fallback={<LoadingSpinner />}>
          <Routes>
            {/* Rota raiz - checa subdomínio e redireciona ou mostra login */}
            <Route
              path="/"
              element={
                user.id ? (
                  <Navigate to={getBaseRoute()} />
                ) : (
                  <SubdomainCheck />
                )
              }
            />

            {/* Subdomínio não cadastrado */}
            <Route path="/subdominio-invalido" element={<SubdominioInvalido />} />

            {/* Rotas de autenticação */}
            <Route path="/forgot-password" element={<ForgotPassword key="forgot-password" />} />
            <Route path="/reset-password" element={<ResetPassword key="reset-password" />} />
            <Route path="/change-password" element={<PrivateRoute><AppThemeStyles><ChangePassword /></AppThemeStyles></PrivateRoute>} />

            {/* Rotas do aluno */}
            <Route path="/aluno" element={<Layout />}>
              <Route index element={<PrivateRoute><StudentDashboard /></PrivateRoute>} />
              <Route path="/aluno/avaliacoes" element={<PrivateRoute><StudentEvaluations /></PrivateRoute>} />
              <Route path="/aluno/resultados" element={<PrivateRoute><StudentResultsPage /></PrivateRoute>} />
              <Route path="/aluno/avaliacao/:id/resultado" element={<PrivateRoute><StudentResult /></PrivateRoute>} />
              <Route path="/aluno/agenda" element={<PrivateRoute><StudentAgenda /></PrivateRoute>} />
              <Route path="/aluno/editar-atalhos" element={<PrivateRoute><EditQuickLinks /></PrivateRoute>} />
              <Route path="/aluno/jogos" element={<PrivateRoute><StudentGames /></PrivateRoute>} />
              <Route path="/aluno/jogos/:id" element={<PrivateRoute><GameView /></PrivateRoute>} />
              <Route path="/aluno/play-tv" element={<PrivateRoute><PlayTvStudent /></PrivateRoute>} />
              <Route path="/aluno/play-tv/:id" element={<PrivateRoute><PlayTvVideoView /></PrivateRoute>} />
              <Route path="/aluno/plantao-online" element={<PrivateRoute><PlantaoOnlineStudent /></PrivateRoute>} />
              <Route path="/aluno/certificados" element={<PrivateRoute><StudentCertificates /></PrivateRoute>} />
              <Route path="/aluno/torneio/:torneioId" element={<PrivateRoute><TorneioExecucao /></PrivateRoute>} />
              <Route path="/aluno/olimpiadas" element={<PrivateRoute><OlimpiadasStudent /></PrivateRoute>} />
              <Route path="/aluno/olimpiada/:id/fazer" element={<FullscreenLayout />}>
                <Route index element={<PrivateRoute><OlimpiadaStudent /></PrivateRoute>} />
              </Route>
              <Route path="/aluno/olimpiada/:id/resultado" element={<PrivateRoute><StudentResult /></PrivateRoute>} />
              <Route path="/aluno/questionario" element={<PrivateRoute><QuestionarioList /></PrivateRoute>} />
              <Route path="/aluno/questionario/responder/:formId" element={<PrivateRoute><QuestionarioRespond /></PrivateRoute>} />

              <Route path="/aluno/perfil" element={<PrivateRoute><Profile /></PrivateRoute>} />
              <Route path="/aluno/avisos" element={<PrivateRoute><Avisos /></PrivateRoute>} />
              <Route path="/aluno/configuracoes" element={<PrivateRoute><Settings /></PrivateRoute>} />
              <Route path="/aluno/moedas/historico" element={<PrivateRoute><CoinHistory /></PrivateRoute>} />
              <Route path="/aluno/loja" element={<PrivateRoute><Loja /></PrivateRoute>} />
              <Route path="/aluno/conquistas" element={<PrivateRoute><ConquistasPage /></PrivateRoute>} />
              <Route path="/aluno/competitions" element={<PrivateRoute><CompetitionsStudent /></PrivateRoute>} />
              <Route path="/aluno/competitions/:id" element={<PrivateRoute><CompetitionStudentDetail /></PrivateRoute>} />
              <Route path="/aluno/competitions/:id/fazer" element={<PrivateRoute><CompetitionTest /></PrivateRoute>} />
              <Route path="/aluno/competitions/:id/test" element={<PrivateRoute><CompetitionTest /></PrivateRoute>} />
              <Route path="/aluno/competitions/:id/ranking" element={<PrivateRoute><CompetitionRankingPage /></PrivateRoute>} />
            </Route>

            {/* Rota de avaliação em tela cheia para alunos */}
            <Route path="/aluno/avaliacao/:id/fazer" element={<FullscreenLayout />}>
              <Route index element={<PrivateRoute><TakeEvaluation /></PrivateRoute>} />
            </Route>

            {/* Rotas do app (admin/professor/etc) */}
            <Route path="/app" element={<Layout />}>
              <Route index element={<PrivateRoute><Index /></PrivateRoute>} />
              <Route path="/app/avaliacoes" element={<PrivateRoute><Evaluations /></PrivateRoute>} />
              <Route path="/app/avaliacoes/correcao" element={<PrivateRoute><EvaluationCorrection /></PrivateRoute>} />
              <Route
                path="/app/resultados"
                element={
                  <PrivateRoute>
                    <RelatoriosResultadosHub defaultTab="avaliacao" />
                  </PrivateRoute>
                }
              />
              <Route path="/app/monitoramento" element={<PrivateRoute><MonitoramentoPage /></PrivateRoute>} />
              <Route path="/app/mapa-habilidades" element={<Navigate to="/app/relatorios/mapa-habilidades" replace />} />
              <Route path="/app/evolucao" element={<PrivateRoute><RelatoriosEvolucaoHub /></PrivateRoute>} />
              <Route path="/app/avaliacao/:id/resultados" element={<PrivateRoute><EvaluationResults /></PrivateRoute>} />
              <Route path="/app/avaliacao/:id/resultados-detalhados" element={<PrivateRoute><DetailedResultsView onBack={() => window.history.back()} /></PrivateRoute>} />
              <Route path="/app/avaliacao/:id/aluno/:studentId/resultados" element={<PrivateRoute><StudentDetailedResults onBack={() => window.history.back()} /></PrivateRoute>} />
              <Route path="/app/avaliacao/:id" element={<PrivateRoute><ViewEvaluation /></PrivateRoute>} />
              <Route path="/app/avaliacao/:id/editar" element={<PrivateRoute><EditEvaluation /></PrivateRoute>} />
              <Route path="/app/avaliacao/:id/fisica" element={<PrivateRoute><PhysicalTestPage /></PrivateRoute>} />
              <Route path="/app/provas-fisicas/:id" element={<PrivateRoute><PhysicalTestPage /></PrivateRoute>} />
              <Route path="/app/editar-atalhos" element={<PrivateRoute><EditQuickLinks /></PrivateRoute>} />
              <Route path="/app/criar-avaliacao" element={<PrivateRoute><CreateEvaluation /></PrivateRoute>} />
              <Route path="/app/calculadora-saeb" element={<PrivateRoute><IdebCalculatorPage /></PrivateRoute>} />
              <Route path="/app/calculo-metas" element={<PrivateRoute><IdebMetaCalculatorPage /></PrivateRoute>} />
              <Route path="/app/agenda" element={<PrivateRoute><AdminAgenda /></PrivateRoute>} />
              <Route path="/app/jogos" element={<PrivateRoute><GamesManagement /></PrivateRoute>} />
              <Route path="/app/jogos/adicionar" element={<PrivateRoute><AddGame /></PrivateRoute>} />
              <Route path="/app/jogos/:id" element={<PrivateRoute><GameView /></PrivateRoute>} />
              <Route path="/app/play-tv" element={<PrivateRoute><PlayTvManagement /></PrivateRoute>} />
              <Route path="/app/play-tv/:id" element={<PrivateRoute><PlayTvVideoView /></PrivateRoute>} />
              <Route path="/app/plantao" element={<PrivateRoute><PlantaoOnline /></PrivateRoute>} />
              <Route path="/app/cartao-resposta" element={<PrivateRoute><AnswerSheetGenerator /></PrivateRoute>} />
              <Route path="/app/cartao-resposta/gerar" element={<PrivateRoute><AnswerSheetGenerateCards /></PrivateRoute>} />
              <Route path="/app/cartao-resposta/cadastrar" element={<PrivateRoute><AnswerSheetCreateGabarito /></PrivateRoute>} />
              <Route path="/app/cartao-resposta/corrigir" element={<PrivateRoute><AnswerSheetCorrection /></PrivateRoute>} />
              <Route
                path="/app/cartao-resposta/resultados/gabarito/:gabaritoId/aluno/:studentId"
                element={
                  <PrivateRoute>
                    <AnswerSheetStudentDetailedResults onBack={() => window.history.back()} />
                  </PrivateRoute>
                }
              />
              <Route
                path="/app/cartao-resposta/resultados"
                element={
                  <PrivateRoute>
                    <RelatoriosResultadosHub defaultTab="cartao" />
                  </PrivateRoute>
                }
              />
              <Route path="/app/lista-frequencia" element={<PrivateRoute><ListaFrequencia /></PrivateRoute>} />
              <Route path="/app/documentos/ata-sala/:id" element={<PrivateRoute><AtaSalaPage /></PrivateRoute>} />
              <Route path="/app/documentos/ata-sala" element={<PrivateRoute><AtaSalaPage /></PrivateRoute>} />
              <Route path="/app/documentos/folha-rascunho" element={<PrivateRoute><FolhaRascunhoPage /></PrivateRoute>} />
              <Route path="/app/documentos/termo-compromisso" element={<PrivateRoute><TermoCompromissoPage /></PrivateRoute>} />
              <Route path="/app/documentos/etiquetas" element={<PrivateRoute><EtiquetasPage /></PrivateRoute>} />
              <Route path="/app/certificados" element={<PrivateRoute><Certificates /></PrivateRoute>} />
              <Route path="/app/torneio/:torneioId" element={<PrivateRoute><TorneioExecucao /></PrivateRoute>} />
              <Route path="/app/olimpiadas" element={<PrivateRoute><Olimpiadas /></PrivateRoute>} />
              <Route
                path="/app/competitions"
                element={
                  <PrivateRoute>
                    <RoleRoute allowed={["admin", "professor", "coordenador", "diretor", "tecadm"]}>
                      <CompetitionList />
                    </RoleRoute>
                  </PrivateRoute>
                }
              />
              <Route
                path="/app/competitions/:id"
                element={
                  <PrivateRoute>
                    <RoleRoute allowed={["admin", "professor", "coordenador", "diretor", "tecadm"]}>
                      <CompetitionDetails />
                    </RoleRoute>
                  </PrivateRoute>
                }
              />
              <Route
                path="/app/competitions/:id/analytics"
                element={
                  <PrivateRoute>
                    <RoleRoute allowed={["admin", "professor", "coordenador", "diretor", "tecadm"]}>
                      <CompetitionAnalytics />
                    </RoleRoute>
                  </PrivateRoute>
                }
              />
              <Route
                path="/app/competition-templates"
                element={
                  <PrivateRoute>
                    <RoleRoute allowed={["admin", "coordenador", "diretor", "tecadm"]}>
                      <CompetitionTemplatesList />
                    </RoleRoute>
                  </PrivateRoute>
                }
              />
              <Route
                path="/app/competition-templates/:id"
                element={
                  <PrivateRoute>
                    <RoleRoute allowed={["admin", "coordenador", "diretor", "tecadm"]}>
                      <CompetitionTemplateDetails />
                    </RoleRoute>
                  </PrivateRoute>
                }
              />
              <Route path="/app/olimpiada/:id" element={<PrivateRoute><ViewEvaluation /></PrivateRoute>} />
              <Route path="/app/olimpiada-resultado/:testId/:studentId" element={<PrivateRoute><StudentResult /></PrivateRoute>} />
              <Route path="/app/city" element={<PrivateRoute><RoleRoute allowed={["admin", "tecadm"]}><Cities /></RoleRoute></PrivateRoute>} />
              <Route path="/app/turma/:id" element={<PrivateRoute><ClassDetails /></PrivateRoute>} />
              <Route path="/app/escola/:id" element={<PrivateRoute><SchoolDetails /></PrivateRoute>} />
              <Route path="/app/usuarios" element={<Navigate to="/app/cadastros/gestao?tab=usuarios" replace />} />
              <Route path="/app/cadastros/usuarios" element={<Navigate to="/app/cadastros/gestao?tab=usuarios" replace />} />
              <Route path="/app/perfil" element={<PrivateRoute><Profile /></PrivateRoute>} />
              <Route path="/app/avisos" element={<PrivateRoute><Avisos /></PrivateRoute>} />
              <Route path="/app/configuracoes" element={<PrivateRoute><Settings /></PrivateRoute>} />
              <Route path="/app/moedas" element={<PrivateRoute><RoleRoute allowed={['admin', 'coordenador', 'diretor', 'tecadm', 'professor']}><CoinsAdmin /></RoleRoute></PrivateRoute>} />
              <Route
                path="/app/modo-offline"
                element={
                  <PrivateRoute>
                    <RoleRoute allowed={['admin', 'tecadm', 'diretor', 'coordenador', 'aplicador']}>
                      <OfflinePackPage />
                    </RoleRoute>
                  </PrivateRoute>
                }
              />
              <Route
                path="/app/modo-offline/:offline_pack_id/editar"
                element={
                  <PrivateRoute>
                    <RoleRoute allowed={['admin', 'tecadm', 'diretor', 'coordenador', 'aplicador']}>
                      <OfflinePackEditPage />
                    </RoleRoute>
                  </PrivateRoute>
                }
              />
              <Route path="/app/loja/gerenciar" element={<PrivateRoute><RoleRoute allowed={['admin', 'coordenador', 'diretor', 'tecadm', 'professor']}><StoreAdmin /></RoleRoute></PrivateRoute>} />
              <Route path="/app/loja/gerenciar/novo" element={<PrivateRoute><RoleRoute allowed={['admin', 'coordenador', 'diretor', 'tecadm', 'professor']}><StoreAdminForm /></RoleRoute></PrivateRoute>} />
              <Route path="/app/loja/gerenciar/lote" element={<PrivateRoute><RoleRoute allowed={['admin', 'coordenador', 'diretor', 'tecadm', 'professor']}><StoreAdminBatchForm /></RoleRoute></PrivateRoute>} />
              <Route path="/app/loja/gerenciar/:id/editar" element={<PrivateRoute><RoleRoute allowed={['admin', 'coordenador', 'diretor', 'tecadm', 'professor']}><StoreAdminForm /></RoleRoute></PrivateRoute>} />

              {/* Rotas de gerenciamento de questões */}
              <Route path="/app/cadastros/questao" element={<PrivateRoute><QuestionsPage /></PrivateRoute>} />
              <Route path="/app/cadastros/questao/criar" element={<PrivateRoute><CreateQuestionPage /></PrivateRoute>} />
              <Route path="/app/cadastros/questao/editar/:id" element={<PrivateRoute><EditQuestionPage /></PrivateRoute>} />
              <Route path="/app/cadastros/habilidades" element={<PrivateRoute><HabilidadesPage /></PrivateRoute>} />

              <Route path="/app/cadastros/turma" element={<Navigate to="/app/cadastros/gestao?tab=turmas" replace />} />
              {/* Rotas de gestão escolar (turmas, usuários e instituições) */}
              <Route path="/app/cadastros/gestao" element={<PrivateRoute><Gestao /></PrivateRoute>} />
              <Route path="/app/cadastros/curso" element={<Navigate to="/app/cadastros/gestao" replace />} />
              <Route path="/app/cadastros/serie" element={<PrivateRoute><Serie /></PrivateRoute>} />
              <Route path="/app/cadastros/disciplina" element={<PrivateRoute><Disciplina /></PrivateRoute>} />

              {/* Rotas de Questionários */}
              <Route path="/app/questionarios/cadastro" element={<PrivateRoute><FormRegistration /></PrivateRoute>} />
              <Route path="/app/questionarios/criar/:formType" element={<PrivateRoute><FormCreate /></PrivateRoute>} />
              <Route path="/app/questionarios/:id" element={<PrivateRoute><FormView /></PrivateRoute>} />
              <Route path="/app/questionarios/relatorios-socio-economicos" element={<PrivateRoute><FormReports /></PrivateRoute>} />
              <Route path="/app/questionarios/resultados-socioeconomicos" element={<PrivateRoute><FormRespostasReport /></PrivateRoute>} />
              <Route path="/app/questionarios/inse-saeb" element={<PrivateRoute><InseSaebReport /></PrivateRoute>} />
              <Route path="/app/questionarios/pneerq" element={<PrivateRoute><PneerqReport /></PrivateRoute>} />
              <Route path="/app/questionario" element={<PrivateRoute><QuestionarioList /></PrivateRoute>} />
              <Route path="/app/questionario/responder/:formId" element={<PrivateRoute><QuestionarioRespond /></PrivateRoute>} />

              {/* Rotas de Relatórios */}
              <Route path="/app/relatorios/analise-avaliacoes" element={<PrivateRoute><AnaliseAvaliacoes /></PrivateRoute>} />
              <Route path="/app/relatorios/acerto-niveis" element={<PrivateRoute><RelatoriosAcertoNiveisHub /></PrivateRoute>} />
              <Route
                path="/app/relatorios/acerto-niveis-cartao"
                element={
                  <PrivateRoute>
                    <Navigate to="/app/relatorios/acerto-niveis?aba=cartao" replace />
                  </PrivateRoute>
                }
              />
              <Route path="/app/relatorios/mapa-habilidades" element={<PrivateRoute><SkillsHeatMapPage /></PrivateRoute>} />
              <Route path="/app/relatorios/relatorio-apresentacao-19-slides" element={<PrivateRoute><RelatorioApresentacao19Slides /></PrivateRoute>} />
              <Route
                path="/app/relatorios/acerto-niveis-cartao-resposta"
                element={
                  <PrivateRoute>
                    <Navigate to="/app/relatorios/acerto-niveis?aba=cartao" replace />
                  </PrivateRoute>
                }
              />
              <Route path="/app/relatorios/relatorio-escolar" element={<PrivateRoute><RelatoriosRelatorioEscolarHub /></PrivateRoute>} />
              <Route
                path="/app/relatorios/relatorio-escolar-cartao-resposta"
                element={
                  <PrivateRoute>
                    <Navigate to="/app/relatorios/relatorio-escolar?aba=cartao" replace />
                  </PrivateRoute>
                }
              />
              <Route path="/app/relatorios/ranking" element={<PrivateRoute><RankingHub /></PrivateRoute>} />
              <Route
                path="/app/ranking"
                element={
                  <PrivateRoute>
                    <Navigate to="/app/relatorios/ranking" replace />
                  </PrivateRoute>
                }
              />
              <Route
                path="/app/relatorios/resultados"
                element={
                  <PrivateRoute>
                    <Navigate to="/app/resultados" replace />
                  </PrivateRoute>
                }
              />
            </Route>

            {/* Rota de avaliação em tela cheia para admin/professor */}
            <Route path="/app/avaliacao/:id/fazer" element={<FullscreenLayout />}>
              <Route index element={<PrivateRoute><TakeEvaluation /></PrivateRoute>} />
            </Route>

            {/* Rota 404 para outras rotas não encontradas */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
        </PlanProvider>
        </StudentPreferencesProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;