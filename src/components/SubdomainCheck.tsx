import React, { useState, useEffect, Suspense } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/context/authContext";
import { api } from "@/lib/api";
import { getSubdomainFromHost } from "@/utils/subdomain";

const Login = React.lazy(() => import("@/pages/auth/Login"));

const LoadingSpinner = () => (
  <div className="flex items-center justify-center min-h-screen bg-[#240046]">
    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white"></div>
  </div>
);

interface SubdomainCheckResponse {
  exists: boolean;
}

export default function SubdomainCheck() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "valid" | "invalid" | "unreachable">("loading");

  useEffect(() => {
    if (user.id) return;

    const subdomain = getSubdomainFromHost();
    if (!subdomain) {
      setStatus("invalid");
      return;
    }

    const check = async () => {
      try {
        const { data } = await api.get<SubdomainCheckResponse>(
          `/subdomain/check?subdomain=${encodeURIComponent(subdomain)}`
        );
        setStatus(data?.exists ? "valid" : "invalid");
      } catch {
        // API fora do ar ≠ subdomínio inválido
        setStatus("unreachable");
      }
    };

    check();
  }, [user.id]);

  const baseRoute = user.role === "aluno" ? "/aluno" : "/app";
  if (user.id) return <Navigate to={baseRoute} replace />;

  if (status === "loading") return <LoadingSpinner />;
  if (status === "unreachable") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#240046] px-6 text-center text-white">
        <p className="text-lg font-semibold">Não foi possível validar o município</p>
        <p className="max-w-md text-sm text-white/70">
          O servidor da API não respondeu. Confirme se o backend está rodando e recarregue a página.
        </p>
        <button
          type="button"
          className="mt-2 rounded-md bg-white/15 px-4 py-2 text-sm hover:bg-white/25"
          onClick={() => window.location.reload()}
        >
          Tentar novamente
        </button>
      </div>
    );
  }
  if (status === "invalid") {
    navigate("/subdominio-invalido", { replace: true });
    return <LoadingSpinner />;
  }

  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Login key="login" />
    </Suspense>
  );
}
