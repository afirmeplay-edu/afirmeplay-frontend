import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/context/authContext';
import { api } from '@/lib/api';
import { storeAdminApi } from '@/services/store/storeAdminService';
import type {
  StoreItemAdmin,
  StoreItemCreatePayload,
  StoreScopeType,
  StoreScopeFilter,
  StoreRequirement,
  StoreRequirementType,
  StoreRequirementOptionsResponse,
} from '@/types/store';
import { getUserHierarchyContext } from '@/utils/userHierarchy';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  ArrowLeft,
  Loader2,
  Sparkles,
  Shield,
  Palette,
  Package,
  Coins,
  Globe,
  MapPin,
  School,
  Users,
  ChevronDown,
  ChevronUp,
  ShoppingBag,
  Info,
  Trophy,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  STORE_ICON_OPTIONS,
  STORE_ICON_MAP,
  STORE_ICON_COLORS,
  getStoreIconGradient,
} from '@/constants/storeIcons';
import { BAND_COLORS, type CompetitionBand } from '@/utils/competition/competitionGamification';
import { PROFICIENCY_LEVELS } from '@/pages/reports/niveis-proficiencia/lib/proficiencyLevelTokens';

const CATEGORIES = [
  { value: 'sidebar_theme', label: 'Tema da sidebar', description: 'Cor e estilo do menu lateral', icon: Palette, color: 'from-violet-400 to-purple-600', inDevelopment: false },
  { value: 'physical', label: 'Item físico', description: 'Prêmio entregue fora do sistema', icon: Package, color: 'from-emerald-400 to-teal-600', inDevelopment: false },
  { value: 'frame', label: 'Moldura', description: 'Moldura para foto de perfil do aluno', icon: Sparkles, color: 'from-amber-400 to-yellow-500', inDevelopment: true },
  { value: 'stamp', label: 'Selo', description: 'Selo exibido no perfil ou conquistas', icon: Shield, color: 'from-slate-400 to-slate-600', inDevelopment: true },
];

const SCOPE_OPTIONS: { value: StoreScopeType; label: string; icon: React.ElementType }[] = [
  { value: 'system', label: 'Todo o sistema (todos os alunos)', icon: Globe },
  { value: 'city', label: 'Apenas um município', icon: MapPin },
  { value: 'school', label: 'Apenas uma escola', icon: School },
  { value: 'class', label: 'Apenas turmas específicas', icon: Users },
];

/** Opções amigáveis por categoria: o que o aluno recebe */
const FRAME_OPTIONS = [
  { value: 'gold', label: 'Moldura dourada', rewardData: 'gold' },
  { value: 'silver', label: 'Moldura prata', rewardData: 'silver' },
  { value: 'bronze', label: 'Moldura bronze', rewardData: 'bronze' },
  { value: 'gradient', label: 'Moldura gradiente (azul e roxo)', rewardData: 'gradient' },
];

const STAMP_OPTIONS = [
  { value: 'participation', label: 'Selo de participação', rewardData: 'participation' },
  { value: 'highlight', label: 'Selo destaque', rewardData: 'highlight' },
  { value: 'custom', label: 'Outro selo (informe o identificador abaixo)', rewardData: '' },
];

const THEME_OPTIONS = [
  { value: 'blue', label: 'Tema azul', rewardData: 'blue' },
  { value: 'green', label: 'Tema verde', rewardData: 'green' },
  { value: 'violet', label: 'Tema violeta', rewardData: 'violet' },
  { value: 'amber', label: 'Tema âmbar', rewardData: 'amber' },
  { value: 'rose', label: 'Tema rosa', rewardData: 'rose' },
  { value: 'dark', label: 'Tema escuro', rewardData: 'dark' },
  { value: 'cyan', label: 'Tema ciano', rewardData: 'cyan' },
  { value: 'indigo', label: 'Tema índigo', rewardData: 'indigo' },
  { value: 'emerald', label: 'Tema esmeralda', rewardData: 'emerald' },
  { value: 'orange', label: 'Tema laranja', rewardData: 'orange' },
  { value: 'fuchsia', label: 'Tema fúcsia', rewardData: 'fuchsia' },
  { value: 'teal', label: 'Tema teal', rewardData: 'teal' },
];

/**
 * Gera automaticamente reward_type e reward_data a partir da categoria e do valor
 * escolhido (ex.: moldura dourada → type "frame", data "gold").
 */
function getRewardFromCategory(
  category: string,
  rewardValue?: string | null
): { rewardType: string; rewardData: string | null } {
  const value = rewardValue?.trim() || null;
  switch (category) {
    case 'frame':
      return { rewardType: 'frame', rewardData: value };
    case 'stamp':
      return { rewardType: 'stamp', rewardData: value };
    case 'sidebar_theme':
      return { rewardType: 'sidebar_theme', rewardData: value };
    case 'physical':
      return { rewardType: 'physical', rewardData: null };
    default:
      return { rewardType: category, rewardData: value };
  }
}

/** Valor padrão de reward_data ao trocar de categoria (primeira opção). */
function getDefaultRewardValueForCategory(category: string): string {
  switch (category) {
    case 'frame':
      return FRAME_OPTIONS[0].rewardData;
    case 'stamp':
      return STAMP_OPTIONS[0].rewardData;
    case 'sidebar_theme':
      return THEME_OPTIONS[0].rewardData;
    case 'physical':
      return '';
    default:
      return '';
  }
}

const FALLBACK_BANDS = (Object.keys(BAND_COLORS) as CompetitionBand[]).map((value) => ({
  value,
  label: value,
}));
const FALLBACK_CLASSIFICATIONS = PROFICIENCY_LEVELS.map((value) => ({ value, label: value }));
const FALLBACK_MEDALS = [
  { value: 'bronze', label: 'Bronze' },
  { value: 'prata', label: 'Prata' },
  { value: 'ouro', label: 'Ouro' },
  { value: 'platina', label: 'Platina' },
];

type RequirementTypeOrNone = 'none' | StoreRequirementType;

function buildRequirementPayload(
  type: RequirementTypeOrNone,
  minBand: string,
  minGrade: string,
  minClassification: string,
  achievementId: string,
  medal: string,
): StoreRequirement | null {
  if (type === 'none') return null;
  if (type === 'competition_band') return { type, min_band: minBand };
  if (type === 'eval_min_grade') {
    const n = Number(minGrade);
    return { type, min_grade: Number.isFinite(n) ? n : 0 };
  }
  if (type === 'eval_classification') return { type, min_classification: minClassification };
  if (type === 'achievement') return { type, id: achievementId, medal };
  return null;
}

interface StateOption {
  id: string;
  name: string;
}

interface CityOption {
  id: string;
  name: string;
}

interface SchoolOption {
  id: string;
  name: string;
}

interface ClassOption {
  id: string;
  name: string;
}

export default function StoreAdminForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const isEdit = Boolean(id);

  const [allowedScopes, setAllowedScopes] = useState<string[]>([]);
  const [loadingScopes, setLoadingScopes] = useState(true);
  const [item, setItem] = useState<StoreItemAdmin | null>(null);
  const [loadingItem, setLoadingItem] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState<number>(0);
  const [category, setCategory] = useState<string>('frame');
  const [rewardType, setRewardType] = useState(() => getRewardFromCategory('frame', getDefaultRewardValueForCategory('frame')).rewardType);
  const [rewardData, setRewardData] = useState(() => getDefaultRewardValueForCategory('frame'));
  const [isPhysical, setIsPhysical] = useState(false);
  const [scopeType, setScopeType] = useState<StoreScopeType>('system');
  const [scopeFilter, setScopeFilter] = useState<StoreScopeFilter | null>(null);
  const [icon, setIcon] = useState<string>('');
  const [iconColor, setIconColor] = useState<string>('amber');
  const [requirementType, setRequirementType] = useState<RequirementTypeOrNone>('none');
  const [reqMinBand, setReqMinBand] = useState<string>(FALLBACK_BANDS[0]?.value ?? 'Aprendiz');
  const [reqMinGrade, setReqMinGrade] = useState<string>('7');
  const [reqMinClassification, setReqMinClassification] = useState<string>(FALLBACK_CLASSIFICATIONS[2]?.value ?? 'Adequado');
  const [reqAchievementId, setReqAchievementId] = useState<string>('');
  const [reqMedal, setReqMedal] = useState<string>('bronze');
  const [requirementOptions, setRequirementOptions] = useState<StoreRequirementOptionsResponse | null>(null);
  const [states, setStates] = useState<StateOption[]>([]);
  const [cities, setCities] = useState<CityOption[]>([]);
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [selectedStateId, setSelectedStateId] = useState('');
  const [selectedCityId, setSelectedCityId] = useState('');
  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [loadingCities, setLoadingCities] = useState(false);
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [hierarchyContext, setHierarchyContext] = useState<Awaited<ReturnType<typeof getUserHierarchyContext>> | null>(null);
  const cityIdForApi = user?.role === 'admin' ? selectedCityId || null : (hierarchyContext?.municipality?.id ?? null);

  useEffect(() => {
    storeAdminApi
      .getAllowedScopes(cityIdForApi || undefined)
      .then(({ data }) => setAllowedScopes(data.allowed_scopes ?? []))
      .catch(() => setAllowedScopes(['system']))
      .finally(() => setLoadingScopes(false));
  }, [cityIdForApi]);

  useEffect(() => {
    storeAdminApi
      .getRequirementOptions(cityIdForApi || undefined)
      .then(({ data }) => {
        setRequirementOptions(data);
        if (data.achievements?.length) {
          setReqAchievementId((current) => current || data.achievements[0].id);
        }
      })
      .catch(() => setRequirementOptions(null));
  }, [cityIdForApi]);

  useEffect(() => {
    if (user?.id && user?.role && user.role !== 'admin') {
      getUserHierarchyContext(user.id, user.role).then(setHierarchyContext);
    }
  }, [user?.id, user?.role]);

  useEffect(() => {
    if (!id) return;
    storeAdminApi
      .getAdminItems(undefined)
      .then(({ data }) => {
        const found = (data.items ?? []).find((i) => i.id === id);
        if (found) {
          setItem(found);
          setName(found.name);
          setDescription(found.description ?? '');
          setPrice(found.price);
          setCategory(found.category);
          setRewardType(found.reward_type ?? '');
          setRewardData(found.reward_data ?? '');
          setIsPhysical(found.is_physical);
          setScopeType((found.scope_type as StoreScopeType) || 'system');
          setScopeFilter(found.scope_filter ?? null);
          setIcon(found.icon ?? '');
          setIconColor(found.icon_color ?? 'amber');
          const req = found.requirement;
          if (req?.type) {
            setRequirementType(req.type);
            if (req.min_band) setReqMinBand(req.min_band);
            if (req.min_grade != null) setReqMinGrade(String(req.min_grade));
            if (req.min_classification) setReqMinClassification(req.min_classification);
            if (req.id) setReqAchievementId(req.id);
            if (req.medal) setReqMedal(req.medal);
          } else {
            setRequirementType('none');
          }
          const sf = found.scope_filter;
          if (sf?.city_ids?.length) setSelectedCityId(sf.city_ids[0]);
          if (sf?.school_ids?.length) setSelectedSchoolId(sf.school_ids[0]);
          if (sf?.class_ids?.length) setSelectedClassIds(sf.class_ids);
        }
      })
      .catch(() => toast({ title: 'Erro ao carregar item', variant: 'destructive' }))
      .finally(() => setLoadingItem(false));
  }, [id, toast]);

  useEffect(() => {
    if (user?.role !== 'admin') return;
    api.get<unknown[]>('/city/states').then((res) => {
      const raw = Array.isArray(res.data) ? res.data : [];
      setStates(
        raw.map((s: Record<string, unknown>) => ({
          id: String(s.id ?? s.sigla ?? ''),
          name: String(s.name ?? s.nome ?? s.id ?? ''),
        })).filter((s) => s.id)
      );
    }).catch(() => setStates([]));
  }, [user?.role]);

  useEffect(() => {
    if (user?.role !== 'admin' || !selectedStateId) {
      setCities([]);
      setSelectedCityId('');
      return;
    }
    setLoadingCities(true);
    api
      .get<CityOption[]>(`/city/municipalities/state/${selectedStateId}`)
      .then((res) => {
        let data = Array.isArray(res.data) ? res.data : [];
        if (user?.tenant_id) data = data.filter((c: CityOption) => c.id === user.tenant_id);
        setCities(data);
      })
      .catch(() => setCities([]))
      .finally(() => setLoadingCities(false));
  }, [selectedStateId, user?.role, user?.tenant_id]);

  useEffect(() => {
    if (scopeType !== 'school' && scopeType !== 'class') {
      setSchools([]);
      setSelectedSchoolId('');
      return;
    }
    if (user?.role === 'diretor' || user?.role === 'coordenador') {
      const school = hierarchyContext?.school;
      if (school) {
        setSchools([{ id: school.id, name: school.name ?? school.nome ?? school.id }]);
      } else {
        setSchools([]);
      }
      setLoadingSchools(false);
      return;
    }
    const effectiveCityId = user?.role === 'admin' ? selectedCityId : hierarchyContext?.municipality?.id;
    if (!effectiveCityId) {
      setSchools([]);
      return;
    }
    setLoadingSchools(true);
    api
      .get<SchoolOption[] | { schools: SchoolOption[] }>(`/school/city/${effectiveCityId}`, { meta: { cityId: effectiveCityId } })
      .then((res) => {
        const raw = res.data;
        const list = Array.isArray(raw) ? raw : (raw as { schools?: SchoolOption[] })?.schools ?? [];
        setSchools(list);
      })
      .catch(() => setSchools([]))
      .finally(() => setLoadingSchools(false));
  }, [selectedCityId, scopeType, user?.role, hierarchyContext?.municipality?.id, hierarchyContext?.school]);

  useEffect(() => {
    if (scopeType !== 'class') {
      setClasses([]);
      setSelectedClassIds([]);
      return;
    }
    if (user?.role === 'professor' && hierarchyContext?.classes?.length) {
      setClasses(
        hierarchyContext.classes.map((c) => ({
          id: c.class_id,
          name: c.class_name ?? c.class_id,
        }))
      );
      setLoadingClasses(false);
      return;
    }
    if (!selectedSchoolId) {
      setClasses([]);
      setSelectedClassIds([]);
      return;
    }
    setLoadingClasses(true);
    const effectiveCityId = user?.role === 'admin' ? selectedCityId : hierarchyContext?.municipality?.id;
    const config = effectiveCityId ? { meta: { cityId: effectiveCityId } } : {};
    api
      .get<ClassOption[]>(`/classes/school/${selectedSchoolId}`, config)
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        setClasses(list);
      })
      .catch(() => setClasses([]))
      .finally(() => setLoadingClasses(false));
  }, [selectedSchoolId, scopeType, selectedCityId, user?.role, hierarchyContext?.municipality?.id, hierarchyContext?.classes]);

  const buildScopeFilter = useCallback((): StoreScopeFilter | null => {
    if (scopeType === 'system') return null;
    const effectiveCityId = user?.role === 'admin' ? selectedCityId : hierarchyContext?.municipality?.id;
    if (scopeType === 'city') {
      if (user?.role === 'tecadm' && hierarchyContext?.municipality?.id) {
        return { city_ids: [hierarchyContext.municipality.id] };
      }
      return effectiveCityId ? { city_ids: [effectiveCityId] } : null;
    }
    if (scopeType === 'school') {
      return selectedSchoolId ? { school_ids: [selectedSchoolId] } : null;
    }
    if (scopeType === 'class') {
      return selectedClassIds.length ? { class_ids: selectedClassIds } : null;
    }
    return null;
  }, [scopeType, selectedCityId, selectedSchoolId, selectedClassIds, user?.role, hierarchyContext?.municipality?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast({ title: 'Nome é obrigatório', variant: 'destructive' });
      return;
    }
    if (typeof price !== 'number' || price < 0) {
      toast({ title: 'Preço deve ser um número ≥ 0', variant: 'destructive' });
      return;
    }
    const scopeFilterValue = buildScopeFilter();
    if (scopeType !== 'system' && !scopeFilterValue) {
      toast({
        title: 'Selecione o filtro de escopo',
        description: scopeType === 'city' ? 'Selecione o município.' : scopeType === 'school' ? 'Selecione a escola.' : 'Selecione a(s) turma(s).',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    const { rewardType: finalType, rewardData: finalData } = getRewardFromCategory(category, rewardData);
    const payload: StoreItemCreatePayload = {
      name: name.trim(),
      description: description.trim() || null,
      price: Number(price),
      category,
      reward_type: finalType,
      reward_data: finalData,
      is_physical: isPhysical,
      scope_type: scopeType,
      scope_filter: scopeFilterValue,
      is_active: true,
      sort_order: 0,
      icon: icon.trim() || null,
      icon_color: iconColor.trim() || null,
      requirement: buildRequirementPayload(
        requirementType,
        reqMinBand,
        reqMinGrade,
        reqMinClassification,
        reqAchievementId,
        reqMedal,
      ),
    };

    try {
      if (isEdit && id) {
        await storeAdminApi.updateItem(id, payload, cityIdForApi || undefined);
        toast({ title: 'Item atualizado com sucesso.' });
      } else {
        await storeAdminApi.createItem(payload, cityIdForApi || undefined);
        toast({ title: 'Item criado com sucesso.' });
      }
      navigate('/app/loja/gerenciar');
    } catch (err: unknown) {
      const res = (err as { response?: { status?: number; data?: { erro?: string } } })?.response;
      if (res?.status === 400) {
        toast({
          title: 'Erro de validação',
          description: res?.data?.erro ?? 'Verifique os dados e tente novamente.',
          variant: 'destructive',
        });
      } else if (res?.status === 403) {
        toast({
          title: 'Sem permissão',
          description: 'Você não tem permissão para editar este item.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Erro ao salvar',
          description: res?.data?.erro ?? 'Tente novamente.',
          variant: 'destructive',
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const scopeOptions = SCOPE_OPTIONS.filter((o) => allowedScopes.includes(o.value));
  const effectiveCityId = user?.role === 'admin' ? selectedCityId : hierarchyContext?.municipality?.id;

  if (loadingScopes || (isEdit && loadingItem)) {
    return (
      <div className="container mx-auto py-6 px-4 max-w-2xl">
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 px-4 max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/app/loja/gerenciar')} className="shrink-0 rounded-full">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isEdit ? 'Editar item' : 'Adicionar item na loja'}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isEdit ? 'Altere as informações do item abaixo.' : 'Preencha os dados do item que os alunos poderão comprar com moedas.'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Passo 1: Tipo do item */}
        <Card className="overflow-hidden border-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 text-primary" />
              O que é este item?
            </CardTitle>
            <p className="text-sm text-muted-foreground">Escolha o tipo de item que aparecerá na loja.</p>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {CATEGORIES.map((c) => {
                const Icon = c.icon;
                const selected = category === c.value;
                const inDev = (c as { inDevelopment?: boolean }).inDevelopment === true;
                return (
                  <button
                    key={c.value}
                    type="button"
                    disabled={inDev}
                    onClick={() => {
                      if (inDev) return;
                      setCategory(c.value);
                      const defaultVal = getDefaultRewardValueForCategory(c.value);
                      const { rewardType: t, rewardData: d } = getRewardFromCategory(c.value, defaultVal);
                      setRewardType(t);
                      setRewardData(d ?? '');
                    }}
                    className={cn(
                      'flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition-all relative',
                      inDev
                        ? 'border-muted bg-muted/50 cursor-not-allowed opacity-75'
                        : selected
                          ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-600 hover:shadow-md'
                          : 'border-muted hover:border-amber-200 dark:hover:border-amber-900 hover:shadow-md'
                    )}
                  >
                    {inDev && (
                      <span className="absolute top-1.5 right-1.5 z-10 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium leading-tight text-amber-800 dark:bg-amber-900/60 dark:text-amber-200">
                        Em dev.
                      </span>
                    )}
                    <div className={cn('flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br text-white shrink-0', c.color, inDev && 'opacity-80')}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <span className="font-medium text-sm">{c.label}</span>
                    <span className="text-xs text-muted-foreground text-center line-clamp-2">{c.description}</span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Passo 2: Informações do item */}
        <Card className="overflow-hidden border-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Informações do item</CardTitle>
            <p className="text-sm text-muted-foreground">Nome, descrição e preço que o aluno verá na loja.</p>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <div className="space-y-2">
              <Label htmlFor="name">Nome do item *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Moldura Dourada"
                className="text-base"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descrição (opcional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex.: Moldura especial para destacar sua foto de perfil no ranking."
                rows={3}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Info className="h-3.5 w-3.5" /> Esta descrição aparece no card do item na loja.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">Quantas moedas o aluno gasta? *</Label>
              <div className="relative max-w-[140px]">
                <Coins className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-primary" />
                <Input
                  id="price"
                  type="number"
                  min={0}
                  value={price === 0 ? '' : price}
                  onChange={(e) => setPrice(Number(e.target.value) || 0)}
                  className="pl-10 text-lg font-semibold tabular-nums"
                  placeholder="0"
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground">Valor em AfirmeCoins.</p>
            </div>
          </CardContent>
        </Card>

        {/* Aparência na loja: ícone e cor */}
        <Card className="overflow-hidden border-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Aparência na loja</CardTitle>
            <p className="text-sm text-muted-foreground">Escolha um ícone e uma cor para o card do item na loja.</p>
          </CardHeader>
          <CardContent className="space-y-6 pt-0">
            <div>
              <Label className="text-sm font-medium mb-2 block">Ícone</Label>
              <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-2 max-h-64 overflow-y-auto p-1 border rounded-lg bg-muted/30">
                <button
                  type="button"
                  onClick={() => setIcon('')}
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-lg transition-all border-2 text-xs text-muted-foreground',
                    !icon ? 'border-amber-500 bg-amber-100 dark:bg-amber-900/40' : 'border-transparent hover:bg-muted'
                  )}
                  title="Usar ícone padrão da categoria"
                >
                  —
                </button>
                {STORE_ICON_OPTIONS.map((opt) => {
                  const IconComponent = STORE_ICON_MAP[opt.value];
                  const selected = icon === opt.value;
                  if (!IconComponent) return null;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setIcon(opt.value)}
                      className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-lg transition-all border-2',
                        selected
                          ? 'border-amber-500 bg-amber-100 dark:bg-amber-900/40'
                          : 'border-transparent hover:bg-muted'
                      )}
                      title={opt.label}
                    >
                      <IconComponent className="h-5 w-5 text-foreground" />
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">Clique para selecionar. Deixe em branco para usar o ícone padrão da categoria.</p>
            </div>
            <div>
              <Label className="text-sm font-medium mb-2 block">Cor de destaque</Label>
              <div className="flex flex-wrap gap-2">
                {STORE_ICON_COLORS.map((c) => {
                  const selected = iconColor === c.value;
                  return (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setIconColor(c.value)}
                      className={cn(
                        'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium border-2 transition-all',
                        selected
                          ? 'border-foreground ring-2 ring-offset-2 ring-foreground/30'
                          : 'border-transparent hover:opacity-90'
                      )}
                    >
                      <span
                        className={cn('h-4 w-4 rounded-full bg-gradient-to-br shrink-0', c.gradient)}
                      />
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Trophy className="h-5 w-5" />
              Requisito de desempenho
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Opcional. O item continua custando moedas; o requisito só decide se o aluno pode comprar.
            </p>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <div className="space-y-2">
              <Label>Tipo de requisito</Label>
              <Select
                value={requirementType}
                onValueChange={(v) => setRequirementType(v as RequirementTypeOrNone)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum (disponível para todos)</SelectItem>
                  <SelectItem value="competition_band">Faixa de competições</SelectItem>
                  <SelectItem value="eval_min_grade">Média mínima nas avaliações</SelectItem>
                  <SelectItem value="eval_classification">Classificação nas avaliações</SelectItem>
                  <SelectItem value="achievement">Conquista em determinado nível</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {requirementType === 'competition_band' && (
              <div className="space-y-2">
                <Label>Faixa mínima</Label>
                <Select value={reqMinBand} onValueChange={setReqMinBand}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(requirementOptions?.competition_bands?.length
                      ? requirementOptions.competition_bands
                      : FALLBACK_BANDS
                    ).map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {requirementType === 'eval_min_grade' && (
              <div className="space-y-2">
                <Label htmlFor="req-min-grade">Média mínima (0 a 10)</Label>
                <Input
                  id="req-min-grade"
                  type="number"
                  min={0}
                  max={10}
                  step={0.1}
                  value={reqMinGrade}
                  onChange={(e) => setReqMinGrade(e.target.value)}
                />
              </div>
            )}

            {requirementType === 'eval_classification' && (
              <div className="space-y-2">
                <Label>Classificação mínima</Label>
                <Select value={reqMinClassification} onValueChange={setReqMinClassification}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(requirementOptions?.eval_classifications?.length
                      ? requirementOptions.eval_classifications
                      : FALLBACK_CLASSIFICATIONS
                    ).map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {requirementType === 'achievement' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Conquista</Label>
                  <Select value={reqAchievementId} onValueChange={setReqAchievementId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a conquista" />
                    </SelectTrigger>
                    <SelectContent>
                      {(requirementOptions?.achievements ?? []).map((opt) => (
                        <SelectItem key={opt.id} value={opt.id}>{opt.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Nível mínimo</Label>
                  <Select value={reqMedal} onValueChange={setReqMedal}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(requirementOptions?.medals?.length
                        ? requirementOptions.medals
                        : FALLBACK_MEDALS
                      ).map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Passo 3: Quem pode ver */}
        <Card className="overflow-hidden border-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Quem pode ver este item?</CardTitle>
            <p className="text-sm text-muted-foreground">Defina se o item aparece para todos os alunos ou só para alguns.</p>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <div className="space-y-2">
              <Label>Visibilidade *</Label>
              <Select
                value={scopeType}
                onValueChange={(v) => {
                  setScopeType(v as StoreScopeType);
                  setScopeFilter(null);
                  setSelectedCityId('');
                  setSelectedSchoolId('');
                  setSelectedClassIds([]);
                }}
              >
                <SelectTrigger className="h-12 text-base">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {scopeOptions.map((o) => {
                    const Icon = o.icon;
                    return (
                      <SelectItem key={o.value} value={o.value} className="flex items-center gap-2 py-2">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        {o.label}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {scopeType === 'city' && (
              <div className="rounded-xl bg-muted/50 border p-4 space-y-3">
                <p className="text-sm font-medium flex items-center gap-2">
                  <MapPin className="h-4 w-4" /> Escolha o município
                </p>
                {user?.role === 'admin' ? (
                  <>
                    <Select value={selectedStateId} onValueChange={setSelectedStateId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Estado" />
                      </SelectTrigger>
                      <SelectContent>
                        {states.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={selectedCityId}
                      onValueChange={setSelectedCityId}
                      disabled={!selectedStateId || loadingCities}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Município" />
                      </SelectTrigger>
                      <SelectContent>
                        {cities.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {hierarchyContext?.municipality?.name ?? 'Seu município'}
                  </p>
                )}
              </div>
            )}

            {scopeType === 'school' && (
              <div className="rounded-xl bg-muted/50 border p-4 space-y-3">
                <p className="text-sm font-medium flex items-center gap-2">
                  <School className="h-4 w-4" /> Escolha a escola
                </p>
                {user?.role === 'admin' && (
                  <Select value={selectedStateId} onValueChange={setSelectedStateId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Estado" />
                    </SelectTrigger>
                    <SelectContent>
                      {states.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {user?.role === 'admin' && (
                  <Select value={selectedCityId} onValueChange={setSelectedCityId} disabled={!selectedStateId || loadingCities}>
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Município" />
                    </SelectTrigger>
                    <SelectContent>
                      {cities.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Select
                  value={selectedSchoolId}
                  onValueChange={setSelectedSchoolId}
                  disabled={!effectiveCityId || loadingSchools}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Escola" />
                  </SelectTrigger>
                  <SelectContent>
                    {schools.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {scopeType === 'class' && (
              <div className="rounded-xl bg-muted/50 border p-4 space-y-3">
                <p className="text-sm font-medium flex items-center gap-2">
                  <Users className="h-4 w-4" /> Escolha as turmas
                </p>
                {user?.role === 'professor' ? (
                  <p className="text-sm text-muted-foreground mb-2">Turmas em que você leciona:</p>
                ) : (
                  <>
                    {user?.role === 'admin' && (
                      <>
                        <Select value={selectedStateId} onValueChange={setSelectedStateId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Estado" />
                          </SelectTrigger>
                          <SelectContent>
                            {states.map((s) => (
                              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={selectedCityId} onValueChange={setSelectedCityId} disabled={!selectedStateId || loadingCities}>
                          <SelectTrigger className="mt-2">
                            <SelectValue placeholder="Município" />
                          </SelectTrigger>
                          <SelectContent>
                            {cities.map((c) => (
                              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </>
                    )}
                    <Select
                      value={selectedSchoolId}
                      onValueChange={(v) => { setSelectedSchoolId(v); setSelectedClassIds([]); }}
                      disabled={!effectiveCityId || loadingSchools || user?.role === 'professor'}
                    >
                      <SelectTrigger className="mt-2">
                        <SelectValue placeholder="Escola" />
                      </SelectTrigger>
                      <SelectContent>
                        {schools.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                )}
                <div className="mt-2">
                  <Label className="text-xs text-muted-foreground">Turmas (múltipla escolha)</Label>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {classes.map((cls) => {
                      const isSelected = selectedClassIds.includes(cls.id);
                      return (
                        <Button
                          key={cls.id}
                          type="button"
                          variant={isSelected ? 'default' : 'outline'}
                          size="sm"
                          onClick={() =>
                            setSelectedClassIds((prev) =>
                              isSelected ? prev.filter((x) => x !== cls.id) : [...prev, cls.id]
                            )
                          }
                        >
                          {cls.name}
                        </Button>
                      );
                    })}
                    {classes.length === 0 && (selectedSchoolId || user?.role === 'professor') && !loadingClasses && (
                      <span className="text-sm text-muted-foreground">Nenhuma turma encontrada</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* O que o aluno recebe + opções avançadas */}
        <Card className="overflow-hidden border-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">O que o aluno recebe?</CardTitle>
            <p className="text-sm text-muted-foreground">Escolha qual recompensa será liberada quando o aluno comprar este item.</p>
          </CardHeader>
          <CardContent className="space-y-6 pt-0">
            {category === 'frame' && (
              <div className="space-y-2">
                <Label>Qual moldura?</Label>
                <Select
                  value={FRAME_OPTIONS.some((o) => o.rewardData === rewardData) ? rewardData : ''}
                  onValueChange={(v) => {
                    setRewardType('frame');
                    setRewardData(v);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a moldura" />
                  </SelectTrigger>
                  <SelectContent>
                    {FRAME_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.rewardData}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">A moldura aparecerá na foto de perfil do aluno após a compra.</p>
              </div>
            )}

            {category === 'stamp' && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Qual selo?</Label>
                  <Select
                    value={rewardData === 'participation' || rewardData === 'highlight' ? rewardData : 'custom'}
                    onValueChange={(v) => {
                      setRewardType('stamp');
                      setRewardData(v === 'custom' ? '' : v);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o selo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="participation">Selo de participação</SelectItem>
                      <SelectItem value="highlight">Selo destaque</SelectItem>
                      <SelectItem value="custom">Outro (informe o identificador abaixo)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {rewardData !== 'participation' && rewardData !== 'highlight' && (
                  <div className="space-y-2">
                    <Label htmlFor="stampCustomId">Identificador do selo</Label>
                    <Input
                      id="stampCustomId"
                      value={rewardData}
                      onChange={(e) => { setRewardType('stamp'); setRewardData(e.target.value); }}
                      placeholder="Ex.: participacao, destaque"
                    />
                    <p className="text-xs text-muted-foreground">Código que identifica este selo no sistema.</p>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">O selo poderá ser exibido no perfil do aluno.</p>
              </div>
            )}

            {category === 'sidebar_theme' && (
              <div className="space-y-2">
                <Label>Qual tema do menu lateral?</Label>
                <Select
                  value={THEME_OPTIONS.some((o) => o.rewardData === rewardData) ? rewardData : ''}
                  onValueChange={(v) => {
                    setRewardType('sidebar_theme');
                    setRewardData(v);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tema" />
                  </SelectTrigger>
                  <SelectContent>
                    {THEME_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.rewardData}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">O aluno poderá aplicar esse tema na barra lateral após a compra.</p>
              </div>
            )}

            {category === 'physical' && (
              <div className="rounded-xl bg-muted/50 border p-4 space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label htmlFor="isPhysical" className="text-base font-medium">Entrega física</Label>
                    <p className="text-sm text-muted-foreground mt-0.5">Este item será entregue fora do sistema (brinde, prêmio real, etc.).</p>
                  </div>
                  <Switch id="isPhysical" checked={isPhysical} onCheckedChange={setIsPhysical} />
                </div>
              </div>
            )}

            {category !== 'physical' && (
              <div className="flex items-center justify-between gap-4 rounded-xl bg-muted/50 border p-4">
                <div>
                  <Label htmlFor="isPhysical" className="text-base font-medium">É um item físico?</Label>
                  <p className="text-sm text-muted-foreground mt-0.5">Marque se além da recompensa digital o aluno receberá algo físico.</p>
                </div>
                <Switch id="isPhysical" checked={isPhysical} onCheckedChange={setIsPhysical} />
              </div>
            )}

            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <div className="border-t pt-4">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between py-2 text-left text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <span>Para equipe técnica (valores internos)</span>
                    {advancedOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="space-y-4 pt-4">
                    <p className="text-xs text-muted-foreground">Só preencha se precisar informar um código diferente do que foi escolhido acima.</p>
                    <div className="space-y-2">
                      <Label htmlFor="rewardType">Tipo (código interno)</Label>
                      <Input
                        id="rewardType"
                        value={rewardType}
                        onChange={(e) => setRewardType(e.target.value)}
                        placeholder="Ex.: frame, stamp, sidebar_theme"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="rewardData">Valor (ID ou código)</Label>
                      <Input
                        id="rewardData"
                        value={rewardData}
                        onChange={(e) => setRewardData(e.target.value)}
                        placeholder="Ex.: gold, blue, participation"
                      />
                  </div>
                </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end pt-4">
          <Button type="button" variant="outline" onClick={() => navigate('/app/loja/gerenciar')} className="sm:min-w-[120px]">
            Cancelar
          </Button>
          <Button type="submit" disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90 sm:min-w-[180px]">
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : isEdit ? (
              'Salvar alterações'
            ) : (
              <>
                <ShoppingBag className="h-4 w-4 mr-2" />
                Criar item na loja
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
