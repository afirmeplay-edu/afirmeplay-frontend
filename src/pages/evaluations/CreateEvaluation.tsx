import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { CREATE_EVALUATION_TAB } from "./evaluationsPage.constants";

/**
 * Deep link legado (`/app/criar-avaliacao` e atalhos do dashboard).
 * Redireciona para a Central com a aba "Criar Nova" ativa.
 */
const CreateEvaluation = () => {
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/app/avaliacoes", {
      replace: true,
      state: { evaluationsTab: CREATE_EVALUATION_TAB },
    });
  }, [navigate]);

  return null;
};

export default CreateEvaluation;
