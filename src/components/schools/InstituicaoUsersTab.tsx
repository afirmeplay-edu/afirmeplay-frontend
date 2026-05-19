import { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Users, User, Eye, EyeOff, Pencil, Building, MapPin, School, UserPlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getRoleDisplayName } from "@/lib/constants";
import UserForm from "@/components/users/UserForm";
import { Label } from "@/components/ui/label";
import { useEmailCheck, generatePasswordFromName } from "@/hooks/useEmailCheck";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/authContext";
import type { AvatarConfig } from "@/context/authContext";
import { AvatarPreview } from "@/components/profile/AvatarPreview";

const ROLE_ORDER = ["admin", "tecadm", "aplicador", "diretor", "coordenador", "professor", "aluno"];

/** Mapeia nome de exibição ou slug da API para chave canônica (para ordenação) */
function toCanonicalRole(role: string): string {
  const r = (role || "").trim().toLowerCase();
  const byDisplay: Record<string, string> = {
    "administrador": "admin",
    "técnico administrativo": "tecadm",
    "técnico administrador": "tecadm",
    "tec adm": "tecadm",
    "aplicador": "aplicador",
    "diretor": "diretor",
    "coordenador": "coordenador",
    "professor": "professor",
    "aluno": "aluno",
  };
  return byDisplay[r] || r || "outro";
}

interface MunicipioUser {
  id: string;
  name: string;
  email: string;
  registration?: string;
  role: string;
  city_id: string;
  created_at?: string;
  /** Nome da escola (quando vindo da API) */
  school_name?: string;
  school_id?: string;
  school?: { id: string; name: string };
  schools?: Array<{ id: string; name: string }>;
  /** Município do tec admin (GET /managers → city) */
  city_name?: string;
  city?: { id: string; name: string };
  /** Avatar do usuário (quando vindo da API) */
  avatar_config?: AvatarConfig | null;
}

const ROLES_WITH_SCHOOL = ["diretor", "coordenador", "professor", "aluno"];
const ROLES_WITH_CITY = ["tecadm", "aplicador"];

/** Hierarquia: quem pode editar quem. Nenhum cargo pode selecionar cargo maior que o seu na edição. */
const ROLES_EDITABLE_BY: Record<string, string[]> = {
  admin: ["admin", "tecadm", "aplicador", "diretor", "coordenador", "professor", "aluno"],
  tecadm: ["tecadm", "aplicador", "diretor", "coordenador", "professor", "aluno"],
  diretor: ["coordenador", "professor", "aluno"],
  coordenador: ["professor", "aluno"],
  professor: [],
  aluno: [],
};

function canCurrentUserEditTarget(editorRole: string, targetCanonicalRole: string): boolean {
  const editorCanonical = toCanonicalRole(editorRole);
  const allowed = ROLES_EDITABLE_BY[editorCanonical];
  if (!allowed?.length) return false;
  return allowed.includes(targetCanonicalRole);
}

/** Roles que o editor pode atribuir na edição (nenhum cargo pode selecionar cargo maior que o seu). */
function getAllowedRolesForEditor(editorRole: string): string[] {
  const editorCanonical = toCanonicalRole(editorRole);
  const allowed = ROLES_EDITABLE_BY[editorCanonical];
  if (!allowed?.length) return [];
  return allowed.map((r) => getRoleDisplayName(r));
}

function getSchoolDisplay(u: MunicipioUser): string | null {
  if (u.school_name) return u.school_name;
  if (u.school?.name) return u.school.name;
  if (u.schools?.length) return u.schools.map((s) => s.name).join(", ");
  return null;
}

function getCityDisplay(u: MunicipioUser): string | null {
  if (u.city_name) return u.city_name;
  if (u.city?.name) return u.city.name;
  return null;
}

interface MunicipioUsersResponse {
  municipio: { id: string; name: string; state: string };
  total: number;
  users: MunicipioUser[];
}

interface CityOption {
  id: string;
  name: string;
}

interface SchoolOption {
  id: string;
  name: string;
}

export interface InstituicaoUsersTabProps {
  /** ID do município (obrigatório para tecadm; para admin pode vir do seletor) */
  cityId: string | null;
  /** Lista de cidades para o admin escolher (opcional) */
  cities?: CityOption[];
  /** Cidade selecionada no seletor (admin) */
  selectedCityId?: string;
  /** Callback quando admin altera a cidade */
  onCityChange?: (cityId: string) => void;
  /** Se o usuário atual é admin (pode editar qualquer um) */
  isAdmin?: boolean;
  /** Seleção de usuários para ações em lote (ex.: apagar em lote) */
  selectedUserIdsForBatchDelete?: ReadonlySet<string>;
  onToggleUserForBatchDelete?: (userId: string) => void;
  onSelectManyUsersForBatchDelete?: (userIds: string[]) => void;
  onClearUsersForBatchDelete?: () => void;
  onDeleteUsersInBatch?: (userIds: string[]) => Promise<void> | void;
}

export function InstituicaoUsersTab({
  cityId,
  cities = [],
  selectedCityId,
  onCityChange,
  isAdmin = false,
  selectedUserIdsForBatchDelete,
  onToggleUserForBatchDelete,
  onSelectManyUsersForBatchDelete,
  onClearUsersForBatchDelete,
  onDeleteUsersInBatch,
}: InstituicaoUsersTabProps) {
  const [data, setData] = useState<MunicipioUsersResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSchoolFilter, setSelectedSchoolFilter] = useState<string>("ALL");
  const [viewingUser, setViewingUser] = useState<MunicipioUser | null>(null);
  const [viewingUserSchool, setViewingUserSchool] = useState<string | null>(null);
  const [loadingViewDetails, setLoadingViewDetails] = useState(false);
  const [editingUser, setEditingUser] = useState<MunicipioUser | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [addTecAdminOpen, setAddTecAdminOpen] = useState(false);
  const [addTecAdminForm, setAddTecAdminForm] = useState({
    name: "",
    email: "",
    password: "",
    registration: "",
  });
  const [showTecAdminPassword, setShowTecAdminPassword] = useState(false);
  const [isSubmittingAddTecAdmin, setIsSubmittingAddTecAdmin] = useState(false);
  const [addAplicadorOpen, setAddAplicadorOpen] = useState(false);
  const [addAplicadorForm, setAddAplicadorForm] = useState({
    name: "",
    email: "",
    password: "",
    registration: "",
  });
  const [showAplicadorPassword, setShowAplicadorPassword] = useState(false);
  const [isSubmittingAddAplicador, setIsSubmittingAddAplicador] = useState(false);
  const [userToDelete, setUserToDelete] = useState<MunicipioUser | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);
  const [isBatchDeleteDialogOpen, setIsBatchDeleteDialogOpen] = useState(false);
  const [isDeletingBatch, setIsDeletingBatch] = useState(false);
  const { toast } = useToast();
  const { user: authUser } = useAuth();
  const canFetchSchoolEnrichment = authUser?.role === "admin" || authUser?.role === "tecadm";
  const canDeleteSingleUser = authUser?.role === "admin" || authUser?.role === "tecadm";
  const canBatchDelete = Boolean(
    authUser?.role === "admin"
      && selectedUserIdsForBatchDelete
      && onToggleUserForBatchDelete
      && onSelectManyUsersForBatchDelete
      && onClearUsersForBatchDelete
      && onDeleteUsersInBatch
  );

  const { checkedEmail: checkedTecAdminEmail } = useEmailCheck(addTecAdminForm.name, addTecAdminOpen);
  useEffect(() => {
    if (!addTecAdminOpen || !checkedTecAdminEmail) return;
    setAddTecAdminForm((prev) => ({ ...prev, email: checkedTecAdminEmail }));
  }, [checkedTecAdminEmail, addTecAdminOpen]);

  const { checkedEmail: checkedAplicadorEmail } = useEmailCheck(addAplicadorForm.name, addAplicadorOpen);
  useEffect(() => {
    if (!addAplicadorOpen || !checkedAplicadorEmail) return;
    setAddAplicadorForm((prev) => ({ ...prev, email: checkedAplicadorEmail }));
  }, [checkedAplicadorEmail, addAplicadorOpen]);

  const handleAddTecAdminNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    setAddTecAdminForm((prev) => ({
      ...prev,
      name: newName,
      password: generatePasswordFromName(newName),
    }));
  };

  const handleAddTecAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveId = cityId || selectedCityId;
    if (!effectiveId) return;
    if (!addTecAdminForm.name.trim() || !addTecAdminForm.email.trim() || !addTecAdminForm.password.trim()) {
      toast({ title: "Erro", description: "Preencha nome, e-mail e senha.", variant: "destructive" });
      return;
    }
    setIsSubmittingAddTecAdmin(true);
    try {
      await api.post("/users", {
        name: addTecAdminForm.name.trim(),
        email: addTecAdminForm.email.trim(),
        password: addTecAdminForm.password,
        role: "tecadm",
        city_id: effectiveId,
        ...(addTecAdminForm.registration.trim() ? { registration: addTecAdminForm.registration.trim() } : {}),
      });
      toast({ title: "Sucesso", description: "Técnico administrativo criado com sucesso." });
      setAddTecAdminOpen(false);
      setAddTecAdminForm({ name: "", email: "", password: "", registration: "" });
      fetchUsers();
    } catch (err) {
      console.error("Erro ao criar técnico administrativo:", err);
      const msg = (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data?.error
        || (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data?.message
        || "Erro ao criar usuário.";
      toast({ title: "Erro", description: msg, variant: "destructive" });
    } finally {
      setIsSubmittingAddTecAdmin(false);
    }
  };

  const handleAddAplicadorNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    setAddAplicadorForm((prev) => ({
      ...prev,
      name: newName,
      password: generatePasswordFromName(newName),
    }));
  };

  const handleAddAplicadorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveId = cityId || selectedCityId;
    if (!effectiveId) return;
    if (!addAplicadorForm.name.trim() || !addAplicadorForm.email.trim() || !addAplicadorForm.password.trim()) {
      toast({ title: "Erro", description: "Preencha nome, e-mail e senha.", variant: "destructive" });
      return;
    }
    setIsSubmittingAddAplicador(true);
    try {
      await api.post("/users", {
        name: addAplicadorForm.name.trim(),
        email: addAplicadorForm.email.trim(),
        password: addAplicadorForm.password,
        role: "aplicador",
        city_id: effectiveId,
        ...(addAplicadorForm.registration.trim() ? { registration: addAplicadorForm.registration.trim() } : {}),
      });
      toast({ title: "Sucesso", description: "Aplicador criado com sucesso." });
      setAddAplicadorOpen(false);
      setAddAplicadorForm({ name: "", email: "", password: "", registration: "" });
      fetchUsers();
    } catch (err) {
      console.error("Erro ao criar aplicador:", err);
      const msg = (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data?.error
        || (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data?.message
        || "Erro ao criar usuário.";
      toast({ title: "Erro", description: msg, variant: "destructive" });
    } finally {
      setIsSubmittingAddAplicador(false);
    }
  };

  // Ao abrir o modal "Ver", buscar detalhes do usuário (incl. escola) para diretor/coordenador/professor/aluno
  useEffect(() => {
    if (!viewingUser || !ROLES_WITH_SCHOOL.includes(toCanonicalRole(viewingUser.role))) {
      setViewingUserSchool(null);
      return;
    }
    const already = getSchoolDisplay(viewingUser);
    if (already) {
      setViewingUserSchool(already);
      return;
    }
    let cancelled = false;
    setLoadingViewDetails(true);
    setViewingUserSchool(null);
    api
      .get(`/users/${viewingUser.id}`)
      .then((res) => {
        if (cancelled) return;
        const d = res.data?.user ?? res.data;
        const name =
          d?.student?.school?.name ??
          d?.student?.school?.nome ??
          d?.school?.name ??
          d?.school?.nome ??
          (Array.isArray(d?.schools) && d.schools.length > 0
            ? d.schools.map((s: { name?: string; nome?: string }) => s?.name ?? s?.nome).filter(Boolean).join(", ")
            : null);
        setViewingUserSchool(name || null);
      })
      .catch(() => {
        if (!cancelled) setViewingUserSchool(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingViewDetails(false);
      });
    return () => {
      cancelled = true;
    };
  }, [viewingUser?.id, viewingUser?.role]);

  const fetchUsers = useCallback(async () => {
    if (!cityId) return;
    setIsLoading(true);
    try {
      const res = await api.get<MunicipioUsersResponse>(`/city/${cityId}/users`);
      let users: MunicipioUser[] = Array.isArray(res.data?.users) ? [...res.data.users] : [];

      if (canFetchSchoolEnrichment && users.length > 0) {
        const managersSchoolMap = new Map<string, { id: string; name: string }>();
        const managersCityMap = new Map<string, { id: string; name: string }>();
        const professorSchoolsMap = new Map<string, Array<{ id: string; name: string }>>();
        const studentSchoolMap = new Map<string, { id: string; name: string }>();

        try {
          const managersRes = await api.get(`/managers`);
          const allManagers = Array.isArray(managersRes.data) ? managersRes.data : managersRes.data?.managers ?? [];
          for (const item of allManagers) {
            const userId = item.user?.id;
            const role = (item.user?.role ?? "").toLowerCase();
            const school = item.school;
            const city = item.city;
            if (userId && (role === "diretor" || role === "coordenador") && school) {
              managersSchoolMap.set(userId, {
                id: school.id,
                name: school.name ?? school.nome ?? "Escola",
              });
            }
            if (userId && role === "tecadm" && city) {
              managersCityMap.set(userId, {
                id: city.id,
                name: city.name ?? city.nome ?? "Município",
              });
            }
          }
        } catch (e) {
          console.warn("Erro ao carregar managers (escola/cidade):", e);
        }

        try {
          const managersCityRes = await api.get(`/managers/city/${cityId}`);
          const managersList = Array.isArray(managersCityRes.data) ? managersCityRes.data : managersCityRes.data?.managers ?? [];
          for (const item of managersList) {
            const userId = item.user?.id;
            const school = item.school;
            if (userId && school && !managersSchoolMap.has(userId)) {
              managersSchoolMap.set(userId, {
                id: school.id,
                name: school.name ?? school.nome ?? "Escola",
              });
            }
          }
        } catch (e) {
          console.warn("Erro ao carregar managers da cidade (escola por diretor/coordenador):", e);
        }

        try {
          const studentsRes = await api.get("/students");
          const studentsList = Array.isArray(studentsRes.data) ? studentsRes.data : studentsRes.data?.data ?? studentsRes.data?.alunos ?? studentsRes.data?.students ?? [];
          for (const s of studentsList) {
            const school = s.school;
            if (!school) continue;
            const schoolCityId = school.city_id;
            if (schoolCityId && schoolCityId !== cityId) continue;
            const userId = s.user_id ?? s.usuario_id ?? s.user?.id ?? s.id;
            if (userId) {
              studentSchoolMap.set(userId, {
                id: school.id,
                name: school.name ?? school.nome ?? "Escola",
              });
            }
          }
        } catch (e) {
          console.warn("Erro ao carregar alunos/escolas:", e);
        }

        try {
          const teacherRes = await api.get("/teacher");
          const teachersList = Array.isArray(teacherRes.data)
            ? teacherRes.data
            : teacherRes.data?.data ?? teacherRes.data?.professores ?? [];
          const teacherIdToUserId = new Map<string, string>();
          for (const t of teachersList) {
            const uid = t.user_id ?? t.usuario_id ?? t.user?.id;
            if (uid && t.id) teacherIdToUserId.set(t.id, uid);
            const vinculos = t.vinculos ?? t.vínculos ?? t.schools ?? [];
            if (uid && vinculos.length > 0) {
              const schools = vinculos.map((v: { school_id?: string; school_name?: string; school?: { id: string; name: string } }) =>
                v.school ? v.school : { id: v.school_id ?? "", name: v.school_name ?? "" }
              ).filter((s: { id: string; name: string }) => s.id || s.name);
              if (schools.length) {
                const existing = professorSchoolsMap.get(uid) ?? [];
                professorSchoolsMap.set(uid, [...existing, ...schools]);
              }
            }
          }
          if (professorSchoolsMap.size === 0) {
            const linksRes = await api.get("/school-teacher");
            const links = Array.isArray(linksRes.data) ? linksRes.data : linksRes.data?.data ?? linksRes.data?.vinculos ?? [];
            for (const link of links) {
              const teacherId = link.teacher_id ?? link.professor?.id;
              const escola = link.escola ?? link.school;
              if (!teacherId || !escola) continue;
              const userId = teacherIdToUserId.get(teacherId);
              if (userId) {
                const arr = professorSchoolsMap.get(userId) ?? [];
                if (!arr.some((s) => s.id === escola.id)) {
                  professorSchoolsMap.set(userId, [...arr, { id: escola.id, name: escola.name ?? escola.nome ?? "" }]);
                }
              }
            }
          }
        } catch (e) {
          console.warn("Erro ao carregar professores/escolas:", e);
        }

        users = users.map((u) => {
          const roleCanon = toCanonicalRole(u.role);
          if (roleCanon === "diretor" || roleCanon === "coordenador") {
            const school = managersSchoolMap.get(u.id);
            if (school) return { ...u, school, school_name: school.name, school_id: school.id };
          }
          if (roleCanon === "professor") {
            const schools = professorSchoolsMap.get(u.id);
            if (schools?.length) {
              const schoolName = schools.map((s) => s.name).filter(Boolean).join(", ");
              return { ...u, schools, school_name: schoolName, school: schools[0], school_id: schools[0].id };
            }
          }
          if (roleCanon === "aluno") {
            const school = studentSchoolMap.get(u.id);
            if (school) return { ...u, school, school_name: school.name, school_id: school.id };
          }
          if (roleCanon === "tecadm" || roleCanon === "aplicador") {
            const city = managersCityMap.get(u.id);
            if (city) return { ...u, city, city_name: city.name };
          }
          return u;
        });
      }

      setData({ ...res.data, users });
    } catch (err) {
      console.error("Erro ao carregar usuários do município:", err);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os usuários deste município.",
        variant: "destructive",
      });
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [cityId, toast, canFetchSchoolEnrichment]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleEditUser = async (userData: { id: number | string; name: string; email: string; role: string; registration?: string; city_id?: string }) => {
    const idStr = userData.id != null && userData.id !== '' ? String(userData.id) : null;
    if (!idStr || idStr === 'undefined' || idStr === 'NaN') {
      toast({ title: "Erro", description: "ID do usuário inválido.", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    try {
      await api.put(`/users/${idStr}`, userData);
      toast({ title: "Sucesso", description: "Usuário atualizado com sucesso." });
      setEditingUser(null);
      await fetchUsers();
    } catch (err) {
      console.error("Erro ao atualizar usuário:", err);
      toast({ title: "Erro", description: "Erro ao atualizar usuário.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    setIsDeletingUser(true);
    try {
      await api.delete(`/users/${userToDelete.id}`);
      toast({ title: "Sucesso", description: "Usuário excluído com sucesso." });
      setUserToDelete(null);
      fetchUsers();
    } catch (err) {
      console.error("Erro ao excluir usuário:", err);
      const msg = (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data?.error
        || (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data?.message
        || "Erro ao excluir usuário.";
      toast({ title: "Erro", description: msg, variant: "destructive" });
    } finally {
      setIsDeletingUser(false);
    }
  };

  const handleBatchDeleteUsers = async () => {
    if (!canBatchDelete) return;
    const ids = Array.from(selectedUserIdsForBatchDelete).map(String).filter(Boolean);
    if (ids.length === 0) return;
    setIsDeletingBatch(true);
    try {
      await onDeleteUsersInBatch(ids);
      setIsBatchDeleteDialogOpen(false);
      fetchUsers();
    } finally {
      setIsDeletingBatch(false);
    }
  };

  const rawUsers = data?.users ?? [];
  const users =
    authUser?.role === "professor"
      ? rawUsers.filter((u) => toCanonicalRole(u.role) === "aluno")
      : rawUsers;
  const effectiveCityId = cityId || selectedCityId;

  const schoolOptions = useMemo<SchoolOption[]>(() => {
    const map = new Map<string, SchoolOption>();
    users.forEach((u) => {
      const directId = u.school_id || u.school?.id;
      const directName = u.school_name || u.school?.name;
      if (directName) {
        const key = directId ? `id:${directId}` : `name:${directName}`;
        map.set(key, { id: key, name: directName });
      }
      (u.schools || []).forEach((s) => {
        if (!s?.name) return;
        const key = s.id ? `id:${s.id}` : `name:${s.name}`;
        map.set(key, { id: key, name: s.name });
      });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [users]);

  const userMatchesSelectedSchool = useCallback(
    (u: MunicipioUser) => {
      if (selectedSchoolFilter === "ALL") return true;
      const selectedName = selectedSchoolFilter.startsWith("name:")
        ? selectedSchoolFilter.replace(/^name:/, "")
        : "";

      const allKeys = new Set<string>();
      if (u.school_id) allKeys.add(`id:${u.school_id}`);
      if (u.school?.id) allKeys.add(`id:${u.school.id}`);
      if (u.school_name) allKeys.add(`name:${u.school_name}`);
      if (u.school?.name) allKeys.add(`name:${u.school.name}`);
      (u.schools || []).forEach((s) => {
        if (s.id) allKeys.add(`id:${s.id}`);
        if (s.name) allKeys.add(`name:${s.name}`);
      });

      if (allKeys.has(selectedSchoolFilter)) return true;
      if (selectedName) {
        for (const key of allKeys) {
          if (key.startsWith("name:") && key.replace(/^name:/, "") === selectedName) {
            return true;
          }
        }
      }
      return false;
    },
    [selectedSchoolFilter]
  );

  useEffect(() => {
    setSelectedSchoolFilter("ALL");
  }, [effectiveCityId]);
  const byRole = users.reduce<Record<string, MunicipioUser[]>>((acc, u) => {
    const canonical = toCanonicalRole(u.role || "");
    if (!acc[canonical]) acc[canonical] = [];
    acc[canonical].push(u);
    return acc;
  }, {});

  const filteredByRole = searchQuery.trim() || selectedSchoolFilter !== "ALL"
    ? Object.fromEntries(
        Object.entries(byRole).map(([role, list]) => [
          role,
          list.filter(
            (u) =>
              (
                !searchQuery.trim() ||
                u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (u.registration && u.registration.toLowerCase().includes(searchQuery.toLowerCase()))
              ) &&
              userMatchesSelectedSchool(u)
          ),
        ]).filter(([, list]) => list.length > 0)
      )
    : byRole;

  const orderedRoles = [...ROLE_ORDER, ...Object.keys(filteredByRole).filter((r) => !ROLE_ORDER.includes(r))];
  const totalFiltered = Object.values(filteredByRole).reduce((s, arr) => s + arr.length, 0);
  const visibleUserIdsForSelection = canBatchDelete
    ? Object.values(filteredByRole).flat().map((u) => String(u.id))
    : [];

  const showCitySelector = isAdmin && cities.length > 0 && !cityId;
  const canCreateTecAdmin = authUser?.role === "admin" || authUser?.role === "tecadm";
  const canCreateAplicador =
    authUser?.role === "admin" || authUser?.role === "tecadm" || authUser?.role === "coordenador";

  return (
    <div className="space-y-6 mt-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <p className="text-muted-foreground text-sm">
          Usuários do município agrupados por perfil. Use Ver para consultar dados e Editar para alterar.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {showCitySelector && (
            <>
              <span className="text-sm text-muted-foreground whitespace-nowrap">Município:</span>
              <Select
                value={selectedCityId || ""}
                onValueChange={(v) => v && onCityChange?.(v)}
              >
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Selecione um município" />
                </SelectTrigger>
                <SelectContent>
                  {cities.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
          {canCreateTecAdmin && effectiveCityId && (
            <Button
              type="button"
              onClick={() => setAddTecAdminOpen(true)}
              className="shrink-0"
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Adicionar Tec Admin
            </Button>
          )}
          {canCreateAplicador && effectiveCityId && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setAddAplicadorOpen(true)}
              className="shrink-0"
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Adicionar Aplicador
            </Button>
          )}
        </div>
      </div>

      {!effectiveCityId && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Building className="h-12 w-12 text-muted-foreground/50 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">
              {showCitySelector ? "Selecione um município acima para listar os usuários." : "Nenhum município definido."}
            </p>
          </CardContent>
        </Card>
      )}

      {effectiveCityId && (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative max-w-sm w-full">
              <Input
                placeholder="Buscar por nome, e-mail ou matrícula..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
              <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            </div>
            <Select
              value={selectedSchoolFilter}
              onValueChange={setSelectedSchoolFilter}
              disabled={schoolOptions.length === 0}
            >
              <SelectTrigger className="w-full sm:w-[280px]">
                <SelectValue placeholder="Filtrar por escola" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todas as escolas</SelectItem>
                {schoolOptions.map((school) => (
                  <SelectItem key={school.id} value={school.id}>
                    {school.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {canBatchDelete && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg border bg-muted/20 px-3 py-2">
              <div className="text-sm text-muted-foreground">
                Selecionados:{" "}
                <span className="font-medium text-foreground">
                  {selectedUserIdsForBatchDelete.size}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onSelectManyUsersForBatchDelete(visibleUserIdsForSelection)}
                  disabled={visibleUserIdsForSelection.length === 0}
                >
                  Selecionar todos (visíveis)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onClearUsersForBatchDelete()}
                  disabled={selectedUserIdsForBatchDelete.size === 0}
                >
                  Limpar seleção
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => setIsBatchDeleteDialogOpen(true)}
                  disabled={selectedUserIdsForBatchDelete.size === 0}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Excluir selecionados
                </Button>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="flex min-h-[280px] items-center justify-center rounded-xl border border-dashed bg-muted/30">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
          ) : totalFiltered === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Users className="h-12 w-12 text-muted-foreground/50 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">
                  {searchQuery ? "Nenhum usuário encontrado para a busca." : "Nenhum usuário cadastrado neste município."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-8">
              {data?.municipio && (
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{totalFiltered}</span> usuário(s) em{" "}
                  <span className="font-medium text-foreground">{data.municipio.name}</span> ({data.municipio.state})
                </p>
              )}
              {orderedRoles.map((role) => {
                const list = filteredByRole[role];
                if (!list?.length) return null;
                return (
                  <Card key={role} className="overflow-hidden">
                    <CardHeader className="py-3 px-4 bg-muted/50 border-b">
                      <h3 className="text-sm font-semibold text-[#7B3FE4] flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        {getRoleDisplayName(role)}
                        <Badge variant="secondary" className="ml-1">{list.length}</Badge>
                      </h3>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                        {list.map((u) => (
                          <Card key={u.id} className={cn(
                            "overflow-hidden transition-all border-[#E5D5EA] dark:border-white/10",
                            "hover:border-[#7B3FE4]/40 hover:shadow-sm"
                          )}>
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                  {canBatchDelete && (
                                    <Checkbox
                                      checked={selectedUserIdsForBatchDelete.has(String(u.id))}
                                      onCheckedChange={() => onToggleUserForBatchDelete(String(u.id))}
                                      className="mt-1"
                                      aria-label={`Selecionar usuário ${u.name}`}
                                    />
                                  )}
                                  {u.avatar_config ? (
                                    <AvatarPreview config={u.avatar_config} size={44} className="shrink-0" />
                                  ) : (
                                    <div
                                      className="h-11 w-11 shrink-0 rounded-full bg-[#7B3FE4]/20 text-[#7B3FE4] dark:bg-[#7B3FE4]/30 dark:text-[#E3DFFF] flex items-center justify-center font-semibold text-lg"
                                      aria-hidden
                                    >
                                      {(u.name && u.name.trim()) ? u.name.trim().charAt(0).toUpperCase() : <User className="h-5 w-5" />}
                                    </div>
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <p className="font-medium text-foreground truncate">{u.name}</p>
                                    {authUser?.role !== "professor" && (
                                      <p className="text-xs text-muted-foreground truncate mt-0.5">{u.email}</p>
                                    )}
                                  {u.registration && (
                                    <p className="text-xs text-muted-foreground/80 mt-0.5">Matrícula: {u.registration}</p>
                                  )}
                                  {ROLES_WITH_SCHOOL.includes(toCanonicalRole(u.role)) && getSchoolDisplay(u) && (
                                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                      <School className="h-3 w-3 flex-shrink-0" />
                                      <span className="whitespace-normal break-words leading-tight">
                                        {getSchoolDisplay(u)}
                                      </span>
                                    </p>
                                  )}
                                  {ROLES_WITH_CITY.includes(toCanonicalRole(u.role)) && getCityDisplay(u) && (
                                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                      <MapPin className="h-3 w-3 flex-shrink-0" />
                                      <span className="truncate">{getCityDisplay(u)}</span>
                                    </p>
                                  )}
                                    <Badge variant="outline" className="mt-2 text-xs">
                                      {getRoleDisplayName(u.role)}
                                    </Badge>
                                  </div>
                                </div>
                                <div className="flex flex-shrink-0 gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => setViewingUser(u)}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  {canCurrentUserEditTarget(authUser?.role ?? "", toCanonicalRole(u.role)) && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() => setEditingUser(u)}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                  )}
                                  {canDeleteSingleUser && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                      onClick={() => setUserToDelete(u)}
                                      title="Excluir usuário"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Modal Ver informações */}
      <Dialog open={!!viewingUser} onOpenChange={(open) => !open && setViewingUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#7B3FE4]/10">
                <Users className="h-4 w-4 text-[#7B3FE4]" />
              </div>
              Informações do usuário
            </DialogTitle>
            <DialogDescription>Dados cadastrais</DialogDescription>
          </DialogHeader>
          {viewingUser && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Nome completo</p>
                <p className="text-base font-medium text-foreground">{viewingUser.name}</p>
              </div>
              {authUser?.role !== "professor" && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">E-mail</p>
                  <p className="text-base text-foreground">{viewingUser.email}</p>
                </div>
              )}
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Matrícula</p>
                <p className="text-base text-foreground">{viewingUser.registration || "—"}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Perfil</p>
                <p className="text-base text-foreground">{getRoleDisplayName(viewingUser.role)}</p>
              </div>
              {ROLES_WITH_SCHOOL.includes(toCanonicalRole(viewingUser.role)) && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                    <School className="h-3.5 w-3.5" /> Escola(s)
                  </p>
                  {loadingViewDetails ? (
                    <p className="text-base text-muted-foreground flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
                    </p>
                  ) : (
                    <p className="text-base text-foreground">
                      {viewingUserSchool ?? getSchoolDisplay(viewingUser) ?? "—"}
                    </p>
                  )}
                </div>
              )}
              {ROLES_WITH_CITY.includes(toCanonicalRole(viewingUser.role)) && getCityDisplay(viewingUser) && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" /> Município atribuído
                  </p>
                  <p className="text-base text-foreground">{getCityDisplay(viewingUser)}</p>
                </div>
              )}
              {data?.municipio && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" /> Município
                  </p>
                  <p className="text-base text-foreground">{data.municipio.name} ({data.municipio.state})</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal Editar usuário */}
      <Dialog
        open={!!editingUser}
        onOpenChange={(open) => {
          if (!open && !isSaving) setEditingUser(null);
        }}
      >
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#7B3FE4]/10">
                <Pencil className="h-4 w-4 text-[#7B3FE4]" />
              </div>
              Editar usuário
            </DialogTitle>
            <DialogDescription>
              Altere nome, e-mail, matrícula, função ou senha. Os campos marcados com * são obrigatórios.
            </DialogDescription>
          </DialogHeader>
          {editingUser && (
            <div className="relative space-y-6 pt-2">
              {isSaving && (
                <div
                  className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-lg bg-background/80 backdrop-blur-[1px]"
                  aria-live="polite"
                  aria-busy="true"
                >
                  <Loader2 className="h-8 w-8 animate-spin text-[#7B3FE4]" />
                  <p className="text-sm font-medium text-foreground">Salvando alterações...</p>
                </div>
              )}
              {ROLES_WITH_SCHOOL.includes(editingUser.role) && getSchoolDisplay(editingUser) && (
                <div className="rounded-lg border border-[#E5D5EA] dark:border-white/10 bg-muted/30 px-4 py-3">
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-1">
                    <School className="h-3.5 w-3.5" /> Escola vinculada (somente leitura)
                  </p>
                  <p className="text-sm font-medium text-foreground">{getSchoolDisplay(editingUser)}</p>
                </div>
              )}
              <UserForm
                user={{
                  id: editingUser.id,
                  name: editingUser.name,
                  email: editingUser.email,
                  role: getRoleDisplayName(editingUser.role),
                  registration: editingUser.registration,
                  city_id: editingUser.city_id,
                }}
                onSubmit={handleEditUser}
                allowedRoles={getAllowedRolesForEditor(authUser?.role ?? "")}
                showCitySelect={isAdmin}
                layout="modal"
                isSubmitting={isSaving}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal Adicionar Tec Admin (somente admin) */}
      <Dialog open={addTecAdminOpen} onOpenChange={setAddTecAdminOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#7B3FE4]/10">
                <UserPlus className="h-4 w-4 text-[#7B3FE4]" />
              </div>
              Adicionar Técnico Administrador
            </DialogTitle>
            <DialogDescription>
              Cria um usuário com perfil Técnico Administrador para o município selecionado. Nome, e-mail e senha são obrigatórios.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddTecAdminSubmit} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="add-tecadmin-name">Nome completo *</Label>
              <Input
                id="add-tecadmin-name"
                value={addTecAdminForm.name}
                onChange={handleAddTecAdminNameChange}
                placeholder="Nome do técnico"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-tecadmin-email">E-mail *</Label>
              <Input
                id="add-tecadmin-email"
                type="email"
                value={addTecAdminForm.email}
                onChange={(e) => setAddTecAdminForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="email@exemplo.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-tecadmin-password">Senha *</Label>
              <div className="relative">
                <Input
                  id="add-tecadmin-password"
                  type={showTecAdminPassword ? "text" : "password"}
                  value={addTecAdminForm.password}
                  onChange={(e) => setAddTecAdminForm((prev) => ({ ...prev, password: e.target.value }))}
                  placeholder="Mínimo 6 caracteres"
                  required
                  minLength={6}
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowTecAdminPassword(!showTecAdminPassword)}
                  aria-label={showTecAdminPassword ? "Ocultar senha" : "Ver senha"}
                >
                  {showTecAdminPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-tecadmin-registration">Matrícula (opcional)</Label>
              <Input
                id="add-tecadmin-registration"
                value={addTecAdminForm.registration}
                onChange={(e) => setAddTecAdminForm((prev) => ({ ...prev, registration: e.target.value }))}
                placeholder="Opcional"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddTecAdminOpen(false)}
                disabled={isSubmittingAddTecAdmin}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmittingAddTecAdmin}>
                {isSubmittingAddTecAdmin ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Criando...
                  </>
                ) : (
                  "Criar Tec Admin"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={addAplicadorOpen} onOpenChange={setAddAplicadorOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#7B3FE4]/10">
                <UserPlus className="h-4 w-4 text-[#7B3FE4]" />
              </div>
              Adicionar Aplicador
            </DialogTitle>
            <DialogDescription>
              Cria um usuário aplicador para gerar códigos do app offline no município. Login web usa a parte antes do @ do e-mail (ex.: joao.silva).
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddAplicadorSubmit} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="add-aplicador-name">Nome completo *</Label>
              <Input
                id="add-aplicador-name"
                value={addAplicadorForm.name}
                onChange={handleAddAplicadorNameChange}
                placeholder="Nome do aplicador"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-aplicador-email">E-mail *</Label>
              <Input
                id="add-aplicador-email"
                type="email"
                value={addAplicadorForm.email}
                onChange={(e) => setAddAplicadorForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="joao.silva@afirmeplay.com.br"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-aplicador-password">Senha *</Label>
              <div className="relative">
                <Input
                  id="add-aplicador-password"
                  type={showAplicadorPassword ? "text" : "password"}
                  value={addAplicadorForm.password}
                  onChange={(e) => setAddAplicadorForm((prev) => ({ ...prev, password: e.target.value }))}
                  placeholder="Mínimo 8 caracteres"
                  required
                  minLength={8}
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowAplicadorPassword(!showAplicadorPassword)}
                  aria-label={showAplicadorPassword ? "Ocultar senha" : "Ver senha"}
                >
                  {showAplicadorPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-aplicador-registration">Login curto (opcional)</Label>
              <Input
                id="add-aplicador-registration"
                value={addAplicadorForm.registration}
                onChange={(e) => setAddAplicadorForm((prev) => ({ ...prev, registration: e.target.value }))}
                placeholder="joao.silva — padrão: parte antes do @"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddAplicadorOpen(false)}
                disabled={isSubmittingAddAplicador}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmittingAddAplicador}>
                {isSubmittingAddAplicador ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Criando...
                  </>
                ) : (
                  "Criar Aplicador"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmação de exclusão de usuário */}
      <AlertDialog open={!!userToDelete} onOpenChange={(open) => !open && !isDeletingUser && setUserToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O usuário <strong>{userToDelete?.name}</strong> ({userToDelete?.email}) será excluído permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingUser}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeleteUser();
              }}
              disabled={isDeletingUser}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingUser ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Excluindo...
                </>
              ) : (
                "Excluir"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação de exclusão em lote (somente admin) */}
      <AlertDialog open={isBatchDeleteDialogOpen} onOpenChange={(open) => !open && !isDeletingBatch && setIsBatchDeleteDialogOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuários selecionados?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita.{" "}
              {selectedUserIdsForBatchDelete?.size
                ? (
                  <>Você irá excluir <strong>{selectedUserIdsForBatchDelete.size}</strong> usuário(s).</>
                )
                : "Nenhum usuário selecionado."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingBatch}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleBatchDeleteUsers();
              }}
              disabled={isDeletingBatch || !selectedUserIdsForBatchDelete?.size}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingBatch ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Excluindo...
                </>
              ) : (
                "Excluir selecionados"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
