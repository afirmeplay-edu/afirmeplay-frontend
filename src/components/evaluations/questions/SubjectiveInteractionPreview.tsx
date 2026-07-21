import type { Interaction } from "@/lib/question-interactions";

interface SubjectiveInteractionPreviewProps {
  interaction: Interaction;
}

/**
 * Renderização somente-leitura de uma interação subjetiva — usada no preview da questão
 * (banco de questões / avaliação) e na tela de correção/impressão. Não coleta resposta:
 * a avaliação subjetiva não tem resposta online do aluno, apenas exibição do enunciado.
 */
export function SubjectiveInteractionPreview({ interaction }: SubjectiveInteractionPreviewProps) {
  switch (interaction.type) {
    case "dissertativa":
      return (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4">
          <div className="min-h-[100px] w-full rounded border border-border bg-background" />
          {interaction.keywords.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Palavras-chave de referência: {interaction.keywords.join(", ")}
            </p>
          )}
        </div>
      );
    case "arrastar_soltar":
      return (
        <div className="flex flex-col gap-4">
          {interaction.instruction && (
            <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm font-medium uppercase leading-snug tracking-wide">
              {interaction.instruction}
            </p>
          )}
          {interaction.bankLabel && (
            <div className="rounded-lg border-2 border-foreground/40 bg-background px-4 py-2 text-center text-base font-bold tracking-widest">
              {interaction.bankLabel}
            </div>
          )}
          <div className="flex flex-wrap justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/40 p-3">
            {interaction.bank.map((card, i) => (
              <div key={i} className="rounded-lg border border-primary/40 bg-primary/5 px-4 py-2 text-sm font-bold text-primary">
                {card}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {interaction.slots.map((s, i) => {
              const imgs = s.images ?? (s.image ? [s.image] : []);
              return (
                <div key={i} className="flex flex-col gap-2 rounded-lg border-2 border-border bg-card p-3">
                  {imgs.length > 0 && (
                    <div className={`grid gap-2 ${imgs.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                      {imgs.map((img, k) => (
                        <div key={k} className="aspect-[16/10] overflow-hidden rounded border border-border bg-muted/40">
                          <img src={img ?? ""} alt="" className="h-full w-full object-contain" />
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2 rounded-lg border-2 border-foreground/40 bg-background px-3 py-2">
                    <div className="grid h-9 w-12 shrink-0 place-items-center rounded border border-dashed border-border text-muted-foreground">
                      ?
                    </div>
                    <span className="text-base font-bold tracking-wide">{s.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    case "completar_lacunas":
      return (
        <p className="rounded-lg border border-border bg-muted/30 p-4 text-base leading-loose">
          {interaction.segments.map((seg, i) => (
            <span key={i}>
              {seg}
              {i < interaction.answers.length && (
                <span className="mx-1 inline-block min-w-[6rem] border-b-2 border-primary px-1 text-center text-muted-foreground">
                  &nbsp;
                </span>
              )}
            </span>
          ))}
        </p>
      );
    case "ligar_colunas":
      return (
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            {interaction.pairs.map((p, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border border-border bg-background p-3 text-sm">
                {p.leftImage && <img src={p.leftImage} alt="" className="h-12 w-12 shrink-0 rounded border border-border object-contain" />}
                <span>{p.left}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            {interaction.pairs.map((p, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border border-border bg-background p-3 text-sm">
                {p.rightImage && <img src={p.rightImage} alt="" className="h-12 w-12 shrink-0 rounded border border-border object-contain" />}
                <span>{p.right}</span>
              </div>
            ))}
          </div>
        </div>
      );
    case "ordenacao": {
      const itemImgs = interaction.itemImages ?? [];
      return (
        <ol className="flex flex-col gap-2">
          {interaction.items.map((item, i) => (
            <li key={i} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-muted text-sm font-bold text-muted-foreground">
                {i + 1}
              </span>
              {itemImgs[i] && <img src={itemImgs[i] ?? ""} alt="" className="h-12 w-12 shrink-0 rounded border border-border object-contain" />}
              <span className="flex-1 text-sm">{item}</span>
            </li>
          ))}
        </ol>
      );
    }
    case "substituicao":
      return (
        <div className="flex flex-col gap-3">
          <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm">{interaction.sentence}</p>
          {interaction.targets.map((t, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border border-border bg-background p-3">
              {t.image && <img src={t.image} alt="" className="h-16 w-16 shrink-0 rounded border border-border object-contain" />}
              <span className="text-sm font-medium">Substituir "{t.original}" por: ______________</span>
            </div>
          ))}
        </div>
      );
    case "destacar_trechos":
      return (
        <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-background p-4 text-base leading-relaxed">
          {interaction.tokens.map((tok, i) => (
            <span key={i} className="rounded px-1.5 py-0.5">
              {tok}
            </span>
          ))}
        </div>
      );
    case "escrita_matematica":
      return <div className="min-h-[48px] w-full rounded-lg border border-border bg-muted/30" />;
    case "construcao_resposta":
      return (
        <div className="flex flex-col gap-3">
          {interaction.steps.map((label, i) => (
            <div key={i} className="rounded-lg border border-border bg-background p-3">
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Etapa {i + 1} · {label}
              </div>
              <div className="min-h-[50px] w-full rounded border border-dashed border-border bg-muted/30" />
            </div>
          ))}
        </div>
      );
    default:
      return null;
  }
}

export default SubjectiveInteractionPreview;
