import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CoverTemplateEditor } from "@/components/evaluations/cover/CoverTemplateEditor";
import { api } from "@/lib/api";

export default function CoverTemplatePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [title, setTitle] = useState<string>("");

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    api
      .get(`/test/${id}`)
      .then((response) => {
        if (cancelled) return;
        setTitle(typeof response.data?.title === "string" ? response.data.title : "");
      })
      .catch(() => {
        if (!cancelled) setTitle("");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!id) navigate("/app/avaliacoes", { replace: true });
  }, [id, navigate]);

  if (!id) {
    return null;
  }

  return (
    <div className="container mx-auto px-2 py-4 md:px-4 md:py-6">
      <CoverTemplateEditor
        testId={id}
        evaluationTitle={title}
        onBack={() => navigate(-1)}
      />
    </div>
  );
}
