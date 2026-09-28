import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Bell, 
  AlertTriangle, 
  Info, 
  CheckCircle, 
  Clock,
  Users,
  FileText,
  Calendar,
  X,
  ExternalLink
} from "lucide-react";
import { api } from "@/lib/api";
import { avisoPreviewDateRange, getFilteredAvisos } from "@/services/avisosApi";
import { CalendarApi } from "@/services/calendarApi";
import { useAuth } from "@/context/authContext";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

interface Notification {
  id: string;
  type: 'warning' | 'info' | 'success' | 'error';
  title: string;
  message: string;
  created_at: string;
  is_read: boolean;
  action_url?: string;
  action_text?: string;
  priority: 'high' | 'medium' | 'low';
  category: 'evaluation' | 'student' | 'system' | 'deadline';
  /** Quando definido, a notificação vem da API de calendário (avisos); marcar como lida via `/calendar/events/:id/read`. */
  calendarEventId?: string;
}

export default function ProfessorNotifications() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchNotifications = async () => {
      if (!user?.id) return;

      try {
        setIsLoading(true);

        await generateSmartNotifications();
      } catch (error) {
        console.error("Erro ao buscar notificações:", error);
        toast({
          title: "Erro ao carregar notificações",
          description: "Não foi possível obter notificações atuais.",
          variant: "destructive",
        });
        setNotifications([]);
      } finally {
        setIsLoading(false);
      }
    };

    const generateSmartNotifications = async () => {
      try {
        let avisoNotifs: Notification[] = [];
        try {
          const avisosLista = await getFilteredAvisos(undefined, avisoPreviewDateRange());
          avisoNotifs = avisosLista.slice(0, 15).map((a) => {
            const preview =
              a.mensagem.length > 220 ? `${a.mensagem.slice(0, 220)}…` : a.mensagem;
            const mine =
              !!user?.id && !!a.autor_id && String(a.autor_id) === String(user.id);
            const lidoServidor = a.readOnServer === true;
            return {
              id: `calendar-aviso-${a.id}`,
              type: 'info' as const,
              title: a.titulo,
              message: preview,
              created_at: a.created_at,
              is_read: mine || lidoServidor,
              action_url: user?.role === 'aluno' ? '/aluno/avisos' : '/app/avisos',
              action_text: 'Abrir avisos',
              priority: 'high' as const,
              category: 'system' as const,
              calendarEventId: a.id,
            };
          });
        } catch {
          avisoNotifs = [];
        }

        const merged = [...avisoNotifs].sort(
          (x, y) => new Date(y.created_at).getTime() - new Date(x.created_at).getTime()
        );
        setNotifications(merged.slice(0, 8));
      } catch (error) {
        console.error("Erro ao gerar notificações inteligentes:", error);
        toast({
          title: "Erro ao gerar notificações",
          description: "Não foi possível calcular notificações inteligentes.",
          variant: "destructive",
        });
        setNotifications([]);
      }
    };

    fetchNotifications();
  }, [user?.id]);

  const getNotificationConfig = (type: Notification['type']) => {
    switch (type) {
      case 'warning':
        return {
          icon: <AlertTriangle className="h-4 w-4" />,
          color: 'text-yellow-600 dark:text-yellow-400',
          bgColor: 'bg-yellow-50 dark:bg-yellow-950/40',
          borderColor: 'border-yellow-200 dark:border-yellow-800'
        };
      case 'error':
        return {
          icon: <X className="h-4 w-4" />,
          color: 'text-red-600 dark:text-red-400',
          bgColor: 'bg-red-50 dark:bg-red-950/40',
          borderColor: 'border-red-200 dark:border-red-800'
        };
      case 'success':
        return {
          icon: <CheckCircle className="h-4 w-4" />,
          color: 'text-green-600 dark:text-green-400',
          bgColor: 'bg-green-50 dark:bg-green-950/40',
          borderColor: 'border-green-200 dark:border-green-800'
        };
      case 'info':
      default:
        return {
          icon: <Info className="h-4 w-4" />,
          color: 'text-blue-600 dark:text-blue-400',
          bgColor: 'bg-blue-50 dark:bg-blue-950/40',
          borderColor: 'border-blue-200 dark:border-blue-800'
        };
    }
  };

  const getCategoryIcon = (category: Notification['category']) => {
    switch (category) {
      case 'evaluation':
        return <FileText className="h-3 w-3" />;
      case 'student':
        return <Users className="h-3 w-3" />;
      case 'deadline':
        return <Calendar className="h-3 w-3" />;
      case 'system':
      default:
        return <Bell className="h-3 w-3" />;
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) return `${diffMins}min atrás`;
    if (diffHours < 24) return `${diffHours}h atrás`;
    return `${diffDays}d atrás`;
  };

  const handleNotificationAction = (notification: Notification) => {
    if (notification.action_url) {
      navigate(notification.action_url);
    }
  };

  const markAsRead = async (notification: Notification) => {
    try {
      if (notification.calendarEventId) {
        await CalendarApi.markRead(notification.calendarEventId);
      } else {
        await api.patch(`/notifications/${notification.id}`, { is_read: true });
      }
      setNotifications(prev => 
        prev.map(notif => 
          notif.id === notification.id 
            ? { ...notif, is_read: true }
            : notif
        )
      );
    } catch (error) {
      setNotifications(prev => 
        prev.map(notif => 
          notif.id === notification.id 
            ? { ...notif, is_read: true }
            : notif
        )
      );
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(3)].map((_, index) => (
              <div key={index} className="flex items-start gap-3 p-3 rounded-lg border">
                <Skeleton className="h-8 w-8 rounded" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notificações
          {unreadCount > 0 && (
            <Badge variant="destructive" className="ml-2">
              {unreadCount}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {notifications.length === 0 ? (
          <div className="text-center py-8">
            <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Nenhuma notificação no momento</p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((notification) => {
              const config = getNotificationConfig(notification.type);
              const categoryIcon = getCategoryIcon(notification.category);

              return (
                <div
                  key={notification.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                    !notification.is_read 
                      ? `${config.bgColor} ${config.borderColor}` 
                      : 'bg-muted/50 border-border dark:bg-muted/30'
                  }`}
                >
                  <div className={`p-1 rounded ${config.color}`}>
                    {config.icon}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className={`font-medium text-sm ${!notification.is_read ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {notification.title}
                      </h4>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        {categoryIcon}
                      </div>
                    </div>
                    
                    <p className="text-xs text-muted-foreground mb-2">
                      {notification.message}
                    </p>

                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {formatTimeAgo(notification.created_at)}
                      </span>

                      {notification.action_url && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-xs px-2"
                          onClick={() => handleNotificationAction(notification)}
                        >
                          {notification.action_text || 'Ver mais'}
                          <ExternalLink className="h-3 w-3 ml-1" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {!notification.is_read && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      onClick={() => markAsRead(notification)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {notifications.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <Button 
              variant="ghost" 
              className="w-full text-sm"
              onClick={() => navigate('/app/avisos')}
            >
              Ver todas as notificações
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

