import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/authContext';
import { hasRestrictedStaffAccess, isAplicadorRole } from '@/utils/restrictedStaffAccess';

interface PrivateRouteProps {
  children: ReactNode;
}


export function PrivateRoute({ children }: PrivateRouteProps) {
  const { persistUser, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(true);

  const token = localStorage.getItem('token')

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const isValid = await persistUser();
        if (!isValid) {
          navigate('/');
        }
      } catch (error) {
        console.error('Erro ao verificar autenticação:', error);
        navigate('/');
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [navigate, persistUser]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (!token) {
    return null;
  }

  // Corretor (e-mail) e aplicador (role): mesmas rotas base; aplicador inclui modo offline.
  if (hasRestrictedStaffAccess(user)) {
    const pathname = location.pathname;
    const allowed =
      pathname === '/app' ||
      pathname === '/app/' ||
      pathname === '/app/avaliacoes' ||
      pathname === '/app/avaliacoes/' ||
      pathname === '/app/perfil' ||
      pathname === '/app/perfil/' ||
      pathname === '/app/agenda' ||
      pathname.startsWith('/app/agenda/') ||
      pathname === '/app/cartao-resposta' ||
      pathname === '/app/cartao-resposta/gerar' ||
      pathname === '/app/cartao-resposta/cadastrar' ||
      pathname === '/app/cartao-resposta/corrigir' ||
      pathname === '/app/resultados' ||
      pathname === '/app/cartao-resposta/resultados' ||
      pathname.startsWith('/app/cartao-resposta/resultados/') ||
      pathname === '/app/configuracoes' ||
      pathname.startsWith('/app/configuracoes/') ||
      (pathname.startsWith('/app/avaliacao/') && pathname.endsWith('/fisica')) ||
      pathname.startsWith('/app/provas-fisicas/') ||
      (isAplicadorRole(user?.role) &&
        (pathname === '/app/modo-offline' ||
          pathname.startsWith('/app/modo-offline/')));

    if (!allowed) {
      return <Navigate to="/app/cartao-resposta/corrigir" replace />;
    }
  }

  return <>{children}</>;
}
