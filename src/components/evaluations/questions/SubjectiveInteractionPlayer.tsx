import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { slotImages, type Interaction, type Response } from "@/lib/question-interactions";

/**
 * Alguns cards do banco de "Arrastar e Soltar" podem, por engano, ter sido preenchidos com uma
 * imagem (data URL) em vez de texto — o campo de edição aceita texto livre. Detectamos esse caso
 * para exibir uma miniatura em vez do texto bruto (que ficaria enorme e cortado).
 */
function isImageValue(value: string): boolean {
  return /^data:image\//i.test(value) || /^https?:\/\/.+\.(png|jpe?g|gif|webp|svg)$/i.test(value);
}

interface SubjectiveInteractionPlayerProps {
  interaction: Interaction;
  value?: Response;
  onChange: (next: Response) => void;
  disabled?: boolean;
}

/**
 * Renderização interativa de uma interação subjetiva durante a prova — o aluno responde e o
 * resultado (sempre serializável em JSON) é devolvido via `onChange`, para ser persistido como
 * string (`JSON.stringify`) no mesmo fluxo de `answer` usado pelas demais questões.
 *
 * Ao contrário do `SubjectiveInteractionPreview` (somente leitura, usado no banco de questões
 * e na correção/impressão), este componente captura a interação do aluno.
 */
export function SubjectiveInteractionPlayer({ interaction, value, onChange, disabled }: SubjectiveInteractionPlayerProps) {
  switch (interaction.type) {
    case "dissertativa":
      // Tratada separadamente como texto livre simples em QuestionOptions.
      return null;

    case "arrastar_soltar":
      return (
        <ArrastarSoltar
          interaction={interaction}
          value={value && value.type === "arrastar_soltar" ? value : undefined}
          onChange={onChange}
          disabled={disabled}
        />
      );

    case "ligar_colunas":
      return (
        <LigarColunas
          interaction={interaction}
          value={value && value.type === "ligar_colunas" ? value : undefined}
          onChange={onChange}
          disabled={disabled}
        />
      );

    case "ordenacao":
      return (
        <Ordenacao
          interaction={interaction}
          value={value && value.type === "ordenacao" ? value : undefined}
          onChange={onChange}
          disabled={disabled}
        />
      );

    case "completar_lacunas": {
      const vals = value && value.type === "completar_lacunas" ? value.values : interaction.answers.map(() => "");
      return (
        <p className="text-sm sm:text-base md:text-lg leading-loose text-foreground">
          {interaction.segments.map((seg, i) => (
            <span key={i}>
              {seg}
              {i < interaction.answers.length && (
                <input
                  disabled={disabled}
                  value={vals[i] ?? ""}
                  onChange={(e) => {
                    const nv = [...vals];
                    nv[i] = e.target.value;
                    onChange({ type: "completar_lacunas", values: nv });
                  }}
                  className="mx-1 inline-block w-28 sm:w-36 rounded-md border-b-2 border-purple-400 dark:border-purple-600 bg-transparent px-1 text-center font-medium text-foreground outline-none focus:border-purple-600 disabled:opacity-60"
                />
              )}
            </span>
          ))}
        </p>
      );
    }

    case "substituicao": {
      const vals = value && value.type === "substituicao" ? value.values : interaction.targets.map(() => "");
      return (
        <div className="flex flex-col gap-3 sm:gap-4">
          <p className="rounded-lg border border-border bg-muted/30 dark:bg-muted/10 p-3 sm:p-4 text-sm sm:text-base leading-relaxed">
            {interaction.sentence}
          </p>
          {interaction.targets.map((t, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 sm:p-4">
              {t.image && (
                <img
                  src={t.image}
                  alt=""
                  className="h-16 w-16 sm:h-20 sm:w-20 shrink-0 rounded-lg border border-border object-contain"
                />
              )}
              <div className="grid flex-1 gap-2 sm:grid-cols-[160px_1fr] sm:items-center">
                <span className="text-sm sm:text-base font-medium">Substituir "{t.original}":</span>
                <Input
                  disabled={disabled}
                  value={vals[i] ?? ""}
                  onChange={(e) => {
                    const nv = [...vals];
                    nv[i] = e.target.value;
                    onChange({ type: "substituicao", values: nv });
                  }}
                  className="text-sm sm:text-base"
                />
              </div>
            </div>
          ))}
        </div>
      );
    }

    case "destacar_trechos": {
      const sel = new Set(value && value.type === "destacar_trechos" ? value.selected : []);
      return (
        <div className="flex flex-wrap gap-2 rounded-lg sm:rounded-xl border border-border bg-card p-4 sm:p-5 text-base sm:text-lg leading-relaxed">
          {interaction.tokens.map((tok, i) => {
            const active = sel.has(i);
            return (
              <button
                key={i}
                type="button"
                disabled={disabled}
                onClick={() => {
                  const next = active ? [...sel].filter((x) => x !== i) : [...sel, i];
                  onChange({ type: "destacar_trechos", selected: next });
                }}
                className={`rounded-md px-2 py-1 font-medium transition ${
                  active
                    ? "bg-purple-200 text-purple-900 dark:bg-purple-900/60 dark:text-purple-100"
                    : "hover:bg-muted"
                } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
              >
                {tok}
              </button>
            );
          })}
        </div>
      );
    }

    case "escrita_matematica":
      return (
        <Input
          disabled={disabled}
          value={value && value.type === "escrita_matematica" ? value.text : ""}
          onChange={(e) => onChange({ type: "escrita_matematica", text: e.target.value })}
          placeholder="Digite o resultado..."
          className="font-mono text-base sm:text-lg"
        />
      );

    case "construcao_resposta": {
      const steps = value && value.type === "construcao_resposta" ? value.steps : interaction.steps.map(() => "");
      const stepImgs = interaction.stepImages ?? [];
      return (
        <div className="flex flex-col gap-3 sm:gap-4">
          {interaction.steps.map((label, i) => (
            <div key={i} className="rounded-lg sm:rounded-xl border border-border bg-card p-3 sm:p-4">
              <div className="mb-2 flex items-center gap-3">
                {stepImgs[i] && (
                  <img
                    src={stepImgs[i] ?? ""}
                    alt=""
                    className="h-14 w-14 sm:h-16 sm:w-16 shrink-0 rounded-lg border border-border object-contain"
                  />
                )}
                <div className="text-xs sm:text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  Etapa {i + 1} · {label}
                </div>
              </div>
              <Textarea
                disabled={disabled}
                value={steps[i] ?? ""}
                onChange={(e) => {
                  const nv = [...steps];
                  nv[i] = e.target.value;
                  onChange({ type: "construcao_resposta", steps: nv });
                }}
                className="min-h-[70px] sm:min-h-[90px] text-sm sm:text-base"
              />
            </div>
          ))}
        </div>
      );
    }

    default:
      return null;
  }
}

// ---------- Arrastar e Soltar (drag nativo + clique-para-posicionar) ----------
function ArrastarSoltar({
  interaction,
  value,
  onChange,
  disabled,
}: {
  interaction: Extract<Interaction, { type: "arrastar_soltar" }>;
  value?: Extract<Response, { type: "arrastar_soltar" }>;
  onChange: (r: Response) => void;
  disabled?: boolean;
}) {
  const slotValues = value?.slotValues ?? interaction.slots.map(() => null);
  const used = new Set(slotValues.filter(Boolean) as string[]);
  const [pickedCard, setPickedCard] = useState<string | null>(null);

  function place(slotIdx: number, card: string) {
    const nv = [...slotValues];
    for (let i = 0; i < nv.length; i++) if (nv[i] === card) nv[i] = null;
    nv[slotIdx] = card;
    onChange({ type: "arrastar_soltar", slotValues: nv });
    setPickedCard(null);
  }
  function clear(slotIdx: number) {
    const nv = [...slotValues];
    nv[slotIdx] = null;
    onChange({ type: "arrastar_soltar", slotValues: nv });
  }

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      {interaction.instruction && (
        <p className="rounded-lg border border-border bg-muted/30 dark:bg-muted/10 p-3 text-xs sm:text-sm font-medium uppercase leading-snug tracking-wide">
          {interaction.instruction}
        </p>
      )}
      <div>
        {interaction.bankLabel && (
          <div className="mb-2 rounded-lg border-2 border-foreground/60 bg-card px-4 py-2 text-center text-base sm:text-lg font-bold tracking-widest">
            {interaction.bankLabel}
          </div>
        )}
        <div className="flex flex-wrap justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 dark:bg-muted/10 p-3">
          {interaction.bank.map((card, i) => {
            const isUsed = used.has(card);
            const isPicked = pickedCard === card;
            return (
              <button
                key={i}
                type="button"
                draggable={!disabled && !isUsed}
                onDragStart={(e) => e.dataTransfer.setData("text/plain", card)}
                disabled={disabled || isUsed}
                onClick={() => !disabled && !isUsed && setPickedCard(isPicked ? null : card)}
                className={`select-none rounded-lg border-2 px-4 py-2 text-sm sm:text-base font-bold shadow-sm transition ${
                  isUsed
                    ? "cursor-not-allowed border-dashed border-border bg-muted text-muted-foreground opacity-40"
                    : isPicked
                      ? "cursor-pointer border-purple-500 bg-purple-100 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 ring-2 ring-purple-300 dark:ring-purple-700"
                      : "cursor-grab border-purple-300 dark:border-purple-700 bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 hover:brightness-105 active:cursor-grabbing"
                }`}
              >
                {isImageValue(card) ? (
                  <img src={card} alt="" className="h-10 w-10 sm:h-12 sm:w-12 object-contain" />
                ) : (
                  card
                )}
              </button>
            );
          })}
        </div>
        {pickedCard && !disabled && (
          <p className="mt-2 text-center text-xs sm:text-sm text-purple-700 dark:text-purple-300 font-medium">
            {isImageValue(pickedCard) ? "Toque no local onde deseja colocar a imagem selecionada." : `Toque no local onde deseja colocar "${pickedCard}".`}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2">
        {interaction.slots.map((s, i) => {
          const current = slotValues[i];
          const imgs = slotImages(s);
          return (
            <div
              key={i}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (disabled) return;
                const card = e.dataTransfer.getData("text/plain");
                if (card) place(i, card);
              }}
              onClick={() => {
                if (disabled) return;
                if (pickedCard) place(i, pickedCard);
                else if (current) clear(i);
              }}
              className={`flex flex-col gap-2 rounded-xl border-2 p-3 transition ${
                disabled ? "cursor-not-allowed" : "cursor-pointer"
              } ${pickedCard ? "border-purple-400 dark:border-purple-600" : "border-border"} bg-card`}
            >
              {imgs.length === 0 ? (
                <div className="grid aspect-[16/10] w-full place-items-center rounded-lg border-2 border-dashed border-border bg-muted/20 dark:bg-muted/10 text-xs text-muted-foreground">
                  (sem imagem)
                </div>
              ) : (
                <div className={`grid gap-2 ${imgs.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                  {imgs.map((img, k) => (
                    <div
                      key={k}
                      className="aspect-[16/10] w-full overflow-hidden rounded-lg border border-border bg-muted/20 dark:bg-muted/10"
                    >
                      <img src={img} alt="" className="h-full w-full object-contain" />
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-center gap-2 rounded-lg border-2 border-foreground/60 bg-background dark:bg-muted/20 px-3 py-2">
                <span
                  className={`grid h-8 sm:h-9 w-11 sm:w-12 shrink-0 place-items-center overflow-hidden rounded font-bold text-base sm:text-lg ${
                    current
                      ? "border border-purple-500 bg-purple-500 text-white"
                      : "border border-dashed border-border bg-muted/60 dark:bg-muted/30 text-muted-foreground"
                  }`}
                >
                  {current && isImageValue(current) ? (
                    <img src={current} alt="" className="h-full w-full object-contain" />
                  ) : (
                    current ?? "?"
                  )}
                </span>
                <span className="text-lg sm:text-xl font-bold tracking-wide">{s.label}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Ligar Colunas ----------
type LineCoords = { key: string; x1: number; y1: number; x2: number; y2: number };

function LigarColunas({
  interaction,
  value,
  onChange,
  disabled,
}: {
  interaction: Extract<Interaction, { type: "ligar_colunas" }>;
  value?: Extract<Response, { type: "ligar_colunas" }>;
  onChange: (r: Response) => void;
  disabled?: boolean;
}) {
  const mapping = value?.mapping ?? {};
  // Coluna B exibida em ordem embaralhada (estável durante a montagem do componente).
  const rightOrder = useMemo(
    () => interaction.pairs.map((_, i) => i).sort(() => Math.random() - 0.5),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [interaction.pairs.length],
  );
  const [selectedLeft, setSelectedLeft] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const leftRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  const rightRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  const [lines, setLines] = useState<LineCoords[]>([]);

  function disconnect(leftIdx: number) {
    const next = { ...mapping };
    delete next[leftIdx];
    onChange({ type: "ligar_colunas", mapping: next });
  }

  function handleLeftClick(leftIdx: number) {
    if (disabled) return;
    if (mapping[leftIdx] !== undefined) {
      // Já conectado: tocar de novo desfaz a ligação diretamente.
      disconnect(leftIdx);
      setSelectedLeft(null);
      return;
    }
    setSelectedLeft(selectedLeft === leftIdx ? null : leftIdx);
  }

  function handleRightClick(rightIdx: number) {
    if (disabled) return;
    if (selectedLeft === null) {
      // Nenhum item da Coluna A selecionado: tocar num par já conectado desfaz a ligação.
      const currentLeft = Object.entries(mapping).find(([, r]) => r === rightIdx)?.[0];
      if (currentLeft !== undefined) disconnect(Number(currentLeft));
      return;
    }
    // Conecta selectedLeft -> rightIdx. Se esse item da Coluna B já estava ligado a outro,
    // remove a ligação antiga primeiro (evita dois itens da esquerda apontando pro mesmo par).
    const next: Record<number, number> = {};
    Object.entries(mapping).forEach(([l, r]) => {
      if (r !== rightIdx) next[Number(l)] = r;
    });
    next[selectedLeft] = rightIdx;
    onChange({ type: "ligar_colunas", mapping: next });
    setSelectedLeft(null);
  }

  const rightAssignedTo: Record<number, number> = {};
  Object.entries(mapping).forEach(([l, r]) => (rightAssignedTo[r] = Number(l)));

  const recalcLines = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const next: LineCoords[] = [];
    Object.entries(mapping).forEach(([leftStr, rightIdx]) => {
      const leftIdx = Number(leftStr);
      const leftEl = leftRefs.current[leftIdx];
      const rightEl = rightRefs.current[rightIdx];
      if (!leftEl || !rightEl) return;
      const leftRect = leftEl.getBoundingClientRect();
      const rightRect = rightEl.getBoundingClientRect();
      next.push({
        key: `${leftIdx}-${rightIdx}`,
        x1: leftRect.right - containerRect.left,
        y1: leftRect.top + leftRect.height / 2 - containerRect.top,
        x2: rightRect.left - containerRect.left,
        y2: rightRect.top + rightRect.height / 2 - containerRect.top,
      });
    });
    setLines(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(mapping)]);

  useLayoutEffect(() => {
    recalcLines();
  }, [recalcLines]);

  useEffect(() => {
    window.addEventListener("resize", recalcLines);
    return () => window.removeEventListener("resize", recalcLines);
  }, [recalcLines]);

  return (
    <div ref={containerRef} className="relative grid grid-cols-1 gap-4 sm:grid-cols-2">
      <svg className="pointer-events-none absolute inset-0 hidden sm:block" style={{ width: "100%", height: "100%" }}>
        {lines.map((line) => (
          <g key={line.key}>
            <line
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke="rgb(16 185 129)"
              strokeWidth={3}
              strokeLinecap="round"
              opacity={0.75}
            />
            <circle cx={line.x1} cy={line.y1} r={4} fill="rgb(16 185 129)" />
            <circle cx={line.x2} cy={line.y2} r={4} fill="rgb(16 185 129)" />
          </g>
        ))}
      </svg>
      <div className="flex flex-col gap-2">
        <div className="text-xs sm:text-sm font-bold uppercase tracking-wider text-muted-foreground">Coluna A</div>
        {interaction.pairs.map((p, i) => {
          const assigned = mapping[i];
          const active = selectedLeft === i;
          return (
            <button
              key={i}
              type="button"
              ref={(el) => {
                leftRefs.current[i] = el;
              }}
              disabled={disabled}
              onClick={() => handleLeftClick(i)}
              className={`flex items-center gap-3 rounded-lg border-2 p-3 text-left text-sm sm:text-base transition ${
                active
                  ? "border-purple-500 ring-2 ring-purple-300 dark:ring-purple-700 bg-purple-50 dark:bg-purple-950/30"
                  : assigned !== undefined
                    ? "border-emerald-400 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30"
                    : "border-border hover:bg-muted/50"
              } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
            >
              {p.leftImage && (
                <img
                  src={p.leftImage}
                  alt=""
                  className="h-14 w-14 sm:h-16 sm:w-16 shrink-0 rounded-lg border border-border object-contain"
                />
              )}
              <span className="flex-1">{p.left}</span>
              {assigned !== undefined && (
                <span className="text-xs sm:text-sm font-semibold text-emerald-700 dark:text-emerald-400">✓</span>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-2">
        <div className="text-xs sm:text-sm font-bold uppercase tracking-wider text-muted-foreground">Coluna B</div>
        {rightOrder.map((rightIdx) => {
          const leftAssigned = rightAssignedTo[rightIdx];
          const inactive = !disabled && selectedLeft === null && leftAssigned === undefined;
          const pair = interaction.pairs[rightIdx];
          return (
            <button
              key={rightIdx}
              type="button"
              ref={(el) => {
                rightRefs.current[rightIdx] = el;
              }}
              disabled={disabled}
              onClick={() => handleRightClick(rightIdx)}
              className={`flex items-center gap-3 rounded-lg border-2 p-3 text-left text-sm sm:text-base transition ${
                leftAssigned !== undefined
                  ? "border-emerald-400 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30"
                  : "border-border hover:bg-muted/50"
              } ${disabled ? "cursor-not-allowed opacity-60" : ""} ${inactive ? "opacity-60" : ""}`}
            >
              {pair.rightImage && (
                <img
                  src={pair.rightImage}
                  alt=""
                  className="h-14 w-14 sm:h-16 sm:w-16 shrink-0 rounded-lg border border-border object-contain"
                />
              )}
              <div className="flex-1">{pair.right}</div>
              {leftAssigned !== undefined && (
                <span className="text-xs sm:text-sm font-semibold text-emerald-700 dark:text-emerald-400">✓</span>
              )}
            </button>
          );
        })}
      </div>
      <div className="col-span-1 sm:col-span-2 text-[11px] sm:text-xs text-muted-foreground">
        Toque em um item da Coluna A e depois no par correspondente na Coluna B. Toque de novo num item já conectado
        para desfazer a ligação.
      </div>
    </div>
  );
}

// ---------- Ordenação (reordenar com botões) ----------
function Ordenacao({
  interaction,
  value,
  onChange,
  disabled,
}: {
  interaction: Extract<Interaction, { type: "ordenacao" }>;
  value?: Extract<Response, { type: "ordenacao" }>;
  onChange: (r: Response) => void;
  disabled?: boolean;
}) {
  // Ordem inicial embaralhada; rastreamos índices para o array original `interaction.items`.
  const initial = useMemo(
    () => (value?.order?.length ? value.order : interaction.items.map((_, i) => i).sort(() => Math.random() - 0.5)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [interaction.items.length],
  );
  const order = value?.order?.length ? value.order : initial;

  function move(from: number, to: number) {
    if (to < 0 || to >= order.length) return;
    const nv = [...order];
    const [x] = nv.splice(from, 1);
    nv.splice(to, 0, x);
    onChange({ type: "ordenacao", order: nv });
  }

  const itemImgs = interaction.itemImages ?? [];
  return (
    <ol className="flex flex-col gap-2">
      {order.map((itemIdx, pos) => (
        <li key={itemIdx} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-purple-500 text-sm font-bold text-white">
            {pos + 1}
          </span>
          {itemImgs[itemIdx] && (
            <img
              src={itemImgs[itemIdx] ?? ""}
              alt=""
              className="h-14 w-14 sm:h-16 sm:w-16 shrink-0 rounded-lg border border-border object-contain"
            />
          )}
          <span className="flex-1 text-sm sm:text-base">{interaction.items[itemIdx]}</span>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" disabled={disabled || pos === 0} onClick={() => move(pos, pos - 1)}>
              ↑
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={disabled || pos === order.length - 1}
              onClick={() => move(pos, pos + 1)}
            >
              ↓
            </Button>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default SubjectiveInteractionPlayer;
