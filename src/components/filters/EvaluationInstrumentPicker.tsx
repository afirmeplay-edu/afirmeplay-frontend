import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EvaluationResultsApiService,
  REPORT_ENTITY_TYPE_ANSWER_SHEET,
  type FilterEvaluationItem,
  type ReportEntityTypeQuery,
} from "@/services/evaluation/evaluationResultsApi";
import { parseEvaluationSelection } from "@/utils/evaluation/evaluationGroupQuery";
import { InstrumentPickerField } from "./InstrumentPickerField";
import {
  buildPickerContextLines,
  toInstrumentPickerItems,
  toInstrumentPickerSeries,
} from "./instrumentPickerHelpers";

type EvaluationItem = FilterEvaluationItem;

type EvaluationInstrumentPickerProps = {
  estado: string;
  municipio: string;
  escola?: string;
  value: string;
  onChange: (value: string) => void;
  reportEntityType?: ReportEntityTypeQuery;
  cityId?: string;
  periodo?: string;
  disabled?: boolean;
  loading?: boolean;
  label?: string;
  placeholder?: string;
  allowAll?: boolean;
  allLabel?: string;
  className?: string;
  id?: string;
  estadoLabel?: string;
  municipioLabel?: string;
  escolaLabel?: string;
  periodoLabel?: string;
  multiple?: boolean;
};

export function EvaluationInstrumentPicker({
  estado,
  municipio,
  escola,
  value,
  onChange,
  reportEntityType,
  cityId,
  periodo,
  disabled = false,
  loading = false,
  label,
  placeholder,
  allowAll = false,
  allLabel = "Todas",
  className,
  id,
  estadoLabel,
  municipioLabel,
  escolaLabel,
  periodoLabel,
  multiple = false,
}: EvaluationInstrumentPickerProps) {
  const isAnswerSheet = reportEntityType === REPORT_ENTITY_TYPE_ANSWER_SHEET;
  const [fieldItems, setFieldItems] = useState<EvaluationItem[]>([]);
  const [modalItems, setModalItems] = useState<EvaluationItem[]>([]);
  const [seriesDisponiveis, setSeriesDisponiveis] = useState<Array<{ id: string; nome: string }>>([]);
  const [modalSeriesDisponiveis, setModalSeriesDisponiveis] = useState<
    Array<{ id: string; nome: string }>
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
        escola: escola && escola !== "all" ? escolaLabel : undefined,
        periodo: periodoLabel,
      }),
    [estadoLabel, municipioLabel, escola, escolaLabel, periodoLabel]
  );

  const loadFieldItems = useCallback(async () => {
    const requestId = ++fieldRequestIdRef.current;
    if (!geoReady) {
      setFieldItems([]);
      setSeriesDisponiveis([]);
      return;
    }
    try {
      setFetchLoading(true);
      const { evaluations, seriesDisponiveis: series } =
        await EvaluationResultsApiService.getFilterEvaluationsWithSeries({
          estado,
          municipio,
          ...(escola && escola !== "all" ? { escola } : {}),
          ...(reportEntityType ? { report_entity_type: reportEntityType } : {}),
          ...(cityId ? { city_id: cityId } : {}),
          ...(periodo?.trim() ? { periodo } : {}),
        });
      if (requestId !== fieldRequestIdRef.current) return;
      setFieldItems(evaluations);
      setSeriesDisponiveis(series);
      const currentValue = valueRef.current;
      if (currentValue === "all" || currentValue === "") return;
      const selectedIds = multiple
        ? parseEvaluationSelection(currentValue)
        : [currentValue];
      const stillValid = selectedIds.filter((id) => evaluations.some((e) => e.id === id));
      if (stillValid.length === 0) {
        onChange(allowAll ? "all" : "");
      } else if (multiple && stillValid.length !== selectedIds.length) {
        onChange(stillValid.join(","));
      } else if (!multiple && !evaluations.some((e) => e.id === currentValue)) {
        onChange(allowAll ? "all" : "");
      }
    } catch {
      if (requestId === fieldRequestIdRef.current) setFieldItems([]);
    } finally {
      if (requestId === fieldRequestIdRef.current) setFetchLoading(false);
    }
  }, [geoReady, estado, municipio, escola, reportEntityType, cityId, periodo, onChange, allowAll, multiple]);

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
        const { evaluations, seriesDisponiveis: series } =
          await EvaluationResultsApiService.getFilterEvaluationsWithSeries({
            estado,
            municipio,
            ...(reportEntityType ? { report_entity_type: reportEntityType } : {}),
            ...(cityId ? { city_id: cityId } : {}),
            ...(periodo?.trim() ? { periodo } : {}),
            ...(modalFilters?.serieFiltro && modalFilters.serieFiltro !== "all"
              ? { serie_filtro: modalFilters.serieFiltro }
              : {}),
            ...(modalFilters?.nome?.trim() ? { nome: modalFilters.nome.trim() } : {}),
          });
        if (requestId !== modalRequestIdRef.current) return;
        setModalItems(evaluations);
        if (!modalFilters) setModalSeriesDisponiveis(series);
      } catch {
        if (requestId === modalRequestIdRef.current) setModalItems([]);
      } finally {
        if (requestId === modalRequestIdRef.current) setModalLoading(false);
      }
    },
    [geoReady, estado, municipio, reportEntityType, cityId, periodo]
  );

  useEffect(() => {
    void loadFieldItems();
  }, [loadFieldItems]);

  const fieldPickerItems = useMemo(() => {
    const base = toInstrumentPickerItems(fieldItems);
    const selectedIds =
      value === "all" || !value
        ? []
        : multiple
          ? parseEvaluationSelection(value)
          : [value];
    const extras = selectedIds
      .filter((id) => !base.some((item) => item.id === id))
      .map((id) => modalItems.find((item) => item.id === id))
      .filter((item): item is EvaluationItem => Boolean(item));
    if (extras.length === 0) return base;
    return [...base, ...toInstrumentPickerItems(extras)];
  }, [fieldItems, modalItems, value, multiple]);

  const modalPickerItems = useMemo(
    () => toInstrumentPickerItems(modalItems.length > 0 ? modalItems : fieldItems),
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
      id={id}
      label={label}
      value={value || (allowAll ? "all" : "")}
      onChange={onChange}
      items={fieldPickerItems}
      modalItems={modalPickerItems}
      seriesOptions={seriesOptions}
      disabled={disabled || !geoReady}
      loading={loading || fetchLoading}
      modalLoading={modalLoading}
      placeholder={placeholder}
      modalTitle={isAnswerSheet ? "Selecionar cartão resposta" : "Selecionar avaliação"}
      allowAll={allowAll}
      allLabel={allLabel}
      className={className}
      contextLines={contextLines}
      contextRequiredMessage="Selecione estado e município nos filtros antes de escolher."
      multiple={multiple}
      emptyMessage={
        isAnswerSheet ? "Nenhum cartão resposta encontrado." : "Nenhuma avaliação encontrada."
      }
      onModalOpen={() => void loadModalItems()}
      onModalFiltersChange={(filters) => void loadModalItems(filters)}
    />
  );
}
