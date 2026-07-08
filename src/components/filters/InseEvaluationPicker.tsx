import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InseAvaliacaoFiltersApiService } from "@/services/inseAvaliacaoFiltersApi";
import { InstrumentPickerField } from "./InstrumentPickerField";
import {
  buildPickerContextLines,
  toInstrumentPickerItems,
  toInstrumentPickerSeries,
} from "./instrumentPickerHelpers";

type InseEvaluationPickerProps = {
  estado: string;
  municipio: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  loading?: boolean;
  label?: string;
  placeholder?: string;
  className?: string;
  estadoLabel?: string;
  municipioLabel?: string;
};

type InseEvalItem = { id: string; name: string };

export function InseEvaluationPicker({
  estado,
  municipio,
  value,
  onChange,
  disabled = false,
  loading = false,
  label = "Avaliação",
  placeholder = "Selecione a avaliação",
  className,
  estadoLabel,
  municipioLabel,
}: InseEvaluationPickerProps) {
  const [fieldItems, setFieldItems] = useState<InseEvalItem[]>([]);
  const [modalItems, setModalItems] = useState<InseEvalItem[]>([]);
  const [seriesDisponiveis, setSeriesDisponiveis] = useState<Array<{ id: string; name: string }>>([]);
  const [modalSeriesDisponiveis, setModalSeriesDisponiveis] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(false);
  const fieldRequestIdRef = useRef(0);
  const modalRequestIdRef = useRef(0);
  const valueRef = useRef(value);
  valueRef.current = value;

  const geoReady = estado !== "all" && estado !== "" && municipio !== "all" && municipio !== "";

  const contextLines = useMemo(
    () =>
      buildPickerContextLines({
        estado: estadoLabel,
        municipio: municipioLabel,
      }),
    [estadoLabel, municipioLabel]
  );

  const toPickerRaw = (items: InseEvalItem[]) =>
    items.map((a) => ({ id: a.id, nome: a.name }));

  const loadFieldItems = useCallback(async () => {
    const requestId = ++fieldRequestIdRef.current;
    if (!geoReady) {
      setFieldItems([]);
      setSeriesDisponiveis([]);
      return;
    }
    try {
      setFetchLoading(true);
      const options = await InseAvaliacaoFiltersApiService.getFilterOptions({ estado, municipio });
      if (requestId !== fieldRequestIdRef.current) return;
      setFieldItems(options.avaliacoes);
      setSeriesDisponiveis(options.series_disponiveis ?? []);
      const currentValue = valueRef.current;
      if (!options.avaliacoes.some((a) => a.id === currentValue) && currentValue) {
        onChange("");
      }
    } catch {
      if (requestId === fieldRequestIdRef.current) setFieldItems([]);
    } finally {
      if (requestId === fieldRequestIdRef.current) setFetchLoading(false);
    }
  }, [geoReady, estado, municipio, onChange]);

  const loadModalItems = useCallback(
    async (modalFilters?: { serieFiltro: string; nome: string }) => {
      const requestId = ++modalRequestIdRef.current;
      if (!geoReady) {
        setModalItems([]);
        setModalSeriesDisponiveis([]);
        return;
      }
      try {
        setModalLoading(true);
        const options = await InseAvaliacaoFiltersApiService.getFilterOptions({
          estado,
          municipio,
          ...(modalFilters?.serieFiltro && modalFilters.serieFiltro !== "all"
            ? { serie_filtro: modalFilters.serieFiltro }
            : {}),
          ...(modalFilters?.nome?.trim() ? { nome: modalFilters.nome.trim() } : {}),
        });
        if (requestId !== modalRequestIdRef.current) return;
        setModalItems(options.avaliacoes);
        if (!modalFilters) setModalSeriesDisponiveis(options.series_disponiveis ?? []);
      } catch {
        if (requestId === modalRequestIdRef.current) setModalItems([]);
      } finally {
        if (requestId === modalRequestIdRef.current) setModalLoading(false);
      }
    },
    [geoReady, estado, municipio]
  );

  useEffect(() => {
    void loadFieldItems();
  }, [loadFieldItems]);

  const fieldPickerItems = useMemo(() => {
    const base = toInstrumentPickerItems(toPickerRaw(fieldItems));
    if (!value || base.some((item) => item.id === value)) return base;
    const selected = modalItems.find((item) => item.id === value);
    return selected ? [...base, ...toInstrumentPickerItems(toPickerRaw([selected]))] : base;
  }, [fieldItems, modalItems, value]);

  const modalPickerItems = useMemo(
    () => toInstrumentPickerItems(toPickerRaw(modalItems.length > 0 ? modalItems : fieldItems)),
    [modalItems, fieldItems]
  );

  const seriesOptions = useMemo(
    () =>
      toInstrumentPickerSeries(
        modalSeriesDisponiveis.length > 0 ? modalSeriesDisponiveis : seriesDisponiveis
      ),
    [modalSeriesDisponiveis, seriesDisponiveis]
  );

  return (
    <InstrumentPickerField
      label={label}
      value={value}
      onChange={onChange}
      items={fieldPickerItems}
      modalItems={modalPickerItems}
      seriesOptions={seriesOptions}
      disabled={disabled || !geoReady}
      loading={loading || fetchLoading}
      modalLoading={modalLoading}
      placeholder={placeholder}
      modalTitle="Selecionar avaliação"
      className={className}
      contextLines={contextLines}
      contextRequiredMessage="Selecione estado e município nos filtros antes de escolher."
      emptyMessage="Nenhuma avaliação encontrada."
      onModalOpen={() => void loadModalItems()}
      onModalFiltersChange={(filters) => void loadModalItems(filters)}
    />
  );
}
