import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/context/authContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlusCircle, Search, Trash2, Building, Loader2, GraduationCap, Settings, School, Users, FileDown, Printer } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import SchoolForm from "@/components/schools/SchoolForm";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Turmas from "@/pages/cadastros/Turmas";
import { InstituicaoUsersTab } from "@/components/schools/InstituicaoUsersTab";
import { getUserHierarchyContext } from "@/utils/userHierarchy";
import {
  generateUsersMunicipioCountsPdf,
  type ContactsByRole,
  type ReportSchoolClass,
  type UsersCountsReportResponse,
} from "@/utils/reports/usersMunicipioCountsPdf";
import {
  buildSchoolScopedUsersCountsReport,
  normalizeUsersCountsReport,
} from "@/utils/reports/usersCountsScope";

interface City {
  id: string;
  name: string;
  state: string;
}

interface CityWithSlug extends City {
  slug?: string;
}

interface Instituicao {
  id: string;
  name: string;
  address?: string;
  domain?: string;
  city_id?: string;
  city?: {
    id: string;
    name: string;
    state: string;
  };
  created_at?: string;
}

function normalizeSchoolWritePayload(
  instituicao: Partial<Instituicao>
): { name: string; address: string; city_id: string; domain?: string } {
  const domainRaw = instituicao.domain?.trim();
  const domain =
    domainRaw && domainRaw.length > 0 ? domainRaw.replace(/\/+$/, "") : undefined;
  return {
    name: instituicao.name!.trim(),
    address: instituicao.address!.trim(),
    city_id: instituicao.city_id!,
    ...(domain ? { domain } : {}),
  };
}

function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "response" in error) {
    const data = (error as { response?: { data?: Record<string, unknown> } }).response
      ?.data;
    if (data && typeof data === "object") {
      const cand = data.error ?? data.message ?? data.erro ?? data.detalhes ?? data.details;
      if (typeof cand === "string" && cand.trim()) return cand.trim();
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/** Respostas da API de alunos podem vir como array direto ou embrulhadas em `data` / `alunos`. */
function normalizeStudentsArrayResponse(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    for (const key of ["data", "alunos", "students"] as const) {
      const v = d[key];
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

interface Class {
  id: string;
  name: string;
  school_id: string;
  grade_id: string;
  grade?: {
    id: string;
    name: string;
  };
}

interface Teacher {
  id: string;
  name: string;
  email: string;
  registration?: string;
  birth_date?: string;
}

interface Student {
  id: string;
  name: string;
  registration?: string;
  birth_date?: string;
  user?: {
    email: string;
  };
}

interface CityUsersResponseRow {
  id?: string;
  name?: string;
  email?: string;
  role?: string;
}

interface SchoolScopeInfo {
  id: string;
  name: string;
}

interface ReportClassApiRow {
  id?: string;
  name?: string;
  shift?: string | null;
  grade?: string | {
    name?: string;
    education_stage?: { name?: string };
  };
}

interface ReportClassesApiResponse {
  data?: ReportClassApiRow[];
  classes?: ReportClassApiRow[];
  turmas?: ReportClassApiRow[];
}

interface LeadershipCounts {
  directors: number;
  coordinators: number;
}

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeRole(value: unknown): string {
  return cleanText(value).toLowerCase();
}

function safeCount(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stripControlChars(value: string): string {
  let out = "";
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    const isControl = (code >= 0 && code <= 31) || (code >= 127 && code <= 159);
    if (!isControl) out += ch;
  }
  return out;
}

function sanitizePersonName(value: unknown): string {
  const base = cleanText(value).normalize("NFKC");
  const noControl = stripControlChars(base);
  const noJunkPrefix = noControl.replace(/^[^\p{L}\p{N}]+/u, "");
  // Remove qualquer prefixo que não seja letra comum em nomes PT-BR (pega mojibake como Ÿ, Š etc.).
  const strictPrefix = noJunkPrefix.replace(/^[^A-Za-zÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç]+/u, "");
  const compact = strictPrefix.replace(/\s+/g, " ").trim();
  const allowedPortugueseUpper = /^[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]+$/u;

  // Remove tokens curtos e estranhos no início (ex.: "Ÿ HENRICK ...", "ŠŸ GUILHERME ...").
  let parts = compact.split(" ").filter(Boolean);
  while (parts.length >= 2) {
    const first = parts[0].replace(/[^A-Za-zÀ-ÿ]/g, "");
    const second = parts[1].replace(/[^A-Za-zÀ-ÿ]/g, "");
    const firstUpper = first.toUpperCase();
    const secondLooksLikeName = second.length >= 3 && /^[A-Za-zÀ-ÿ]/u.test(second);
    const firstLooksMojibake =
      first.length > 0 &&
      first.length <= 3 &&
      !allowedPortugueseUpper.test(firstUpper);
    if (firstLooksMojibake && secondLooksLikeName) {
      parts = parts.slice(1);
      continue;
    }
    break;
  }

  return parts.join(" ").trim();
}

function sanitizeEmail(value: unknown): string {
  const base = cleanText(value).normalize("NFKC");
  const noControlOrSpace = stripControlChars(base).replace(/\s+/g, "");
  const withoutPrefix = noControlOrSpace.replace(/^[^a-zA-Z0-9]+/, "");
  return withoutPrefix.replace(/[^a-zA-Z0-9._%+\-@]/g, "");
}

function isSchoolScopedExportRole(role: string | null | undefined): boolean {
  const normalized = normalizeRole(role);
  return normalized === "diretor" || normalized === "coordenador" || normalized === "professor";
}

function mergeLeadershipCountsIntoReport(
  report: UsersCountsReportResponse,
  leadershipBySchool: Map<string, LeadershipCounts>
): UsersCountsReportResponse {
  const bySchool = Array.isArray(report.by_school) ? report.by_school : [];
  const mergedBySchool = bySchool.map((row) => {
    const schoolId = cleanText(row.school_id);
    const leadership = schoolId ? leadershipBySchool.get(schoolId) : undefined;
    if (!leadership) return row;
    return {
      ...row,
      directors: leadership.directors,
      coordinators: leadership.coordinators,
    };
  });
  return {
    ...report,
    by_school: mergedBySchool,
  };
}

function applyUniqueTeacherContactCount(
  report: UsersCountsReportResponse,
  contacts: ContactsByRole
): UsersCountsReportResponse {
  const uniqueTeacherEmails = new Set(
    (contacts.professor ?? [])
      .map((contact) => sanitizeEmail(contact.email).toLocaleLowerCase("pt-BR"))
      .filter(Boolean)
  );
  if (uniqueTeacherEmails.size === 0) return report;

  return {
    ...report,
    general: {
      ...(report.general ?? {}),
      teachers: uniqueTeacherEmails.size,
    },
    by_school: Array.isArray(report.by_school)
      ? report.by_school.map((row) => ({
          ...row,
          teachers: uniqueTeacherEmails.size,
        }))
      : report.by_school,
  };
}

export default function Gestao() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [instituicoes, setInstituicoes] = useState<Instituicao[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedInstituicao, setSelectedInstituicao] = useState<Instituicao | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [instituicaoToDelete, setInstituicaoToDelete] = useState<Instituicao | null>(null);
  const [selectedInstituicaoForDetails, setSelectedInstituicaoForDetails] = useState<Instituicao | null>(null);
  
  // Estados para detalhes da instituição
  const [classes, setClasses] = useState<Class[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  
  // Estados para responsividade
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [sortBy, setSortBy] = useState<'name' | 'city' | 'domain'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  // Filtros: Estado, Município e Escola
  const [selectedState, setSelectedState] = useState<string>("ALL");
  const [selectedCityId, setSelectedCityId] = useState<string>("ALL");
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>("ALL");
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<string>(
    tabParam === "turmas" ? "turmas" : tabParam === "usuarios" ? "usuarios" : "instituicoes"
  );
  const [selectedUsersCityId, setSelectedUsersCityId] = useState<string>("");
  const [citiesWithSlug, setCitiesWithSlug] = useState<CityWithSlug[]>([]);
  /** Mantido sincronizado com o município do subdomínio / tenant (evita ReferenceError em HMR antigo). */
  const [, setDomainCityId] = useState<string>("");
  const [isExportingUsersReport, setIsExportingUsersReport] = useState(false);
  const [exportingSchoolId, setExportingSchoolId] = useState<string | null>(null);
  const [currentUserSchoolScope, setCurrentUserSchoolScope] = useState<SchoolScopeInfo | null>(null);
  const [selectedUserIdsForBatchDelete, setSelectedUserIdsForBatchDelete] = useState<Set<string>>(
    () => new Set()
  );
  /** Contagem de alunos por escola (`GET /students/school/:id`). */
  const [schoolStudentCounts, setSchoolStudentCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (tabParam === "turmas") setActiveTab("turmas");
    else if (tabParam === "usuarios") setActiveTab("usuarios");
  }, [tabParam]);

  const { toast } = useToast();

  const toggleUserSelectionForBatchDelete = useCallback((userId: string) => {
    setSelectedUserIdsForBatchDelete((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);

  const selectManyUsersForBatchDelete = useCallback((userIds: string[]) => {
    setSelectedUserIdsForBatchDelete((prev) => {
      const next = new Set(prev);
      for (const id of userIds) next.add(id);
      return next;
    });
  }, []);

  const clearUserSelectionForBatchDelete = useCallback(() => {
    setSelectedUserIdsForBatchDelete(new Set());
  }, []);

  const deleteUsersInBatch = useCallback(async (userIds: string[]) => {
    if (user.role !== "admin") return;
    const ids = userIds.map(String).filter(Boolean);
    if (ids.length === 0) return;

    try {
      await Promise.all(ids.map((id) => api.delete(`/users/${id}`)));
      toast({
        title: "Sucesso",
        description: ids.length === 1 ? "Usuário excluído com sucesso." : "Usuários excluídos com sucesso.",
      });
      clearUserSelectionForBatchDelete();
    } catch (error: unknown) {
      console.error("Erro ao excluir usuários em lote:", error);
      const msg =
        (error as { response?: { data?: { error?: string; message?: string } } })?.response?.data?.error ||
        (error as { response?: { data?: { error?: string; message?: string } } })?.response?.data?.message ||
        "Erro ao excluir usuários.";
      toast({ title: "Erro", description: msg, variant: "destructive" });
    }
  }, [user.role, toast, clearUserSelectionForBatchDelete]);

  // Buscar cidades com slug para detectar município do subdomínio
  useEffect(() => {
    api.get("/city/").then((res) => {
      let list = res.data || [];
      if (user.role !== "admin") {
        const scopedCityId = user.tenant_id ?? user.city_id;
        list = list.filter((c: CityWithSlug) => c.id === scopedCityId);
      }
      setCitiesWithSlug(Array.isArray(list) ? list : []);
    }).catch(() => setCitiesWithSlug([]));
  }, [user.role, user.tenant_id, user.city_id]);

  // Aba Usuários: município padrão pelo subdomínio ou pelo tenant/city do usuário
  useEffect(() => {
    if (typeof window === "undefined") return;
    const fallbackCityId = user.tenant_id ?? user.city_id ?? "";
    if (!citiesWithSlug.length) {
      setDomainCityId(fallbackCityId);
      if (fallbackCityId) setSelectedUsersCityId((prev) => prev || fallbackCityId);
      return;
    }
    const hostname = window.location.hostname;
    const parts = hostname.split(".");
    const first = (parts[0] || "").toLowerCase();
    const reserved = ["www", "localhost", "127", "app"];
    const isSubdomain = parts.length >= 2 && first && !reserved.includes(first);
    const subdomain = isSubdomain ? first : "";
    if (!subdomain) {
      setDomainCityId(fallbackCityId);
      if (fallbackCityId) setSelectedUsersCityId((prev) => prev || fallbackCityId);
      return;
    }
    const city = citiesWithSlug.find((c) => (c.slug || "").toLowerCase() === subdomain);
    if (city) {
      setDomainCityId(city.id);
      setSelectedUsersCityId(city.id);
    } else {
      setDomainCityId(fallbackCityId);
      if (fallbackCityId) {
        setSelectedUsersCityId((prev) => prev || fallbackCityId);
      }
    }
  }, [citiesWithSlug, user.tenant_id, user.city_id]);

  // Professor: definir município da escola como padrão na aba Usuários (evita "Nenhum município definido")
  useEffect(() => {
    if (user?.role !== "professor" || !user?.id) return;
    let cancelled = false;
    getUserHierarchyContext(user.id, user.role).then((ctx) => {
      if (cancelled) return;
      const cityId = ctx.municipality?.id ?? ctx.school?.municipality_id ?? "";
      if (cityId) {
        setSelectedUsersCityId((prev) => (prev ? prev : cityId));
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [user?.id, user?.role]);

  /** Município único no modal "Nova escola": subdomínio ou vínculo do usuário (tenant/city). */
  const lockedMunicipalityForNewSchool = useMemo(() => {
    if (typeof window === "undefined") return undefined;
    const hostname = window.location.hostname;
    const parts = hostname.split(".");
    const first = (parts[0] || "").toLowerCase();
    const reserved = ["www", "localhost", "127", "app"];
    const isSubdomain = parts.length >= 2 && Boolean(first) && !reserved.includes(first);
    const fallbackId = user.tenant_id ?? user.city_id ?? "";

    const fromListById = (id: string) => citiesWithSlug.find((x) => x.id === id) ?? null;

    if (isSubdomain) {
      const bySlug = citiesWithSlug.find((c) => (c.slug || "").toLowerCase() === first);
      if (bySlug) {
        return { id: bySlug.id, name: bySlug.name, state: bySlug.state };
      }
      if (fallbackId) {
        const hit = fromListById(fallbackId);
        if (hit) return { id: hit.id, name: hit.name, state: hit.state };
        return {
          id: fallbackId,
          name: first.replace(/-/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase()),
          state: "",
        };
      }
      return undefined;
    }

    if (fallbackId) {
      const hit = fromListById(fallbackId);
      if (hit) return { id: hit.id, name: hit.name, state: hit.state };
      return { id: fallbackId, name: "Município atual", state: "" };
    }
    return undefined;
  }, [citiesWithSlug, user.tenant_id, user.city_id]);

  const fetchInstituicoes = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await api.get("/school");
      const list: Instituicao[] = Array.isArray(response.data) ? response.data : [];
      setInstituicoes(list);

      const counts: Record<string, number> = {};
      const chunkSize = 8;
      for (let i = 0; i < list.length; i += chunkSize) {
        const slice = list.slice(i, i + chunkSize);
        const partial = await Promise.all(
          slice.map(async (inst) => {
            try {
              const res = await api.get(`/students/school/${inst.id}`);
              return [inst.id, normalizeStudentsArrayResponse(res.data).length] as const;
            } catch {
              return [inst.id, 0] as const;
            }
          })
        );
        for (const [id, n] of partial) counts[id] = n;
      }
      setSchoolStudentCounts(counts);
    } catch (error) {
      console.error("Erro ao buscar instituições:", error);
      toast({
        title: "Erro",
        description: "Erro ao carregar instituições",
        variant: "destructive",
      });
      setSchoolStudentCounts({});
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const fetchInstituicaoDetails = useCallback(async (schoolId: string) => {
    setIsLoadingDetails(true);
    try {
      // Buscar turmas
      const classesResponse = await api.get(`/classes/school/${schoolId}`);
      setClasses(classesResponse.data || []);

      // Buscar professores
      const teachersResponse = await api.get(`/teacher/school/${schoolId}`);
      setTeachers(Array.isArray(teachersResponse.data) ? teachersResponse.data : []);

      // Buscar alunos
      const studentsResponse = await api.get(`/students/school/${schoolId}`);
      setStudents(studentsResponse.data || []);
    } catch (error) {
      console.error("Erro ao buscar detalhes da instituição:", error);
      toast({
        title: "Erro",
        description: user.role === 'professor' 
          ? "Erro ao carregar detalhes da sua instituição" 
          : "Erro ao carregar detalhes da instituição",
        variant: "destructive",
      });
    } finally {
      setIsLoadingDetails(false);
    }
  }, [toast, user.role]);

  useEffect(() => {
    fetchInstituicoes();
  }, [fetchInstituicoes]);

  useEffect(() => {
    if (selectedInstituicaoForDetails) {
      fetchInstituicaoDetails(selectedInstituicaoForDetails.id);
    }
  }, [selectedInstituicaoForDetails, fetchInstituicaoDetails]);

  const handleSaveInstituicao = async (instituicao: Partial<Instituicao>) => {
    setIsSaving(true);
    try {
      if (!instituicao.name?.trim() || !instituicao.address?.trim() || !instituicao.city_id) {
        toast({
          title: "Campos obrigatórios",
          description: "Informe nome, endereço e município antes de salvar.",
          variant: "destructive",
        });
        setIsSaving(false);
        return;
      }

      if (selectedInstituicao) {
        // SchoolForm já persiste com PUT; apenas sincroniza estado local (evita 2º PUT com objeto `city`).
        const payload = normalizeSchoolWritePayload(instituicao);
        setInstituicoes(
          instituicoes.map((i) =>
            i.id === selectedInstituicao.id
              ? {
                  ...i,
                  ...payload,
                  city: instituicao.city ?? i.city,
                }
              : i
          )
        );
        toast({
          title: "Sucesso",
          description: "Instituição atualizada com sucesso",
        });
      } else {
        await api.post("/school", normalizeSchoolWritePayload(instituicao));
        await fetchInstituicoes(); // Recarrega a lista completa
        toast({
          title: "Sucesso",
          description: "Instituição criada com sucesso",
        });
      }
      setIsAddDialogOpen(false);
      setSelectedInstituicao(null);
    } catch (error: unknown) {
      console.error("Erro ao salvar instituição:", error);
      let errorMessage = getApiErrorMessage(error, "Erro ao salvar instituição");

      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as { response?: { data?: { campos_faltantes?: string[] } } };
        if (axiosError.response?.data?.campos_faltantes) {
          const campos = axiosError.response.data.campos_faltantes.join(", ");
          errorMessage = `Campos obrigatórios faltando: ${campos}`;
        }
      }

      toast({
        title: "Erro",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteInstituicao = async (instituicaoId: string) => {
    setIsDeleting(true);
    try {
      await api.delete(`/school/${instituicaoId}`);
      await fetchInstituicoes(); // Recarrega a lista completa
      setInstituicaoToDelete(null);
      setIsDeleteDialogOpen(false);
      toast({
        title: "Sucesso",
        description: "Instituição excluída com sucesso",
      });
    } catch (error: unknown) {
      console.error("Erro ao excluir instituição:", error);
      
      let errorTitle = "Erro ao excluir";
      let errorMessage = "Ocorreu um erro ao excluir a instituição";

      // Verificar se é um erro do Axios com resposta
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as { 
          response?: { 
            status?: number;
            data?: { 
              mensagem?: string; 
              erro?: string;
              dependencias?: {
                turmas?: number;
                professores?: number;
                alunos?: number;
              }
            } 
          } 
        };
        
        if (axiosError.response?.data) {
          const data = axiosError.response.data;
          
          // Se houver mensagem específica do backend, usar ela
          if (data.mensagem) {
            errorMessage = data.mensagem;
            errorTitle = data.erro || "Não é possível excluir";
          } else if (data.erro) {
            errorMessage = data.erro;
          }
        }
      }

      toast({
        title: errorTitle,
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleViewInstituicao = (instituicaoId: string) => {
    navigate(`/app/escola/${instituicaoId}`);
  };

  const handleManageDetails = (instituicao: Instituicao) => {
    setSelectedInstituicaoForDetails(instituicao);
  };

  const handleTeacherAdded = () => {
    if (selectedInstituicaoForDetails) {
      fetchInstituicaoDetails(selectedInstituicaoForDetails.id);
    }
  };

  const handleStudentAdded = () => {
    if (selectedInstituicaoForDetails) {
      fetchInstituicaoDetails(selectedInstituicaoForDetails.id);
    }
  };

  // Função para ordenar instituições
  const sortInstituicoes = (data: Instituicao[]) => {
    return [...data].sort((a, b) => {
      let aValue = '';
      let bValue = '';

      switch (sortBy) {
        case 'name':
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case 'city':
          aValue = (a.city?.name || '').toLowerCase();
          bValue = (b.city?.name || '').toLowerCase();
          break;
        case 'domain':
          aValue = (a.domain || '').toLowerCase();
          bValue = (b.domain || '').toLowerCase();
          break;
        default:
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
      }

      if (sortOrder === 'asc') {
        return aValue.localeCompare(bValue);
      } else {
        return bValue.localeCompare(aValue);
      }
    });
  };

  // Opções disponíveis para filtros
  const availableStates: string[] = Array.from(
    new Set(
      instituicoes
        .map((i) => i.city?.state)
        .filter((s): s is string => Boolean(s))
    )
  ).sort();

  const availableCities: City[] = (() => {
    const map = new Map<string, City>();
    for (const inst of instituicoes) {
      if (inst.city && (selectedState === 'ALL' || inst.city.state === selectedState)) {
        map.set(inst.city.id, inst.city);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  })();

  const effectiveUsersCityId =
    user.role === "tecadm"
      ? (user.tenant_id ?? user.city_id ?? "")
      : (selectedUsersCityId || user.tenant_id || user.city_id || "");

  const resolveCurrentUserSchoolScope = useCallback(
    async (cityId: string): Promise<SchoolScopeInfo | null> => {
      if (!isSchoolScopedExportRole(user.role) || !user.id || !cityId) return null;
      if (normalizeRole(user.role) === "professor") {
        try {
          const ctx = await getUserHierarchyContext(user.id, user.role);
          const schoolId = cleanText(ctx?.school?.id);
          if (schoolId) {
            return {
              id: schoolId,
              name: cleanText(ctx?.school?.name) || "Escola",
            };
          }
        } catch (error) {
          console.warn("Não foi possível resolver escola do professor:", error);
        }
      }
      try {
        const res = await api.get(`/managers/city/${cityId}`);
        const list = Array.isArray(res.data) ? res.data : res.data?.managers ?? [];
        const mine = list.find(
          (item: { user?: { id?: string }; school?: { id?: string; name?: string; nome?: string } }) =>
            item?.user?.id === user.id && item?.school?.id
        );
        if (mine?.school?.id) {
          return {
            id: String(mine.school.id),
            name: String(mine.school.name ?? mine.school.nome ?? "Escola"),
          };
        }
      } catch (error) {
        console.warn("Não foi possível resolver escola do gestor por cidade:", error);
      }
      try {
        const res = await api.get("/managers");
        const list = Array.isArray(res.data) ? res.data : res.data?.managers ?? [];
        const mine = list.find(
          (item: { user?: { id?: string }; school?: { id?: string; name?: string; nome?: string } }) =>
            item?.user?.id === user.id && item?.school?.id
        );
        if (mine?.school?.id) {
          return {
            id: String(mine.school.id),
            name: String(mine.school.name ?? mine.school.nome ?? "Escola"),
          };
        }
      } catch (error) {
        console.warn("Não foi possível resolver escola do gestor em fallback:", error);
      }
      return null;
    },
    [user.id, user.role]
  );

  const fetchLeadershipCountsBySchool = useCallback(
    async (cityId: string): Promise<Map<string, LeadershipCounts>> => {
      const map = new Map<string, LeadershipCounts>();
      if (!cityId) return map;
      try {
        const res = await api.get(`/managers/city/${cityId}`);
        const list = Array.isArray(res.data) ? res.data : res.data?.managers ?? [];
        for (const item of list) {
          const schoolId = cleanText(item?.school?.id);
          if (!schoolId) continue;
          const role = normalizeRole(item?.user?.role);
          const prev = map.get(schoolId) ?? { directors: 0, coordinators: 0 };
          if (role === "diretor") prev.directors += 1;
          if (role === "coordenador") prev.coordinators += 1;
          map.set(schoolId, prev);
        }
      } catch (error) {
        console.warn("Não foi possível complementar contagem de diretores/coordenadores por escola:", error);
      }
      return map;
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    if (!isSchoolScopedExportRole(user.role)) {
      setCurrentUserSchoolScope(null);
      return;
    }
    if (!effectiveUsersCityId) return;
    resolveCurrentUserSchoolScope(effectiveUsersCityId)
      .then((scope) => {
        if (!cancelled) setCurrentUserSchoolScope(scope);
      })
      .catch(() => {
        if (!cancelled) setCurrentUserSchoolScope(null);
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveUsersCityId, resolveCurrentUserSchoolScope, user.role]);

  const fetchContactsByRoleForSchool = useCallback(
    async (cityId: string, schoolId: string): Promise<ContactsByRole> => {
      const contacts: ContactsByRole = {
        diretor: [],
        coordenador: [],
        professor: [],
        aluno: [],
      };
      const pushContact = (role: keyof ContactsByRole, name: string, email: string) => {
        if (!contacts[role]) contacts[role] = [];
        const normalizedEmail = email.toLocaleLowerCase("pt-BR");
        const exists = contacts[role]!.some(
          (item) => item.email.toLocaleLowerCase("pt-BR") === normalizedEmail
        );
        if (!exists) contacts[role]!.push({ name, email });
      };

      // Otimização: usar endpoints por escola para reduzir payload.
      const [usersRes, managersRes, studentsRes, teachersRes, schoolTeachersRes] = await Promise.all([
        api.get(`/city/${cityId}/users`),
        api.get(`/managers/city/${cityId}`).catch(() => ({ data: [] })),
        api.get(`/students/school/${schoolId}`).catch(() => ({ data: [] })),
        api.get(`/teacher/school/${schoolId}`).catch(() => ({ data: [] })),
        api.get("/school-teacher").catch(() => ({ data: { vinculos: [] } })),
      ]);

      const cityUsers = Array.isArray(usersRes.data?.users) ? usersRes.data.users : [];
      const baseUsers = cityUsers.map((u: CityUsersResponseRow) => ({
        id: cleanText(u.id),
        name: sanitizePersonName(u.name),
        email: sanitizeEmail(u.email),
        role: normalizeRole(u.role),
      }));
      const userById = new Map<
        string,
        { id: string; name: string; email: string; role: string }
      >(baseUsers.map((u) => [u.id, u] as const));

      const managerSchoolMap = new Map<string, string>();
      const managersList = Array.isArray(managersRes.data) ? managersRes.data : managersRes.data?.managers ?? [];
      for (const item of managersList) {
        const uid = cleanText(item?.user?.id);
        const sid = cleanText(item?.school?.id);
        if (uid && sid) managerSchoolMap.set(uid, sid);
      }

      const studentSchoolMap = new Map<string, string>();
      const studentHierarchyMap = new Map<string, { gradeName?: string; className?: string }>();
      const studentsList = Array.isArray(studentsRes.data)
        ? studentsRes.data
        : studentsRes.data?.data ?? studentsRes.data?.alunos ?? studentsRes.data?.students ?? [];
      for (const item of studentsList) {
        const sid = cleanText(item?.school?.id ?? schoolId);
        const schoolCityId = cleanText(item?.school?.city_id);
        if (!sid || sid !== schoolId) continue;
        if (schoolCityId && schoolCityId !== cityId) continue;
        const gradeName = cleanText(
          item?.grade?.name ??
            item?.serie?.name ??
            item?.grade_name ??
            item?.serie_nome ??
            item?.series_name
        );
        const className = cleanText(
          item?.class?.name ??
            item?.turma?.name ??
            item?.class_name ??
            item?.turma_nome
        );
        const uid = cleanText(item?.user_id ?? item?.usuario_id ?? item?.user?.id);
        if (uid) {
          studentSchoolMap.set(uid, sid);
          studentHierarchyMap.set(uid, {
            gradeName: gradeName || undefined,
            className: className || undefined,
          });
        }
        const fallbackName = cleanText(item?.name ?? item?.nome);
        const fallbackEmail = sanitizeEmail(item?.user?.email ?? item?.email);
        if (fallbackName && fallbackEmail && !uid) {
          if (!contacts.aluno) contacts.aluno = [];
          const already = contacts.aluno.some((c) => c.email === fallbackEmail);
          if (!already) {
            contacts.aluno.push({
              name: sanitizePersonName(fallbackName),
              email: fallbackEmail,
              gradeName: gradeName || undefined,
              className: className || undefined,
            });
          }
        }
      }

      const teacherUserIds = new Set<string>();
      const teachersFromSchoolEndpoint = Array.isArray(teachersRes.data)
        ? teachersRes.data
        : teachersRes.data?.data ??
          teachersRes.data?.professores ??
          teachersRes.data?.teachers ??
          [];
      const schoolTeacherLinks = Array.isArray(schoolTeachersRes.data?.vinculos)
        ? schoolTeachersRes.data.vinculos.filter(
            (item: { school_id?: unknown; school?: { id?: unknown } }) =>
              cleanText(item?.school_id ?? item?.school?.id) === schoolId
          )
        : [];
      const teachersList = [...teachersFromSchoolEndpoint, ...schoolTeacherLinks];
      for (const item of teachersList) {
        const teacherData = item?.professor ?? item?.teacher ?? item;
        const teacherUser = item?.usuario ?? teacherData?.user ?? item?.user;
        const uid = cleanText(
          teacherData?.user_id ??
            item?.user_id ??
            item?.usuario_id ??
            teacherUser?.id
        );
        if (uid) teacherUserIds.add(uid);
        const fallbackName = sanitizePersonName(
          teacherData?.name ??
            teacherData?.nome ??
            teacherUser?.name ??
            teacherUser?.nome
        );
        const fallbackEmail = sanitizeEmail(
          teacherData?.email ??
            teacherUser?.email ??
            item?.email
        );
        if (fallbackName && fallbackEmail) {
          pushContact("professor", fallbackName, fallbackEmail);
        }
      }

      for (const userRow of baseUsers) {
        const role = userRow.role;
        if (!userRow.id || !userRow.email || !userRow.name) continue;
        if (role === "diretor" || role === "coordenador") {
          if (managerSchoolMap.get(userRow.id) !== schoolId) continue;
          pushContact(role, sanitizePersonName(userRow.name), sanitizeEmail(userRow.email));
        } else if (role === "professor") {
          if (!teacherUserIds.has(userRow.id)) continue;
          pushContact("professor", sanitizePersonName(userRow.name), sanitizeEmail(userRow.email));
        } else if (role === "aluno") {
          if (studentSchoolMap.get(userRow.id) !== schoolId) continue;
          const hierarchy = studentHierarchyMap.get(userRow.id);
          if (!contacts.aluno) contacts.aluno = [];
          const already = contacts.aluno.some(
            (item) =>
              item.email === userRow.email ||
              (item.name === userRow.name &&
                (item.gradeName ?? "") === (hierarchy?.gradeName ?? "") &&
                (item.className ?? "") === (hierarchy?.className ?? ""))
          );
          if (!already) {
            contacts.aluno.push({
              name: sanitizePersonName(userRow.name),
              email: sanitizeEmail(userRow.email),
              gradeName: hierarchy?.gradeName,
              className: hierarchy?.className,
            });
          }
        }
      }

      // Fallback para alunos/professores vindos no endpoint da escola sem user_id, mas presentes em city users por e-mail.
      for (const contactRole of ["professor", "aluno"] as const) {
        const list = contacts[contactRole] ?? [];
        for (const item of list) {
          if (!item.email) continue;
          const existing = baseUsers.find((u) => u.email.toLowerCase() === item.email.toLowerCase());
          if (!existing) continue;
          const alreadyById = userById.get(existing.id);
          if (alreadyById) {
            item.name = item.name || alreadyById.name;
          }
        }
      }

      return contacts;
    },
    []
  );

  const fetchSchoolClassesForReport = useCallback(
    async (
      schoolId: string,
      report: UsersCountsReportResponse
    ): Promise<ReportSchoolClass[]> => {
      const response = await api.get<ReportClassApiRow[] | ReportClassesApiResponse>(
        `/classes/school/${schoolId}`
      );
      const payload = response.data;
      const apiClasses = Array.isArray(payload)
        ? payload
        : payload?.data ?? payload?.classes ?? payload?.turmas ?? [];
      const countRows = Array.isArray(report.by_class) ? report.by_class : [];
      const usedCountRows = new Set<number>();

      const result: ReportSchoolClass[] = apiClasses.map((item) => {
        const classId = cleanText(item.id);
        const className = cleanText(item.name);
        const gradeName =
          typeof item.grade === "object" && item.grade !== null
            ? cleanText(item.grade.name)
            : cleanText(item.grade);
        const countIndex = countRows.findIndex((row, index) => {
          if (usedCountRows.has(index)) return false;
          const rowId = cleanText(row.class_id);
          if (classId && rowId) return classId === rowId;
          return (
            cleanText(row.class_name).toLocaleLowerCase("pt-BR") ===
              className.toLocaleLowerCase("pt-BR") &&
            cleanText(row.grade_name).toLocaleLowerCase("pt-BR") ===
              gradeName.toLocaleLowerCase("pt-BR")
          );
        });
        const countRow = countIndex >= 0 ? countRows[countIndex] : undefined;
        if (countIndex >= 0) usedCountRows.add(countIndex);

        return {
          id: classId || undefined,
          name: className || cleanText(countRow?.class_name) || "Turma não informada",
          gradeName: gradeName || cleanText(countRow?.grade_name) || undefined,
          educationStageName:
            typeof item.grade === "object" && item.grade !== null
              ? cleanText(item.grade.education_stage?.name) || undefined
              : undefined,
          shift: item.shift,
          students: safeCount(countRow?.students),
          teachers: safeCount(countRow?.teachers),
        };
      });

      countRows.forEach((row, index) => {
        if (usedCountRows.has(index)) return;
        result.push({
          id: cleanText(row.class_id) || undefined,
          name: cleanText(row.class_name) || "Turma não informada",
          gradeName: cleanText(row.grade_name) || undefined,
          students: safeCount(row.students),
          teachers: safeCount(row.teachers),
        });
      });

      return result;
    },
    []
  );

  const handleExportUsersMunicipioReport = useCallback(async () => {
    if (!effectiveUsersCityId) {
      toast({
        title: "Município não definido",
        description: "Selecione um município para exportar o relatório.",
        variant: "destructive",
      });
      return;
    }

    const cityFromList =
      (citiesWithSlug.length ? citiesWithSlug : availableCities).find((c) => c.id === effectiveUsersCityId) ??
      null;
    const cityName = cityFromList?.name ?? "Município";

    setIsExportingUsersReport(true);
    try {
      const [res, leadershipBySchool] = await Promise.all([
        api.get<UsersCountsReportResponse>("/reports/users/counts", {
          meta: { cityId: effectiveUsersCityId },
        }),
        fetchLeadershipCountsBySchool(effectiveUsersCityId),
      ]);
      const reportWithLeadership = mergeLeadershipCountsIntoReport(res.data ?? {}, leadershipBySchool);
      const normalizedReport = normalizeUsersCountsReport(reportWithLeadership);
      const schoolScope =
        isSchoolScopedExportRole(user.role)
          ? (currentUserSchoolScope ?? (await resolveCurrentUserSchoolScope(effectiveUsersCityId)))
          : null;
      if (isSchoolScopedExportRole(user.role) && !schoolScope) {
        toast({
          title: "Escola não identificada",
          description: "Não foi possível identificar a sua escola para exportar o relatório.",
          variant: "destructive",
        });
        return;
      }
      const finalReport = schoolScope
        ? buildSchoolScopedUsersCountsReport(normalizedReport, schoolScope.id, schoolScope.name)
        : normalizedReport;
      const [contactsByRole, schoolClasses] = schoolScope
        ? await Promise.all([
            fetchContactsByRoleForSchool(effectiveUsersCityId, schoolScope.id),
            fetchSchoolClassesForReport(schoolScope.id, finalReport),
          ])
        : [undefined, undefined];
      const reportForPdf =
        schoolScope && contactsByRole
          ? applyUniqueTeacherContactCount(finalReport, contactsByRole)
          : finalReport;
      await generateUsersMunicipioCountsPdf({
        cityId: effectiveUsersCityId,
        cityName,
        report: reportForPdf,
        scope: schoolScope
          ? { type: "school", schoolName: schoolScope.name }
          : { type: "city" },
        contactsByRole,
        schoolClasses,
      });
      toast({ title: "Relatório exportado", description: "PDF gerado com sucesso." });
    } catch (error) {
      console.error("Erro ao exportar relatório de usuários:", error);
      toast({
        title: "Erro",
        description: "Não foi possível gerar o relatório de usuários.",
        variant: "destructive",
      });
    } finally {
      setIsExportingUsersReport(false);
    }
  }, [
    availableCities,
    citiesWithSlug,
    currentUserSchoolScope,
    effectiveUsersCityId,
    fetchContactsByRoleForSchool,
    fetchLeadershipCountsBySchool,
    fetchSchoolClassesForReport,
    resolveCurrentUserSchoolScope,
    toast,
    user.role,
  ]);

  const canExportSchoolSummary = user.role === "admin" || user.role === "tecadm" || isSchoolScopedExportRole(user.role);
  const canExportSchoolByRole = useCallback(
    (schoolId: string): boolean => {
      if (!canExportSchoolSummary) return false;
      if (!isSchoolScopedExportRole(user.role)) return true;
      return Boolean(currentUserSchoolScope?.id && currentUserSchoolScope.id === schoolId);
    },
    [canExportSchoolSummary, currentUserSchoolScope?.id, user.role]
  );

  const handleExportSchoolUsersSummary = useCallback(
    async (school: Instituicao) => {
      const schoolId = cleanText(school.id);
      const cityId = cleanText(school.city_id || school.city?.id || effectiveUsersCityId);
      if (!schoolId || !cityId) {
        toast({
          title: "Dados insuficientes",
          description: "Não foi possível identificar escola e município para exportação.",
          variant: "destructive",
        });
        return;
      }
      if (!canExportSchoolByRole(schoolId)) {
        toast({
          title: "Acesso restrito",
          description: "Você só pode exportar o resumo da sua própria escola.",
          variant: "destructive",
        });
        return;
      }
      setExportingSchoolId(schoolId);
      try {
        const [countsRes, contactsByRole, leadershipBySchool] = await Promise.all([
          api.get<UsersCountsReportResponse>("/reports/users/counts", { meta: { cityId } }),
          fetchContactsByRoleForSchool(cityId, schoolId),
          fetchLeadershipCountsBySchool(cityId),
        ]);
        const reportWithLeadership = mergeLeadershipCountsIntoReport(countsRes.data ?? {}, leadershipBySchool);
        const normalized = normalizeUsersCountsReport(reportWithLeadership);
        const scoped = buildSchoolScopedUsersCountsReport(normalized, schoolId, school.name);
        const schoolClasses = await fetchSchoolClassesForReport(schoolId, scoped);
        const reportForPdf = applyUniqueTeacherContactCount(scoped, contactsByRole);
        await generateUsersMunicipioCountsPdf({
          cityId,
          cityName: school.city?.name ?? "Município",
          report: reportForPdf,
          scope: { type: "school", schoolName: school.name },
          contactsByRole,
          schoolClasses,
        });
        toast({ title: "Resumo exportado", description: `PDF da escola ${school.name} gerado com sucesso.` });
      } catch (error) {
        console.error("Erro ao exportar resumo por escola:", error);
        toast({
          title: "Erro",
          description: "Não foi possível gerar o resumo de usuários por escola.",
          variant: "destructive",
        });
      } finally {
        setExportingSchoolId(null);
      }
    },
    [
      canExportSchoolByRole,
      effectiveUsersCityId,
      fetchContactsByRoleForSchool,
      fetchLeadershipCountsBySchool,
      fetchSchoolClassesForReport,
      toast,
    ]
  );

  const availableSchools: Instituicao[] = instituicoes
    .filter((i) => (selectedState === 'ALL' || i.city?.state === selectedState))
    .filter((i) => (selectedCityId === 'ALL' || i.city_id === selectedCityId))
    .sort((a, b) => a.name.localeCompare(b.name));

  const filteredAndSortedInstituicoes = sortInstituicoes(
    instituicoes
      .filter((instituicao) =>
        instituicao.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (instituicao.address || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (instituicao.domain || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (instituicao.city?.name || "").toLowerCase().includes(searchTerm.toLowerCase())
      )
      .filter((i) => (selectedState === 'ALL' || i.city?.state === selectedState))
      .filter((i) => (selectedCityId === 'ALL' || i.city_id === selectedCityId))
      .filter((i) => (selectedSchoolId === 'ALL' || i.id === selectedSchoolId))
  );

  if (isLoading) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <Skeleton className="h-9 w-64 mb-2" />
            <Skeleton className="h-5 w-48" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <Skeleton className="h-10 w-full sm:w-64" />
          <Skeleton className="h-10 w-24" />
        </div>

        <div className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, index) => (
            <Card key={index} className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-4" />
                  <Skeleton className="h-4 w-16" />
                </div>
                <Skeleton className="h-6 w-12" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-4 w-24" />
                  <div className="flex flex-wrap gap-2 mt-4">
                    <Skeleton className="h-8 w-16" />
                    <Skeleton className="h-8 w-16" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header unificado — mobile: título/desc alinhados */}
      <div className="space-y-1.5">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex flex-wrap items-center gap-2 sm:gap-3">
          <School className="w-7 h-7 sm:w-8 sm:h-8 text-primary shrink-0" />
          Gestão Escolar
        </h1>
        <p className="text-muted-foreground text-sm sm:text-base max-w-2xl">
          Gerencie escolas, turmas e usuários (alunos, professores, diretores e coordenadores) em um só lugar.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-2xl grid-cols-3 h-11 bg-muted/50">
          <TabsTrigger value="instituicoes" className="flex items-center gap-2">
            <Building className="h-4 w-4" />
            <span className="hidden sm:inline">Escolas</span>
          </TabsTrigger>
          <TabsTrigger value="turmas" className="flex items-center gap-2">
            <GraduationCap className="h-4 w-4" />
            <span className="hidden sm:inline">Turmas</span>
          </TabsTrigger>
          <TabsTrigger value="usuarios" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Usuários</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="instituicoes" className="space-y-6 mt-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <p className="text-muted-foreground text-sm">
              Liste as instituições de ensino, filtre por estado e município e acesse o gerenciamento completo em &quot;Gerenciar&quot;.
            </p>
            {(user.role === 'admin' || user.role === 'tecadm') && (
              <Button onClick={() => setIsAddDialogOpen(true)} className="w-full sm:w-auto shrink-0">
                <PlusCircle className="h-4 w-4 mr-2" />
                Nova Instituição
              </Button>
            )}
          </div>

      {/* Search and Filters */}
      <div className="space-y-3 sm:space-y-4">
        {/* Search Bar */}
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar instituições por nome, cidade ou domínio..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 h-11"
          />
        </div>

        {/* Filters Row */}
        <div className="flex flex-col lg:flex-row gap-3">
          {/* Location Filters */}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 flex-1">
            <Select
              value={selectedState}
              onValueChange={(value) => {
                setSelectedState(value);
                setSelectedCityId('ALL');
                setSelectedSchoolId('ALL');
              }}
            >
              <SelectTrigger className="h-10 w-full sm:w-auto sm:min-w-[140px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos os Estados</SelectItem>
                {availableStates.map((state) => (
                  <SelectItem key={state} value={state}>{state}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={selectedCityId}
              onValueChange={(value) => {
                setSelectedCityId(value);
                setSelectedSchoolId('ALL');
              }}
              disabled={availableCities.length === 0}
            >
              <SelectTrigger className="h-10 w-full sm:w-auto sm:min-w-[160px]">
                <SelectValue placeholder="Município" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos os Municípios</SelectItem>
                {availableCities.map((city) => (
                  <SelectItem key={city.id} value={city.id}>{city.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={selectedSchoolId}
              onValueChange={(value) => setSelectedSchoolId(value)}
              disabled={availableSchools.length === 0}
            >
              <SelectTrigger className="h-10 w-full sm:w-auto sm:min-w-[160px]">
                <SelectValue placeholder="Escola" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todas as Escolas</SelectItem>
                {availableSchools.map((sch) => (
                  <SelectItem key={sch.id} value={sch.id}>{sch.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Sort and View Options */}
          <div className="flex flex-wrap gap-2 sm:gap-3">
            <Select value={sortBy} onValueChange={(value: 'name' | 'city' | 'domain') => setSortBy(value)}>
              <SelectTrigger className="h-10 w-auto min-w-[140px]">
                <SelectValue placeholder="Ordenar por" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Nome</SelectItem>
                <SelectItem value="city">Cidade</SelectItem>
                <SelectItem value="domain">Domínio</SelectItem>
              </SelectContent>
            </Select>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className="h-10 w-10 p-0 flex-shrink-0"
              title={sortOrder === 'asc' ? 'Ordenação Crescente' : 'Ordenação Decrescente'}
            >
              {sortOrder === 'asc' ? '↑' : '↓'}
            </Button>
            
            <Button
              variant="outline"
              onClick={() => setViewMode(viewMode === 'cards' ? 'table' : 'cards')}
              className="h-10 px-4"
            >
              {viewMode === 'cards' ? 'Tabela' : 'Cards'}
            </Button>
            
            <Button
              variant="outline"
              onClick={fetchInstituicoes}
              disabled={isLoading}
              className="h-10 px-4"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Atualizar"
              )}
            </Button>
          </div>
        </div>
      </div>

             {/* Content */}
       <div className="space-y-4">
          {/* View Mode Toggle */}
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              {filteredAndSortedInstituicoes.length} {filteredAndSortedInstituicoes.length === 1 ? 'instituição encontrada' : 'instituições encontradas'}
            </p>
          </div>

          {/* Cards View */}
                     {viewMode === 'cards' && (
             <div className="grid gap-6 sm:gap-8 md:grid-cols-2 lg:grid-cols-3">
              {filteredAndSortedInstituicoes.map((instituicao) => (
                                 <Card key={instituicao.id} className="hover:shadow-lg transition-all duration-200 hover:scale-[1.02]">
                   <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                     <CardTitle className="text-base md:text-lg font-semibold flex items-start gap-2 min-w-0 flex-1">
                       <Building className="h-4 w-4 md:h-5 md:w-5 text-orange-600 flex-shrink-0 mt-0.5" />
                       <span className="break-words">{instituicao.name}</span>
                     </CardTitle>
                     <Badge variant="default" className="text-xs flex-shrink-0 ml-2">
                       Ativa
                     </Badge>
                   </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs md:text-sm text-muted-foreground">
                          {instituicao.city?.name ? `${instituicao.city.name} - ${instituicao.city.state}` : "Localização não definida"}
                        </p>
                        {instituicao.domain && (
                          <p className="text-xs md:text-sm text-muted-foreground">
                            Domínio: {instituicao.domain}
                          </p>
                        )}
                        <p className="text-xs md:text-sm text-muted-foreground flex items-center gap-1.5 pt-0.5">
                          <Users className="h-3.5 w-3.5 shrink-0 text-primary/80" aria-hidden />
                          <span>
                            Alunos:{" "}
                            <span className="font-medium text-foreground tabular-nums">
                              {schoolStudentCounts[instituicao.id] ?? "—"}
                            </span>
                          </span>
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1 md:gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleViewInstituicao(instituicao.id)}
                          className="text-xs h-7 md:h-8"
                        >
                                                     <Settings className="h-3 w-3 mr-1" />
                           <span className="hidden sm:inline">Gerenciar</span>
                        </Button>

                        {canExportSchoolByRole(instituicao.id) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleExportSchoolUsersSummary(instituicao)}
                            disabled={exportingSchoolId === instituicao.id}
                            className="text-xs h-7 md:h-8"
                          >
                            {exportingSchoolId === instituicao.id ? (
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : (
                              <Printer className="h-3 w-3 mr-1" />
                            )}
                            <span className="hidden sm:inline">Imprimir relatório</span>
                          </Button>
                        )}

                        {user.role === 'admin' && (
                          <>

                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => {
                                setInstituicaoToDelete(instituicao);
                                setIsDeleteDialogOpen(true);
                              }}
                              className="text-xs h-7 md:h-8 text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-3 w-3 mr-1" />
                              <span className="hidden sm:inline">Excluir</span>
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Table View */}
          {viewMode === 'table' && (
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Instituição</TableHead>
                      <TableHead>Cidade</TableHead>
                      <TableHead>Domínio</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Alunos</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAndSortedInstituicoes.map((instituicao) => (
                      <TableRow key={instituicao.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Building className="h-4 w-4 text-orange-600" />
                            {instituicao.name}
                          </div>
                        </TableCell>
                        <TableCell>
                          {instituicao.city?.name ? `${instituicao.city.name} - ${instituicao.city.state}` : "-"}
                        </TableCell>
                        <TableCell>{instituicao.domain || "-"}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {schoolStudentCounts[instituicao.id] ?? "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                                                         <Button 
                               variant="outline" 
                               size="sm"
                               onClick={() => handleViewInstituicao(instituicao.id)}
                             >
                               <Settings className="h-3 w-3" />
                             </Button>

                            {canExportSchoolByRole(instituicao.id) && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleExportSchoolUsersSummary(instituicao)}
                                disabled={exportingSchoolId === instituicao.id}
                                title="Imprimir relatório de usuários da escola"
                              >
                                {exportingSchoolId === instituicao.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Printer className="h-3 w-3" />
                                )}
                              </Button>
                            )}

                            {user.role === 'admin' && (
                              <>

                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => {
                                    setInstituicaoToDelete(instituicao);
                                    setIsDeleteDialogOpen(true);
                                  }}
                                  className="text-red-600 hover:text-red-700"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Empty State */}
          {filteredAndSortedInstituicoes.length === 0 && !isLoading && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-10">
                <Building className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2 text-center">
                  {searchTerm 
                    ? "Nenhuma instituição encontrada" 
                    : user.role === 'professor' 
                      ? "Você não está cadastrado em uma instituição!"
                      : "Nenhuma instituição cadastrada"}
                </h3>
                <p className="text-muted-foreground text-center mb-4 max-w-md">
                  {searchTerm 
                    ? "Tente ajustar sua pesquisa ou verificar os filtros aplicados" 
                    : user.role === 'professor'
                      ? "Entre em contato com o diretor ou coordenador da sua escola para visualizar a sua escola"
                      : "Não há instituições cadastradas no sistema."}
                </p>
                {!searchTerm && (user.role === 'admin' || user.role === 'tecadm') && (
                  <Button onClick={() => setIsAddDialogOpen(true)}>
                    <PlusCircle className="h-4 w-4 mr-2" />
                    Nova Instituição
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>
        </TabsContent>

        <TabsContent value="turmas" className="mt-6">
          <Turmas embedded />
        </TabsContent>

        <TabsContent value="usuarios" className="mt-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <p className="text-muted-foreground text-sm">
              {isSchoolScopedExportRole(user.role)
                ? "Exporte um PDF com os quantitativos de usuários da sua escola."
                : "Exporte um PDF com os quantitativos de usuários do município selecionado."}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={handleExportUsersMunicipioReport}
              disabled={isExportingUsersReport}
              className="sm:w-auto w-full"
            >
              {isExportingUsersReport ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Gerando PDF...
                </>
              ) : (
                <>
                  <FileDown className="h-4 w-4 mr-2" />
                  Exportar relatório (PDF)
                </>
              )}
            </Button>
          </div>
          <InstituicaoUsersTab
            cityId={
              user.role === "tecadm"
                ? (user.tenant_id || user.city_id || null)
                : (selectedUsersCityId || null)
            }
            cities={(citiesWithSlug.length > 0 ? citiesWithSlug : availableCities).map((c) => ({ id: c.id, name: c.name }))}
            selectedCityId={selectedUsersCityId}
            onCityChange={setSelectedUsersCityId}
            isAdmin={user.role === "admin"}
            selectedUserIdsForBatchDelete={selectedUserIdsForBatchDelete}
            onToggleUserForBatchDelete={toggleUserSelectionForBatchDelete}
            onSelectManyUsersForBatchDelete={selectManyUsersForBatchDelete}
            onClearUsersForBatchDelete={clearUserSelectionForBatchDelete}
            onDeleteUsersInBatch={deleteUsersInBatch}
          />
        </TabsContent>
      </Tabs>

      {/* Add/Edit Escola Dialog (página Gestão Escolar) */}
      {(isAddDialogOpen || selectedInstituicao) && (
        <SchoolForm
          school={selectedInstituicao ? {
            id: selectedInstituicao.id,
            name: selectedInstituicao.name,
            city_id: selectedInstituicao.city_id || '',
            address: selectedInstituicao.address || '',
            domain: selectedInstituicao.domain || '',
            created_at: selectedInstituicao.created_at || '',
            city: selectedInstituicao.city ? {
              id: selectedInstituicao.city.id,
              name: selectedInstituicao.city.name,
              state: selectedInstituicao.city.state,
              created_at: ''
            } : { id: '', name: '', state: '', created_at: '' }
          } : undefined}
          lockedMunicipality={
            selectedInstituicao ? undefined : lockedMunicipalityForNewSchool
          }
          onClose={() => {
            setIsAddDialogOpen(false);
            setSelectedInstituicao(null);
          }}
          onSave={handleSaveInstituicao}
          isLoading={isSaving}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={(open) => {
        if (!open && !isDeleting) {
          setIsDeleteDialogOpen(false);
          setInstituicaoToDelete(null);
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Isso excluirá permanentemente a
              instituição {instituicaoToDelete?.name} e removerá os dados associados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setInstituicaoToDelete(null);
                setIsDeleteDialogOpen(false);
              }}
              disabled={isDeleting}
            >
              Cancelar
            </AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => instituicaoToDelete && handleDeleteInstituicao(instituicaoToDelete.id)}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Excluindo...
                </>
              ) : (
                "Excluir"
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
} 