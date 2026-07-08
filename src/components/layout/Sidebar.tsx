import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  CalendarDays,
  Gamepad,
  Tv,
  Headset,
  Ticket,
  Award,
  Trophy,
  School,
  User,
  Bell,
  Settings,
  LogOut,
  Edit,
  LandPlot,
  ChevronDown,
  BookOpen,
  Building,
  Users2,
  HelpCircle,
  X,
  BarChart3,
  Calculator,
  Menu,
  ChevronLeft,
  FileText,
  FilePlus,
  Target,
  TrendingUp,
  Layers,
  Library,
  FolderTree,
  FileCheck,
  Presentation,
  PieChart,
  FileBarChart,
  ClipboardList,
  NotebookPen,
  MapPin,
  ScanLine,
  Sparkles,
  Medal,
  Star,
  Coins,
  ShoppingBag,
  Smartphone,
  Thermometer,
  Scale,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/context/authContext";
import {
  hasRestrictedStaffAccess,
  isAplicadorRole,
} from "@/utils/restrictedStaffAccess";
import { useStudentPreferences } from "@/context/StudentPreferencesContext";
import { Button } from "@/components/ui/button";
import { useGamesCount } from "@/hooks/useGamesCount";
import { useOpenCompetitionsCount } from "@/hooks/useOpenCompetitionsCount";
import { DashboardApiService } from "@/services/dashboardApi";
import { AVISOS_UPDATE_EVENT } from "@/hooks/useUnreadAvisos";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getRoleDisplayName } from "@/lib/constants";
import { AvatarPreview } from "@/components/profile/AvatarPreview";
import { CoinBalance } from "@/components/coins/CoinBalance";
import { NotificationBell } from "@/components/Notifications/NotificationBell";
import { StudentBandBadge } from "@/components/competitions/StudentBandBadge";
import {
  getSidebarThemeStyles,
  getNonStudentSidebarThemeFromStorage,
  SIDEBAR_THEME_CHANGE_EVENT,
} from "@/constants/sidebarThemes";
import type { SidebarThemeId } from "@/constants/sidebarThemes";
import { filterNavLinks } from "@/utils/navVisibility";

type SidebarLink = {
  icon: React.ElementType;
  label: string;
  href?: string;
  role: string[];
  children?: SidebarLink[];
  badge?: string;
  divider?: boolean;
  feature?: string;
  category?: string;
};

type SidebarCategory = {
  name: string;
  role: string[];
  links: SidebarLink[];
};

const isLinkActive = (link: SidebarLink, currentPath: string): boolean => {
  if (link.href) return currentPath === link.href;
  if (link.children) return link.children.some(child => isLinkActive(child, currentPath));
  return false;
};

interface SidebarProps {
  onMobileMenuClose?: () => void;
  isMobileOpen?: boolean;
}

export default function Sidebar({ onMobileMenuClose, isMobileOpen = false }: SidebarProps = {}) {
  const currentPath = useLocation().pathname;
  const isMobile = useIsMobile();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [avisosQuantidade, setAvisosQuantidade] = useState(0);
  const [isDarkMode, setIsDarkMode] = useState(false);

  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const isRestrictedNav = hasRestrictedStaffAccess(user);
  // Filtro ao renderizar sidebar completa (corretor legado por e-mail).
  const corretorAllowedHrefs = new Set([
    '/app',
    '/app/avaliacoes',
    '/app/resultados',
    '/logout',
    '/app/agenda',
    '/app/configuracoes',
    '/app/cartao-resposta/cadastrar',
    '/app/cartao-resposta/gerar',
    '/app/cartao-resposta/corrigir',
  ]);
  const studentPrefs = useStudentPreferences();
  const [nonStudentThemeId, setNonStudentThemeId] = useState<SidebarThemeId>(() =>
    user?.role !== 'aluno' ? getNonStudentSidebarThemeFromStorage() : null
  );
  const sidebarThemeId = (user?.role === 'aluno'
    ? (studentPrefs?.preferences?.sidebar_theme_id ?? null)
    : nonStudentThemeId) as SidebarThemeId;

  useEffect(() => {
    if (user?.role !== 'aluno') {
      setNonStudentThemeId(getNonStudentSidebarThemeFromStorage());
      const onThemeChange = () => setNonStudentThemeId(getNonStudentSidebarThemeFromStorage());
      window.addEventListener(SIDEBAR_THEME_CHANGE_EVENT, onThemeChange);
      return () => window.removeEventListener(SIDEBAR_THEME_CHANGE_EVENT, onThemeChange);
    }
  }, [user?.role]);

  const themeStyles = getSidebarThemeStyles(sidebarThemeId, isDarkMode);
  useGamesCount();
  const openCompetitionsCount = useOpenCompetitionsCount();

  useEffect(() => {
    const loadAvisosQuantidade = async () => {
      try {
        const quantidade = await DashboardApiService.getAvisosQuantidade();
        setAvisosQuantidade(quantidade);
      } catch (error) {
        console.error('Erro ao carregar quantidade de avisos:', error);
      }
    };

    if (user.id) loadAvisosQuantidade();

    const onAvisosSync = () => {
      if (user.id) loadAvisosQuantidade();
    };
    window.addEventListener(AVISOS_UPDATE_EVENT, onAvisosSync);
    return () => window.removeEventListener(AVISOS_UPDATE_EVENT, onAvisosSync);
  }, [user.id, user.role]);

  useEffect(() => {
    const checkDarkMode = () => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    };
    
    checkDarkMode();
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });
    
    return () => observer.disconnect();
  }, []);


  function handleLogout() {
    logout().then(() => navigate("/"));
  }

  const handleLinkClick = () => {
    if (isMobile && onMobileMenuClose) onMobileMenuClose();
  };

  const handleToggleCollapse = () => setIsCollapsed(!isCollapsed);

  const sidebarCategories: SidebarCategory[] = [
    {
      name: "Principal",
      role: ["admin", "professor", "diretor", "coordenador", "aluno", "tecadm"],
      links: [
        {
          icon: LayoutDashboard,
          label: "Painel",
          href: `${user.role === 'aluno' ? "/aluno" : "/app"}`,
          role: ["admin", "professor", "diretor", "coordenador", "aluno", "tecadm"]
        },
        {
          icon: CalendarDays,
          label: "Agenda",
          href: `${user.role === 'aluno' ? "/aluno/agenda" : "/app/agenda"}`,
          role: ["admin", "professor", "diretor", "coordenador", "aluno", "tecadm"]
        },
        {
          icon: ClipboardList,
          label: "Avaliações",
          href: `${user.role === 'aluno' ? "/aluno/avaliacoes" : "/app/avaliacoes"}`,
          role: ["aluno"]
        },
        {
          icon: BarChart3,
          label: "Resultados",
          href: "/aluno/resultados",
          role: ["aluno"]
        },
        {
          icon: NotebookPen,
          label: "Questionário",
          href: `${user.role === 'aluno' ? "/aluno/questionario" : "/app/questionario"}`,
          role: ["professor", "diretor", "aluno"]
        },
      ]
    },
    {
      name: "Plataforma",
      role: ["admin", "professor", "diretor", "coordenador", "aluno", "tecadm"],
      links: [
        {
          icon: Gamepad,
          label: "Jogos",
          href: `${user.role === 'aluno' ? "/aluno/jogos" : "/app/jogos"}`,
          role: ["admin", "professor", "diretor", "coordenador", "aluno", "tecadm"]
        },
        {
          icon: Tv,
          label: "Play TV",
          href: `${user.role === 'aluno' ? "/aluno/play-tv" : "/app/play-tv"}`,
          role: ["admin", "professor", "diretor", "coordenador", "aluno", "tecadm"]
        },
        {
          icon: Headset,
          label: "Plantão Online",
          href: `${user.role === 'aluno' ? "/aluno/plantao-online" : "/app/plantao"}`,
          role: ["admin", "professor", "diretor", "coordenador", "aluno", "tecadm"]
        },
      ]
    },
    {
      name: "Modo offline",
      role: ["admin", "tecadm", "diretor", "coordenador", "aplicador"],
      links: [
        {
          icon: Smartphone,
          label: "Aplicativo Offline",
          href: "/app/modo-offline",
          role: ["admin", "tecadm", "diretor", "coordenador", "aplicador"],
        },
      ],
    },
    {
      name: "Gestão",
      role: ["admin", "professor", "diretor", "coordenador", "tecadm"],
      links: [
        {
          icon: Building,
          label: "Gestão Escolar",
          href: "/app/cadastros/gestao",
          role: ["professor", "diretor", "coordenador"]
        },
        {
          icon: FileCheck,
          label: "Avaliações",
          href: "/app/avaliacoes",
          role: ["professor", "diretor", "coordenador"]
        },
        {
          icon: HelpCircle,
          label: "Questão",
          href: "/app/cadastros/questao",
          role: ["professor", "diretor", "coordenador"]
        },
        {
          icon: Building,
          label: "Gestão Escolar",
          href: "/app/cadastros/gestao",
          role: ["admin", "tecadm"]
        },
        {
          icon: FolderTree,
          label: "Cadastros",
          role: ["admin", "tecadm"],
          children: [
            { icon: FileCheck, label: "Avaliações", href: "/app/avaliacoes", role: ["admin", "tecadm"] },
            { icon: MapPin, label: "Municípios", href: "/app/city", role: ["admin", "tecadm"] },
            { icon: HelpCircle, label: "Questão", href: "/app/cadastros/questao", role: ["admin", "tecadm"] },
          ]
        },
        {
          icon: Ticket,
          label: "Cartão Resposta",
          role: ["admin", "professor", "diretor", "coordenador", "tecadm"],
          children: [
            { icon: FilePlus, label: "Cadastrar Cartão Resposta", href: "/app/cartao-resposta/cadastrar", role: ["admin", "professor", "diretor", "coordenador", "tecadm"] },
            { icon: Ticket, label: "Gerar cartões", href: "/app/cartao-resposta/gerar", role: ["admin", "professor", "diretor", "coordenador", "tecadm"] },
            { icon: ScanLine, label: "Corrigir cartões", href: "/app/cartao-resposta/corrigir", role: ["admin", "professor", "diretor", "coordenador", "tecadm"] },
          ]
        },
        {
          icon: FileText,
          label: "Documentos",
          role: ["admin", "professor", "diretor", "coordenador", "tecadm"],
          children: [
            { icon: ClipboardList, label: "Lista de Frequência", href: "/app/lista-frequencia", role: ["admin", "professor", "diretor", "coordenador", "tecadm"] },
            { icon: FileText, label: "Impressão de Ata de Sala", href: "/app/documentos/ata-sala", role: ["admin", "professor", "diretor", "coordenador", "tecadm"] },
            { icon: FileText, label: "Folha de rascunho", href: "/app/documentos/folha-rascunho", role: ["admin", "professor", "diretor", "coordenador", "tecadm"] },
            { icon: FileText, label: "Termo de compromisso", href: "/app/documentos/termo-compromisso", role: ["admin", "professor", "diretor", "coordenador", "tecadm"] },
            { icon: FileText, label: "Etiquetas", href: "/app/documentos/etiquetas", role: ["admin", "professor", "diretor", "coordenador", "tecadm"] },
          ]
        },
        {
          icon: Target,
          label: "Projeção de Metas",
          role: ["admin", "professor", "diretor", "coordenador", "tecadm"],
          children: [
            { icon: Calculator, label: "Calculadora SAEB", href: "/app/calculadora-saeb", role: ["admin", "professor", "diretor", "coordenador", "tecadm"] },
            { icon: Target, label: "Cálculo de Metas", href: "/app/calculo-metas", role: ["admin", "professor", "diretor", "coordenador", "tecadm"] },
          ]
        },
        { icon: TrendingUp, label: "Evolução", href: "/app/evolucao", role: ["admin", "professor", "diretor", "coordenador", "tecadm"] },
        { icon: BarChart3, label: "Resultados", href: "/app/resultados", role: ["admin", "professor", "diretor", "coordenador", "tecadm"] },
        { icon: Activity, label: "Monitoramento", href: "/app/monitoramento", role: ["admin", "professor", "diretor", "coordenador", "tecadm"] },
        {
          icon: NotebookPen,
          label: "Questionários",
          role: ["admin", "tecadm"],
          children: [
            { icon: FileText, label: "Cadastro de questionários", href: "/app/questionarios/cadastro", role: ["admin", "tecadm"] },
            { icon: Presentation, label: "Relatórios Socio-Econômicos", href: "/app/questionarios/relatorios-socio-economicos", role: ["admin", "tecadm"] },
            { icon: BarChart3, label: "Resultados Socioeconomicos", href: "/app/questionarios/resultados-socioeconomicos", role: ["admin", "tecadm"] },
            { icon: BarChart3, label: "INSE x Avaliação", href: "/app/questionarios/inse-avaliacao", role: ["admin", "tecadm"] },
            { icon: Scale, label: "PNEERQ", href: "/app/questionarios/pneerq", role: ["admin", "tecadm"] },
          ]
        },
        {
          icon: FileBarChart,
          label: "Relatórios",
          role: ["admin", "professor", "diretor", "coordenador", "tecadm"],
          children: [
            { icon: Target, label: "Acerto e Níveis", href: "/app/relatorios/acerto-niveis", role: ["admin", "professor", "diretor", "coordenador", "tecadm"] },
            { icon: Thermometer, label: "Mapa de habilidades", href: "/app/relatorios/mapa-habilidades", role: ["admin", "professor", "diretor", "coordenador", "tecadm"] },
            { icon: PieChart, label: "Análise das Avaliações", href: "/app/relatorios/analise-avaliacoes", role: ["admin", "professor", "diretor", "coordenador", "tecadm"] },
            { icon: School, label: "Relatório Escolar", href: "/app/relatorios/relatorio-escolar", role: ["admin", "professor", "diretor", "coordenador", "tecadm"] },
            { icon: Presentation, label: "Relatório Apresentação", href: "/app/relatorios/relatorio-apresentacao-19-slides", role: ["admin", "professor", "diretor", "coordenador", "tecadm"] },
            { icon: Medal, label: "Relatório de ranking", href: "/app/relatorios/ranking", role: ["admin", "professor", "diretor", "coordenador", "tecadm"] },
            { icon: Layers, label: "Relatório Geral", href: "/app/relatorios/relatorio-geral", role: ["admin", "professor", "diretor", "coordenador", "tecadm"] },
          ]
        },
      ]
    },
    {
      name: "Atividades",
      role: ["admin", "professor", "diretor", "coordenador", "aluno", "tecadm"],
      links: [
        { icon: Award, label: "Certificados", href: `${user.role === 'aluno' ? "/aluno/certificados" : "/app/certificados"}`, role: ["admin", "professor", "diretor", "coordenador", "aluno", "tecadm"] },
        { icon: Sparkles, label: "Olimpíadas", href: `${user.role === 'aluno' ? "/aluno/olimpiadas" : "/app/olimpiadas"}`, role: ["admin", "professor", "diretor", "coordenador", "aluno", "tecadm"] },
      ]
    },
    {
      name: "Recomposição",
      role: ["admin", "professor", "diretor", "coordenador", "aluno", "tecadm"],
      links: [
        { icon: Trophy, label: "Competições", href: `${user.role === 'aluno' ? "/aluno/competitions" : "/app/competitions"}`, role: ["admin", "professor", "coordenador", "diretor", "tecadm", "aluno"], badge: user.role === 'aluno' && openCompetitionsCount > 0 ? String(openCompetitionsCount) : undefined },
        { icon: Coins, label: "Histórico de Moedas", href: "/aluno/moedas/historico", role: ["aluno"] },
        { icon: Coins, label: "Administração de moedas", href: "/app/moedas", role: ["admin", "professor", "diretor", "coordenador", "tecadm"] },
        { icon: ShoppingBag, label: "Loja", href: "/aluno/loja", role: ["aluno"] },
        { icon: ShoppingBag, label: "Itens da loja", href: "/app/loja/gerenciar", role: ["admin", "professor", "diretor", "coordenador", "tecadm"] },
      ]
    },
    {
      name: "Configurações",
      role: ["admin", "professor", "diretor", "coordenador", "aluno", "tecadm"],
      links: [
        {
          icon: Bell,
          label: "Avisos",
          href: `${user.role === 'aluno' ? "/aluno/avisos" : "/app/avisos"}`,
          role: ["admin", "professor", "diretor", "coordenador", "aluno", "tecadm"],
          badge: avisosQuantidade > 0 ? avisosQuantidade.toString() : undefined
        },
        { icon: Settings, label: "Configurações", href: `${user.role === 'aluno' ? "/aluno/configuracoes" : "/app/configuracoes"}`, role: ["admin", "professor", "diretor", "coordenador", "aluno", "tecadm"] },
        { icon: LogOut, label: "Sair", href: "/logout", role: ["admin", "professor", "diretor", "coordenador", "aluno", "tecadm"], divider: true },
      ]
    }
  ];

  // Corretor (e-mail) e aplicador (role): sidebar simplificada; aplicador inclui modo offline.
  const restrictedNavRole = isAplicadorRole(user.role) ? 'aplicador' : (user.role ?? 'tecadm');
  const restrictedSidebarLinks: SidebarCategory['links'] = [
    {
      icon: LayoutDashboard,
      label: "Painel",
      href: "/app",
      role: [restrictedNavRole],
    },
    {
      icon: CalendarDays,
      label: "Agenda",
      href: "/app/agenda",
      role: [restrictedNavRole],
    },
    {
      icon: ClipboardList,
      label: "Avaliações",
      href: "/app/avaliacoes",
      role: [restrictedNavRole],
    },
    {
      icon: FilePlus,
      label: "Cadastrar Cartão Resposta",
      href: "/app/cartao-resposta/cadastrar",
      role: [restrictedNavRole],
    },
    {
      icon: Ticket,
      label: "Gerar cartões",
      href: "/app/cartao-resposta/gerar",
      role: [restrictedNavRole],
    },
    {
      icon: ScanLine,
      label: "Corrigir cartões",
      href: "/app/cartao-resposta/corrigir",
      role: [restrictedNavRole],
    },
    ...(isAplicadorRole(user.role)
      ? [
          {
            icon: Smartphone,
            label: "Aplicativo Offline",
            href: "/app/modo-offline",
            role: [restrictedNavRole],
          },
        ]
      : []),
    {
      icon: Settings,
      label: "Configurações",
      href: "/app/configuracoes",
      role: [restrictedNavRole],
    },
    {
      icon: LogOut,
      label: "Sair",
      href: "/logout",
      role: [restrictedNavRole],
      divider: true,
    },
  ];
  const restrictedSidebarCategories: SidebarCategory[] = [
    {
      name: "Principal",
      role: [restrictedNavRole],
      links: restrictedSidebarLinks,
    },
  ];

  const sidebarCategoriesToRender = isRestrictedNav
    ? restrictedSidebarCategories
    : sidebarCategories;

  const UserInfo = () => {
    const handleProfileClick = () => {
      navigate(user.role === 'aluno' ? "/aluno/perfil" : "/app/perfil");
      handleLinkClick();
    };

    return (
      <div className="px-2 pt-1 pb-0.5 md:px-3 lg:px-3">
        <div
          className="rounded-xl border shadow-sm transition-all duration-300 ease-out hover:scale-[1.03] hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-0"
          style={{ backgroundColor: 'var(--sidebar-user-card-bg)', borderColor: 'var(--sidebar-user-card-border)', color: 'var(--sidebar-text)' }}
        >
          <div className="px-2 py-1.5 md:px-3 md:py-2 lg:px-3 lg:py-1.5 flex items-center gap-2 md:gap-3">
            {user?.avatar_config ? (
              <div className="flex-shrink-0">
                <AvatarPreview 
                  config={user.avatar_config} 
                  size={isMobile ? 36 : 40} 
                  className="flex-shrink-0" 
                />
              </div>
            ) : (
              <div
                className={cn("rounded-full flex items-center justify-center font-semibold flex-shrink-0", isMobile ? "w-9 h-9" : "w-10 h-10")}
                style={{ backgroundColor: 'var(--sidebar-icon-bg-hover)', color: 'var(--sidebar-text)' }}
              >
                {user?.name ? user.name.charAt(0).toUpperCase() : "U"}
              </div>
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-xs md:text-sm truncate flex items-center gap-1" style={{ color: 'var(--sidebar-text)' }}>
                  <span className="truncate">{user?.name || "Usuário"}</span>
                  {user?.role === 'aluno' && user?.competition_band && (
                    <StudentBandBadge band={user.competition_band} />
                  )}
                </p>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={handleProfileClick}
                        className="flex-shrink-0 p-1 rounded-full transition-transform duration-300 ease-out hover:bg-[var(--sidebar-button-hover-bg)] hover:scale-125 active:scale-90 text-[var(--sidebar-icon-color)] hover:text-[var(--sidebar-icon-color-active)]"
                        aria-label="Editar perfil"
                      >
                        <Edit className="h-3.5 w-3.5 md:h-4 md:w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <p>Editar perfil</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              <div className="mt-0.5 md:mt-1">
                <p className="text-[10px] md:text-xs truncate" style={{ color: 'var(--sidebar-text-muted)' }}>
                  {user?.role ? getRoleDisplayName(user.role) : "Usuário"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  function RenderMenuItem({
    link,
    currentPath,
    isCollapsed,
    handleLogout,
    userRole,
    level = 0
  }: {
    link: SidebarLink;
    currentPath: string;
    isCollapsed: boolean;
    handleLogout: () => void;
    userRole: string;
    level?: number;
  }) {
    const hasSubmenu = link.children && link.children.length > 0;
    const isActive = isLinkActive(link, currentPath);
    const [isSubmenuOpen, setIsSubmenuOpen] = useState(isActive);

    useEffect(() => {
      if (isActive) setIsSubmenuOpen(true);
    }, [isActive]);

    const handleToggleSubmenu = () => {
      if (hasSubmenu) setIsSubmenuOpen(!isSubmenuOpen);
    };

    if (!link.role.includes(userRole)) return null;

    const linkContent = (
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
          <div
            className={cn(
              "flex items-center justify-center rounded-full transition-all duration-300 ease-out bg-[var(--sidebar-icon-bg)] group-hover:bg-[var(--sidebar-icon-bg-hover)] group-hover:scale-125",
              isCollapsed ? "h-10 w-10" : "h-8 w-8 md:h-9 md:w-9 lg:h-9 lg:w-9"
            )}
          >
            <link.icon
              size={isCollapsed ? 18 : 16}
              className={cn(
                "flex-shrink-0 transition-all duration-300 ease-out md:w-[18px] md:h-[18px] lg:w-[18px] lg:h-[18px]",
                isActive ? "text-[var(--sidebar-icon-color-active)]" : "text-[var(--sidebar-icon-color)] group-hover:text-[var(--sidebar-icon-color-active)]"
              )}
            />
          </div>

          {!isCollapsed && (
            <span
              className={cn(
                "line-clamp-2 whitespace-normal break-words text-xs md:text-sm font-medium transition-all duration-300 ease-out",
                isActive ? "text-[var(--sidebar-link-active-text)]" : "text-[var(--sidebar-text)] group-hover:text-[var(--sidebar-link-active-text)]"
              )}
            >
              {link.label}
            </span>
          )}
        </div>

        {!isCollapsed && (
          <div className="flex items-center gap-1.5 md:gap-2">
            {link.badge && (
              <span className={cn(
                "text-white text-[9px] md:text-[10px] font-bold px-1 md:px-1.5 py-0.5 rounded-full min-w-[18px] md:min-w-[20px] text-center",
                link.href === '/aluno/competitions' ? 'bg-red-500' : 'bg-pink-500'
              )}>
                {link.badge}
              </span>
            )}
            {hasSubmenu && (
              <ChevronDown
                size={isMobile ? 12 : 14}
                className={cn(
                  "transition-transform duration-300 ease-out text-[var(--sidebar-icon-color)] group-hover:text-[var(--sidebar-icon-color-active)]",
                  isSubmenuOpen && "rotate-180"
                )}
              />
            )}
          </div>
        )}

        {isCollapsed && link.badge && (
          <span className={cn(
            "absolute -top-1 -right-1 text-white text-[9px] md:text-[10px] font-bold w-4 h-4 md:w-5 md:h-5 rounded-full flex items-center justify-center",
            link.href === '/aluno/competitions' ? 'bg-red-500' : 'bg-pink-500'
          )}>
            {link.badge}
          </span>
        )}
      </div>
    );

    const itemClasses = cn(
      "sidebar-link w-full text-left group relative",
      "flex items-center gap-2 md:gap-3 transition-all duration-300 ease-out",
      "hover:translate-x-2 active:translate-x-1 active:scale-[0.98]",
      isCollapsed 
        ? "justify-center px-0 py-1" 
        : "px-2 py-2 md:px-3 md:py-2.5 lg:px-3 lg:py-2.5 rounded-full text-xs md:text-sm",

      "hover:!bg-[var(--sidebar-link-hover-bg)]",
      isActive && !isCollapsed && "!bg-[var(--sidebar-link-active-bg)] font-semibold shadow-sm",
      isActive && isCollapsed && "bg-[var(--sidebar-link-hover-bg)]",

      level > 0 && !isCollapsed && "ml-3 md:ml-4 text-xs md:text-sm",
      level > 1 && !isCollapsed && "ml-6 md:ml-8 text-[10px] md:text-xs",

      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sidebar-focus-ring)]"
    );

    const liStyle: React.CSSProperties = link.divider ? { borderColor: 'var(--sidebar-border)' } : undefined;

    return (
      <li
        className={cn(link.divider && "border-t pt-2 mt-2")}
        style={liStyle}
      >
        {link.label === "Sair" ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={handleLogout} className={itemClasses}>
                  {linkContent}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>{link.label}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : link.children && link.children.length > 0 ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={handleToggleSubmenu} className={itemClasses}>
                  {linkContent}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>{link.label}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link to={link.href || "#"} className={itemClasses} onClick={handleLinkClick}>
                  {linkContent}
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>{link.label}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {link.children && isSubmenuOpen && !isCollapsed && (
          <ul className="space-y-1 ml-1.5 md:ml-2 mt-1 border-l pl-2 md:pl-3" style={{ borderColor: 'var(--sidebar-border)' }}>
            {link.children.map((child, index) => (
              <RenderMenuItem
                key={`${child.label}-${child.href || child.role.join('-')}-${index}`}
                link={child}
                currentPath={currentPath}
                isCollapsed={isCollapsed}
                handleLogout={handleLogout}
                userRole={userRole}
                level={level + 1}
              />
            ))}
          </ul>
        )}
      </li>
    );
  }

  const CategorySeparator = ({ name }: { name: string }) => (
    <div className={cn("px-2 pt-1.5 pb-0.5 first:pt-0.5 md:px-3 lg:px-3 transition-opacity duration-200", isCollapsed && "px-2")}>
      {!isCollapsed && (
        <h3 className="text-[10px] md:text-[10px] lg:text-[10px] font-medium uppercase tracking-[0.18em] transition-colors duration-200" style={{ color: 'var(--sidebar-category-text)' }}>
          {name}
        </h3>
      )}
    </div>
  );

  return (
    <div
      className={cn(
        "min-h-screen h-full flex flex-col z-50 relative",
        "border-r shadow-xl",
        "transition-[width] duration-300",
        isMobile && isMobileOpen && "animate-sidebar-slide-in",
        isMobile 
          ? "w-screen" 
          : isCollapsed 
            ? "w-16 md:w-16 lg:w-16" 
            : "w-64 md:w-72 lg:w-72"
      )}
      style={{
        ...themeStyles,
        background: 'var(--sidebar-bg)',
        transitionTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)',
      }}
    >
      {/* Header */}
      <div
        className={cn(
          "border-b overflow-hidden px-2 py-2 md:px-3 md:py-2 lg:px-3 lg:py-1",
          "transition-colors duration-200"
        )}
        style={{ borderColor: 'var(--sidebar-border)' }}
      >
          <div className={cn(
            "flex items-center gap-2 md:gap-3", 
            isCollapsed && !isMobile 
              ? "justify-center" 
              : "justify-between"
          )}>
            {isCollapsed && !isMobile ? (
              // Quando colapsado, mostra apenas a logo centralizada (substitui o botão de menu)
              <button
                onClick={handleToggleCollapse}
                className="flex items-center justify-center p-1 rounded-full transition-transform duration-300 ease-out hover:bg-[var(--sidebar-button-hover-bg)] hover:scale-[1.15] active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sidebar-focus-ring)]"
                aria-label="Expandir menu"
              >
                <img
                  width="40px"
                  height="40px"
                  src="/AFIRME-PLAY-ico.png"
                  alt="Afirme Play"
                  className="object-contain transition-transform duration-300 w-10 h-10"
                />
              </button>
            ) : (
              <>
                <div
                  className={cn(
                    "flex items-center gap-2 px-0 py-0",
                    isCollapsed && !isMobile && "px-0 py-0"
                  )}
                >
                  <img
                    src="/AFIRME-PLAY-ico.png"
                    alt="Afirme Play"
                    className="object-contain transition-transform duration-300 ease-out hover:scale-110 w-8 h-8 md:w-9 md:h-9"
                  />
                </div>

                {isMobile ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="group h-9 w-9 md:h-10 md:w-10 rounded-full border transition-transform duration-300 ease-out border-[var(--sidebar-button-border)] text-[var(--sidebar-icon-color)] hover:bg-[var(--sidebar-button-hover-bg)] hover:text-[var(--sidebar-button-hover-text)] hover:scale-110 active:scale-90"
                    onClick={onMobileMenuClose}
                  >
                    <X className="h-5 w-5 md:h-6 md:w-6 transition-transform duration-300 ease-out group-hover:rotate-90" />
                    <span className="sr-only">Fechar menu</span>
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="group h-8 w-8 md:h-9 md:w-9 lg:h-8 lg:w-8 rounded-full border transition-transform duration-300 ease-out border-[var(--sidebar-button-border)] text-[var(--sidebar-icon-color)] hover:bg-[var(--sidebar-button-hover-bg)] hover:text-[var(--sidebar-button-hover-text)] hover:scale-110 active:scale-90"
                    onClick={handleToggleCollapse}
                  >
                    <ChevronLeft className="h-4 w-4 md:h-5 md:w-5 lg:h-4 lg:w-4 transition-transform duration-300 ease-out group-hover:-translate-x-1" />
                    <span className="sr-only">Alternar menu</span>
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Notificações */}
        {!isCollapsed && !isMobile && user.id && (
          <div className="px-2 pb-1 md:px-3">
            <div className="flex justify-center">
              <NotificationBell />
            </div>
          </div>
        )}
        
        {/* Coin balance (aluno) + User Info */}
        {!isCollapsed && !isMobile && user.role === 'aluno' && (
          <div className="px-2 pb-1 md:px-3">
            <Link to="/aluno/moedas/historico" className="block">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="rounded-lg border px-2 py-1.5 transition-all duration-300 ease-out hover:scale-[1.04] hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98]" style={{ borderColor: 'var(--sidebar-border)', backgroundColor: 'var(--sidebar-user-card-bg)' }}>
                      <CoinBalance studentId={user.id} size="small" showLabel={false} />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p>Ver histórico</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </Link>
          </div>
        )}
        {(isMobile || !isCollapsed) && <UserInfo />}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto custom-scrollbar">
          <div className={cn(
            "px-1.5 pb-2 md:px-2 md:pb-3 lg:px-2 lg:pb-2", 
            isMobile && "pb-4"
          )}>
            {sidebarCategoriesToRender.map(category => {
              if (!category.role.includes(user.role)) return null;

              const visibleLinks = isRestrictedNav
                ? filterNavLinks(category.links, user, corretorAllowedHrefs)
                : filterNavLinks(category.links, user);

              if (visibleLinks.length === 0) return null;

              return (
                <div key={category.name}>
                  <CategorySeparator name={category.name} />
                  <ul className="space-y-1 md:space-y-1.5">
                    {visibleLinks.map((link, index) => (
                      <RenderMenuItem
                        key={`${link.label}-${link.href || link.role.join('-')}-${index}`}
                        link={link}
                        currentPath={currentPath}
                        isCollapsed={isCollapsed}
                        handleLogout={handleLogout}
                        userRole={user.role}
                      />
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </nav>
    </div>
  );
}
