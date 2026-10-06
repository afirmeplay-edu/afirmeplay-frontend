/**
 * Componente de sino de notificações com badge e dropdown.
 * Exibe avisos (calendário), competições recentes e notificações da tabela central
 * (`/notifications`, ex.: logística). Leitura das últimas é controlada só pelo backend.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Bell, Trophy, Loader2, Megaphone, Truck, CheckCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/authContext';
import { api } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { avisoPreviewDateRange, getFilteredAvisos } from '@/services/avisosApi';
import { DashboardApiService } from '@/services/dashboardApi';
import type { Aviso } from '@/types/avisos';
import { computeAvisoUnread } from '@/utils/avisosRead';
import { useUnreadAvisos, AVISOS_UPDATE_EVENT } from '@/hooks/useUnreadAvisos';
import { NotificationsApiService, hasNotificationsCityContext } from '@/services/notificationsApi';
import type { ServerNotification } from '@/types/notifications';

export interface Notification {
  id: string;
  type: 'competition' | 'evaluation' | 'system' | 'deadline' | 'aviso' | 'logistics';
  title: string;
  message: string;
  created_at: string;
  is_read: boolean;
  action_url?: string;
  competition_id?: string;
  priority: 'high' | 'medium' | 'low';
  /** Avisos do calendário: marca leitura via hook + `/calendar/events/:id/read`. */
  calendarEventId?: string;
  /** Tabela central: marca leitura via `POST /notifications/:id/read`. */
  serverNotificationId?: string;
}

const AVISO_PREVIEW_LEN = 220;
const SERVER_PAGE_SIZE = 20;

/** O backend grava em UTC sem fuso; sem o "Z" o navegador leria como horário local. */
function toUtcIso(value: string): string {
  return /([zZ]|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`;
}

function mapServerNotification(n: ServerNotification): Notification {
  return {
    id: `server-${n.id}`,
    type: n.type === 'logistics_schedule' ? 'logistics' : 'system',
    title: n.title,
    message: n.message ?? '',
    created_at: toUtcIso(n.created_at),
    is_read: n.is_read,
    action_url: n.action_url ?? undefined,
    priority: 'medium',
    serverNotificationId: n.id,
  };
}

async function fetchCompetitionNotifications(userRole: string | undefined): Promise<Notification[]> {
  const newNotifications: Notification[] = [];

  try {
    const competitionsRes = await api.get('/competitions/available').catch(() => ({ data: [] }));
    const competitions = Array.isArray(competitionsRes.data) ? competitionsRes.data : [];

    competitions.forEach((comp: any) => {
      if (!comp.is_enrolled && comp.enrollment_start) {
        const enrollmentStart = new Date(comp.enrollment_start).getTime();
        const now = Date.now();
        const daysUntilStart = Math.floor((enrollmentStart - now) / (1000 * 60 * 60 * 24));

        if (daysUntilStart >= 0 && daysUntilStart <= 3) {
          newNotifications.push({
            id: `competition-${comp.id}-enrollment`,
            type: 'competition',
            title: 'Nova competição disponível',
            message: `"${comp.name}" está aberta para inscrição`,
            created_at: comp.enrollment_start,
            is_read: false,
            action_url:
              userRole === 'aluno'
                ? `/aluno/competitions/${comp.id}`
                : `/app/competitions/${comp.id}`,
            competition_id: comp.id,
            priority: daysUntilStart === 0 ? 'high' : 'medium',
          });
        }
      }

      if (comp.application) {
        const applicationDate = new Date(comp.application).getTime();
        const now = Date.now();
        const hoursUntilStart = Math.floor((applicationDate - now) / (1000 * 60 * 60));

        if (comp.is_enrolled && hoursUntilStart >= 0 && hoursUntilStart <= 24) {
          newNotifications.push({
            id: `competition-${comp.id}-start`,
            type: 'competition',
            title: 'Competição começa em breve',
            message: `"${comp.name}" começa em ${hoursUntilStart}h`,
            created_at: comp.application,
            is_read: false,
            action_url:
              userRole === 'aluno'
                ? `/aluno/competitions/${comp.id}`
                : `/app/competitions/${comp.id}`,
            competition_id: comp.id,
            priority: hoursUntilStart <= 2 ? 'high' : 'medium',
          });
        }
      }
    });

    newNotifications.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  } catch {
    /* mantém lista vazia */
  }

  return newNotifications;
}

export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { isAvisoRead, markAsRead: markAvisoRead, markAllAsRead: markAllAvisosRead } = useUnreadAvisos();

  const [avisosList, setAvisosList] = useState<Aviso[]>([]);
  const [competitionNotifications, setCompetitionNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [competitionsLoaded, setCompetitionsLoaded] = useState(false);
  const [avisoCount, setAvisoCount] = useState(0);
  const [serverItems, setServerItems] = useState<ServerNotification[]>([]);
  const [serverUnread, setServerUnread] = useState(0);
  const serverRequestSeq = useRef(0);

  /** Falhas da tabela central não afetam avisos/competições nem mostram erro. */
  const loadServerCount = useCallback(async () => {
    if (!user?.id || !hasNotificationsCityContext(user)) {
      setServerUnread(0);
      return;
    }
    const seq = serverRequestSeq.current;
    try {
      const count = await NotificationsApiService.getUnreadCount();
      if (seq === serverRequestSeq.current) setServerUnread(count);
    } catch {
      if (seq === serverRequestSeq.current) setServerUnread(0);
    }
  }, [user]);

  const loadServerPanel = useCallback(async () => {
    if (!user?.id || !hasNotificationsCityContext(user)) {
      setServerItems([]);
      setServerUnread(0);
      return;
    }
    const seq = serverRequestSeq.current;
    const [countRes, listRes] = await Promise.allSettled([
      NotificationsApiService.getUnreadCount(),
      NotificationsApiService.list({ page: 1, per_page: SERVER_PAGE_SIZE }),
    ]);
    if (seq !== serverRequestSeq.current) return;
    setServerUnread(countRes.status === 'fulfilled' ? countRes.value : 0);
    setServerItems(listRes.status === 'fulfilled' ? listRes.value.items ?? [] : []);
  }, [user]);

  useEffect(() => {
    serverRequestSeq.current += 1;
    setServerItems([]);
    setServerUnread(0);
    void loadServerCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const loadAvisos = useCallback(async () => {
    if (!user?.id) {
      setAvisosList([]);
      return;
    }
    try {
      const list = await getFilteredAvisos(undefined, avisoPreviewDateRange());
      setAvisosList(list.slice(0, 15));
    } catch {
      setAvisosList([]);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setAvisoCount(0);
      return;
    }
    let cancelled = false;
    const loadCount = () => {
      DashboardApiService.getAvisosQuantidade()
        .then((qtd) => {
          if (!cancelled) setAvisoCount(qtd);
        })
        .catch(() => {
          if (!cancelled) setAvisoCount(0);
        });
    };
    loadCount();
    window.addEventListener(AVISOS_UPDATE_EVENT, loadCount);
    return () => {
      cancelled = true;
      window.removeEventListener(AVISOS_UPDATE_EVENT, loadCount);
    };
  }, [user?.id]);

  useEffect(() => {
    setCompetitionsLoaded(false);
    setCompetitionNotifications([]);
  }, [user?.id]);

  const avisoNotifications: Notification[] = useMemo(() => {
    const avisosUrl = user?.role === 'aluno' ? '/aluno/avisos' : '/app/avisos';
    return avisosList.map((a) => {
      const preview =
        a.mensagem.length > AVISO_PREVIEW_LEN
          ? `${a.mensagem.slice(0, AVISO_PREVIEW_LEN)}…`
          : a.mensagem;
      const unread = computeAvisoUnread(a, user?.id, isAvisoRead);
      return {
        id: `calendar-aviso-${a.id}`,
        type: 'aviso' as const,
        title: a.titulo,
        message: preview,
        created_at: a.created_at,
        is_read: !unread,
        action_url: avisosUrl,
        priority: 'high' as const,
        calendarEventId: a.id,
      };
    });
  }, [avisosList, user?.id, user?.role, isAvisoRead]);

  const serverNotifications = useMemo(() => serverItems.map(mapServerNotification), [serverItems]);

  const notifications = useMemo(() => {
    const merged = [...avisoNotifications, ...competitionNotifications, ...serverNotifications].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    return merged.slice(0, 20);
  }, [avisoNotifications, competitionNotifications, serverNotifications]);

  const fetchPanelData = useCallback(async () => {
    if (!user?.id) {
      setCompetitionNotifications([]);
      return;
    }
    const serverTask = loadServerPanel();
    try {
      setIsLoading(true);
      await loadAvisos();
      try {
        const comps = await fetchCompetitionNotifications(user.role);
        setCompetitionNotifications(comps);
      } catch (compErr) {
        console.error('Erro ao buscar competições (notificações):', compErr);
        setCompetitionNotifications([]);
      }
      await serverTask;
    } catch (error) {
      console.error('Erro ao buscar notificações:', error);
      setCompetitionNotifications([]);
    } finally {
      setCompetitionsLoaded(true);
      setIsLoading(false);
    }
  }, [user?.id, user?.role, loadAvisos, loadServerPanel]);

  useEffect(() => {
    if (isOpen) {
      fetchPanelData();
    }
  }, [isOpen, fetchPanelData]);

  const avisosUnreadCount = useMemo(
    () => avisosList.filter((a) => computeAvisoUnread(a, user?.id, isAvisoRead)).length,
    [avisosList, user?.id, isAvisoRead]
  );

  const competitionUnreadCount = competitionNotifications.filter((n) => !n.is_read).length;

  const unreadCount =
    (avisosList.length > 0 ? avisosUnreadCount : avisoCount) +
    (competitionsLoaded ? competitionUnreadCount : 0) +
    serverUnread;

  const markCompetitionAsRead = useCallback((notificationId: string) => {
    setCompetitionNotifications((prev) =>
      prev.map((notif) => (notif.id === notificationId ? { ...notif, is_read: true } : notif))
    );
  }, []);

  const markServerAsRead = useCallback(
    (serverId: string) => {
      const target = serverItems.find((n) => n.id === serverId);
      if (target && !target.is_read) {
        setServerItems((prev) =>
          prev.map((n) => (n.id === serverId ? { ...n, is_read: true, read_at: new Date().toISOString() } : n))
        );
        setServerUnread((prev) => Math.max(0, prev - 1));
      }
      NotificationsApiService.markRead(serverId).catch(() => {
        void loadServerCount();
      });
    },
    [serverItems, loadServerCount]
  );

  const handleNotificationClick = useCallback(
    (notification: Notification) => {
      if (notification.calendarEventId) {
        markAvisoRead(notification.calendarEventId);
      } else if (notification.serverNotificationId) {
        markServerAsRead(notification.serverNotificationId);
      } else {
        markCompetitionAsRead(notification.id);
      }
      if (notification.action_url) {
        navigate(notification.action_url);
        setIsOpen(false);
      }
    },
    [markAvisoRead, markServerAsRead, markCompetitionAsRead, navigate]
  );

  const handleMarkAllAsRead = useCallback(() => {
    const unreadAvisoIds = avisosList
      .filter((a) => computeAvisoUnread(a, user?.id, isAvisoRead))
      .map((a) => a.id);
    if (unreadAvisoIds.length > 0) markAllAvisosRead(unreadAvisoIds);

    setCompetitionNotifications((prev) => prev.map((n) => (n.is_read ? n : { ...n, is_read: true })));

    if (serverUnread > 0 || serverItems.some((n) => !n.is_read)) {
      const now = new Date().toISOString();
      setServerItems((prev) => prev.map((n) => (n.is_read ? n : { ...n, is_read: true, read_at: now })));
      setServerUnread(0);
      NotificationsApiService.markAllRead().catch(() => {
        void loadServerCount();
      });
    }
  }, [avisosList, user?.id, isAvisoRead, markAllAvisosRead, serverUnread, serverItems, loadServerCount]);

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'competition':
        return <Trophy className="h-4 w-4" />;
      case 'aviso':
        return <Megaphone className="h-4 w-4" />;
      case 'logistics':
        return <Truck className="h-4 w-4" />;
      default:
        return <Bell className="h-4 w-4" />;
    }
  };

  const formatTimeAgo = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), {
        addSuffix: true,
        locale: ptBR,
      });
    } catch {
      return 'há pouco tempo';
    }
  };

  const emptyPanel =
    !isLoading && competitionsLoaded && notifications.length === 0;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between gap-2 p-4 border-b">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="font-semibold text-sm">Notificações</h3>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {unreadCount} não lidas
              </Badge>
            )}
          </div>
          {unreadCount > 0 && !isLoading && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs shrink-0"
              onClick={handleMarkAllAsRead}
              title="Marcar todas como lidas"
            >
              <CheckCheck className="h-3.5 w-3.5 mr-1" />
              Marcar todas
            </Button>
          )}
        </div>
        <ScrollArea className="h-[400px]">
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : emptyPanel ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <Bell className="h-12 w-12 text-muted-foreground mb-2 opacity-50" />
              <p className="text-sm text-muted-foreground">
                Nenhuma notificação no momento
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => handleNotificationClick(notification)}
                  className={cn(
                    "w-full text-left p-4 hover:bg-muted/50 transition-colors",
                    !notification.is_read && "bg-primary/5"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                      notification.type === 'competition' && "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
                      notification.type === 'aviso' && "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
                      notification.type === 'logistics' && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
                      notification.type === 'evaluation' && "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
                      notification.type === 'system' && "bg-gray-100 text-gray-700 dark:bg-gray-900/40 dark:text-gray-300",
                      notification.type === 'deadline' && "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                    )}>
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn(
                          "text-sm font-medium",
                          !notification.is_read && "font-semibold"
                        )}>
                          {notification.title}
                        </p>
                        {!notification.is_read && (
                          <div className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {notification.message}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatTimeAgo(notification.created_at)}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
