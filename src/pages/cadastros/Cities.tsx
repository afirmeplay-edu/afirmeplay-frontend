import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/context/authContext";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Loader2, MapPin, Plus, Pencil, Trash2, Users, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { Label } from "@/components/ui/label";
import { getRoleDisplayName } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Entitlements, PlanCode } from "@/types/entitlements";

const SLUG_REGEX = /^[a-z0-9-]+$/;
const SLUG_MAX_LENGTH = 100;

const ROLE_ORDER = ["admin", "diretor", "coordenador", "professor", "tecadm", "aluno"];

/** Retorna URL e host do subdomínio conforme o ambiente (localhost vs afirmeplay.com.br) */
function getSubdomainConfig() {
  if (typeof window === "undefined") {
    return {
      url: (slug: string) => (slug ? `https://${slug}.afirmeplay.com.br` : "#"),
      displayHost: "afirmeplay.com.br",
    };
  }
  const hostname = window.location.hostname;
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1";
  const port = window.location.port || "8080";
  const host = isLocal ? `localhost:${port}` : "afirmeplay.com.br";
  const protocol = isLocal ? "http" : "https";
  return {
    url: (slug: string) => (slug ? `${protocol}://${slug}.${host}` : "#"),
    displayHost: host,
  };
}

interface City {
  id: string;
  name: string;
  state: string;
  slug: string;
  plan_code?: PlanCode;
  entitlements?: Entitlements;
  created_at: string;
}

interface MunicipioUsersResponse {
  municipio: { id: string; name: string; state: string };
  total: number;
  users: Array<{
    id: string;
    name: string;
    email: string;
    registration?: string;
    role: string;
    city_id: string;
    created_at: string;
  }>;
}

export default function Cities() {
  const { user } = useAuth();
  const [cities, setCities] = useState<City[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedCity, setSelectedCity] = useState<City | null>(null);
  const [newCity, setNewCity] = useState({
    name: "",
    state: "",
    subdominio: "",
  });
  const [usersModalOpen, setUsersModalOpen] = useState(false);
  const [usersModalCity, setUsersModalCity] = useState<City | null>(null);
  const [usersData, setUsersData] = useState<MunicipioUsersResponse | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const { toast } = useToast();
  const subdomainConfig = getSubdomainConfig();

  const fetchCities = () => {
    setIsLoading(true);
    api
      .get("/city/")
      .then((response) => {
        let citiesData = response.data;
        if (user.role !== "admin") {
          const userCityId = user.tenant_id || user.city_id;
          citiesData = citiesData.filter((city: City) => city.id === userCityId);
        }
        setCities(citiesData);
      })
      .catch((error) => {
        console.error("Error fetching cities:", error);
        toast({
          title: "Erro",
          description: "Erro ao carregar municípios",
          variant: "destructive",
        });
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchCities();
  }, [user.role, user.tenant_id, user.city_id]);

  useEffect(() => {
    if (!usersModalOpen || !usersModalCity) return;
    setUsersData(null);
    setUsersLoading(true);
    api
      .get<MunicipioUsersResponse>(`/city/${usersModalCity.id}/users`)
      .then((res) => setUsersData(res.data))
      .catch((err) => {
        console.error("Erro ao carregar usuários do município:", err);
        toast({
          title: "Erro",
          description: "Não foi possível carregar os usuários deste município.",
          variant: "destructive",
        });
      })
      .finally(() => setUsersLoading(false));
  }, [usersModalOpen, usersModalCity?.id, toast]);

  function normalizeSlug(value: string): string {
    return value.trim().toLowerCase();
  }

  function validateSlug(value: string): string | null {
    const normalized = normalizeSlug(value);
    if (!normalized) return "Informe o subdomínio.";
    if (normalized.length > SLUG_MAX_LENGTH) return `Máximo de ${SLUG_MAX_LENGTH} caracteres.`;
    if (!SLUG_REGEX.test(normalized)) return "Use apenas letras minúsculas, números e hífen (sem acentos ou espaços).";
    return null;
  }

  const handleAddCity = async () => {
    const slugError = validateSlug(newCity.subdominio);
    if (slugError) {
      toast({ title: "Subdomínio inválido", description: slugError, variant: "destructive" });
      return;
    }
    setIsAdding(true);
    try {
      await api.post("/city/", {
        name: newCity.name,
        state: newCity.state,
        slug: normalizeSlug(newCity.subdominio),
      });
      fetchCities();
      setIsAddDialogOpen(false);
      setNewCity({ name: "", state: "", subdominio: "" });
      toast({ title: "Sucesso", description: "Município criado com sucesso" });
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      toast({
        title: status === 409 ? "Subdomínio já em uso" : "Erro",
        description: status === 409 ? "Já existe um município com este subdomínio. Escolha outro." : "Erro ao criar município",
        variant: "destructive",
      });
    } finally {
      setIsAdding(false);
    }
  };

  const handleEditCity = async () => {
    if (!selectedCity) return;
    if (newCity.subdominio !== undefined && newCity.subdominio !== "") {
      const slugError = validateSlug(newCity.subdominio);
      if (slugError) {
        toast({ title: "Subdomínio inválido", description: slugError, variant: "destructive" });
        return;
      }
    }
    setIsEditing(true);
    try {
      await api.put(`/city/${selectedCity.id}/`, {
        name: newCity.name,
        state: newCity.state,
        slug: newCity.subdominio ? normalizeSlug(newCity.subdominio) : undefined,
      });
      fetchCities();
      setIsEditDialogOpen(false);
      setSelectedCity(null);
      setNewCity({ name: "", state: "", subdominio: "" });
      toast({ title: "Sucesso", description: "Município atualizado com sucesso" });
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      toast({
        title: status === 409 ? "Subdomínio já em uso" : "Erro",
        description: status === 409 ? "Já existe um município com este subdomínio. Escolha outro." : "Erro ao atualizar município",
        variant: "destructive",
      });
    } finally {
      setIsEditing(false);
    }
  };

  const handleDeleteCity = async () => {
    if (!selectedCity) return;
    setIsDeleting(true);
    try {
      await api.delete(`/city/${selectedCity.id}/`);
      fetchCities();
      setIsDeleteDialogOpen(false);
      setSelectedCity(null);
      toast({ title: "Sucesso", description: "Município removido com sucesso" });
    } catch (error) {
      console.error("Error deleting city:", error);
      toast({ title: "Erro", description: "Erro ao remover município", variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  };

  const openUsersModal = (city: City) => {
    setUsersModalCity(city);
    setUsersModalOpen(true);
  };

  const filteredCities = cities.filter(
    (c) =>
      c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.state?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.slug?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const existingStates = useMemo(
    () =>
      Array.from(
        new Set(
          cities
            .map((city) => city.state?.trim())
            .filter((state): state is string => Boolean(state))
        )
      ).sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" })),
    [cities]
  );

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Cabeçalho padronizado: no mobile título/desc alinhados, botão centralizado abaixo */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex flex-wrap items-center gap-2 sm:gap-3">
              <MapPin className="w-7 h-7 sm:w-8 sm:h-8 text-primary shrink-0" />
              Municípios
            </h1>
            <p className="text-muted-foreground text-sm sm:text-base">
              Municípios cadastrados na plataforma. Clique no subdomínio para acessar ou em Ver usuários para listar usuários do município.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2 w-full sm:w-auto sm:justify-end">
            {!isLoading && filteredCities.length > 0 && (
              <span className="inline-flex items-center rounded-md bg-muted px-3 py-1.5 text-sm font-medium text-muted-foreground">
                {filteredCities.length} município(s)
              </span>
            )}
            {user.role === "admin" && (
              <Button onClick={() => setIsAddDialogOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Novo município
              </Button>
            )}
          </div>
        </div>

        <Card className="border shadow-sm">
          <CardContent className="pt-6 space-y-4">
            <Input
              placeholder="Buscar por nome, estado ou subdomínio..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full max-w-md"
            />

            {isLoading ? (
              <div className="flex min-h-[280px] items-center justify-center rounded-xl border border-dashed border-[#E5D5EA] dark:border-white/10 bg-muted/30">
                <Loader2 className="h-10 w-10 animate-spin text-[#7B3FE4]" />
              </div>
            ) : filteredCities.length === 0 ? (
              <div className="flex min-h-[200px] flex-col items-center justify-center rounded-xl border border-dashed border-[#E5D5EA] dark:border-white/10 bg-muted/20 px-4 text-center">
                <MapPin className="mb-3 h-12 w-12 text-muted-foreground/50" />
                <p className="text-sm font-medium text-muted-foreground">
                  {searchQuery ? "Nenhum município encontrado para a busca." : "Nenhum município cadastrado."}
                </p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filteredCities.map((city) => (
                  <Card
                    key={city.id}
                    className={cn(
                      "group overflow-hidden transition-all duration-200",
                      "border-[#E5D5EA] hover:border-[#7B3FE4]/40 hover:shadow-md dark:border-white/10 dark:hover:border-[#7B3FE4]/40"
                    )}
                  >
                    <CardContent className="p-4 sm:p-5">
                      <div className="flex flex-col gap-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate font-semibold text-foreground">{city.name}</h3>
                            <span
                              className={cn(
                                "mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                                (city.entitlements?.plan_code ?? city.plan_code ?? "basic") === "plus"
                                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                                  : "bg-muted text-muted-foreground"
                              )}
                            >
                              Plano {city.entitlements?.plan_code ?? city.plan_code ?? "basic"}
                            </span>
                            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                              <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                              {city.state}
                            </p>
                          </div>
                          {user.role === "admin" && (
                            <div className="flex flex-shrink-0 gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => {
                                  setSelectedCity(city);
                                  setNewCity({ name: city.name, state: city.state, subdominio: city.slug ?? "" });
                                  setIsEditDialogOpen(true);
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => {
                                  setSelectedCity(city);
                                  setIsDeleteDialogOpen(true);
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
                        </div>
                        <div className="space-y-2">
                          <a
                            href={subdomainConfig.url(city.slug || "")}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-lg border border-[#E5D5EA] dark:border-white/10",
                              "bg-muted/30 px-3 py-2 text-sm font-mono text-[#7B3FE4] w-full",
                              "transition-colors hover:bg-[#7B3FE4]/10 hover:border-[#7B3FE4]/30"
                            )}
                          >
                            <span className="truncate">{city.slug || "—"}</span>
                            <ExternalLink className="h-3.5 w-3.5 flex-shrink-0 ml-auto" />
                          </a>
                          <p className="text-xs text-muted-foreground">
                            Subdomínio · {city.slug}.{subdomainConfig.displayHost}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openUsersModal(city)}
                          className="mt-1 w-full gap-2 border-[#E5D5EA] dark:border-white/10"
                        >
                          <Users className="h-4 w-4" />
                          Ver usuários
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modal Ver usuários */}
      <Dialog open={usersModalOpen} onOpenChange={setUsersModalOpen}>
        <DialogContent className="max-h-[90vh] w-[95vw] max-w-2xl overflow-hidden flex flex-col p-0 sm:rounded-lg">
          <DialogHeader className="shrink-0 border-b border-[#E5D5EA] px-4 py-4 dark:border-white/10 sm:px-6">
            <DialogTitle className="flex flex-wrap items-center gap-2 text-left">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#7B3FE4]/10">
                <Users className="h-4 w-4 text-[#7B3FE4]" />
              </div>
              <span>Usuários do município</span>
              {usersModalCity && (
                <span className="font-normal text-muted-foreground">
                  — {usersModalCity.name} ({usersModalCity.state})
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4 pr-2 sm:px-6 sm:pr-3">
            {usersLoading ? (
              <div className="flex min-h-[200px] items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-[#7B3FE4]" />
              </div>
            ) : usersData ? (
              <div className="space-y-6">
                <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                  Total: <span className="font-semibold text-foreground">{usersData.total}</span> usuário(s)
                </p>
                {(() => {
                  const byRole = usersData.users.reduce<Record<string, typeof usersData.users>>(
                    (acc, u) => {
                      const r = u.role || "outro";
                      if (!acc[r]) acc[r] = [];
                      acc[r].push(u);
                      return acc;
                    },
                    {}
                  );
                  const orderedRoles = [...ROLE_ORDER, ...Object.keys(byRole).filter((r) => !ROLE_ORDER.includes(r))];
                  return (
                    <div className="space-y-5">
                      {orderedRoles.map((role) => {
                        const list = byRole[role];
                        if (!list?.length) return null;
                        return (
                          <Card key={role} className="overflow-hidden border-[#E5D5EA] dark:border-white/10">
                            <div className="bg-[#7B3FE4]/5 px-3 py-2 dark:bg-[#7B3FE4]/10">
                              <h4 className="text-sm font-semibold text-[#7B3FE4]">
                                {getRoleDisplayName(role)}
                              </h4>
                            </div>
                            <CardContent className="p-0">
                              <ul className="divide-y divide-[#E5D5EA] dark:divide-white/10">
                                {list.map((u) => (
                                  <li
                                    key={u.id}
                                    className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3 py-2.5 text-sm"
                                  >
                                    <span className="font-medium text-foreground">{u.name}</span>
                                    <span className="text-muted-foreground">{u.email}</span>
                                  </li>
                                ))}
                              </ul>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhum dado carregado.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Add City Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar novo município</DialogTitle>
            <DialogDescription>
              Preencha os dados do município e selecione um estado existente ou digite um novo.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Nome do município</Label>
              <Input
                id="name"
                value={newCity.name}
                onChange={(e) => setNewCity({ ...newCity, name: e.target.value })}
                placeholder="Digite o nome do município"
                disabled={isAdding}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="state">Estado</Label>
              <Select
                value={existingStates.includes(newCity.state) ? newCity.state : "__manual__"}
                onValueChange={(value) =>
                  setNewCity({
                    ...newCity,
                    state: value === "__manual__" ? "" : value,
                  })
                }
                disabled={isAdding}
              >
                <SelectTrigger id="state-select">
                  <SelectValue placeholder="Selecione um estado existente (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__manual__">Digitar manualmente</SelectItem>
                  {existingStates.map((state) => (
                    <SelectItem key={state} value={state}>
                      {state}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                id="state"
                value={newCity.state}
                onChange={(e) => setNewCity({ ...newCity, state: e.target.value })}
                placeholder="Ou digite um novo estado"
                disabled={isAdding}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="subdominio">Subdomínio</Label>
              <Input
                id="subdominio"
                value={newCity.subdominio}
                onChange={(e) => setNewCity({ ...newCity, subdominio: e.target.value })}
                placeholder="ex: jiparana"
                disabled={isAdding}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Apenas letras minúsculas, números e hífens (ex.: jiparana). Será usado em endereços como nome.{subdomainConfig.displayHost}
              </p>
            </div>
            <Button onClick={handleAddCity} className="mt-2" disabled={isAdding}>
              {isAdding ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Criando...
                </>
              ) : (
                "Criar município"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit City Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar município</DialogTitle>
            <DialogDescription>
              Atualize os dados do município selecionado.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Nome do município</Label>
              <Input
                id="edit-name"
                value={newCity.name}
                onChange={(e) => setNewCity({ ...newCity, name: e.target.value })}
                placeholder="Digite o nome do município"
                disabled={isEditing}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-state">Estado</Label>
              <Input
                id="edit-state"
                value={newCity.state}
                onChange={(e) => setNewCity({ ...newCity, state: e.target.value })}
                placeholder="Digite o estado"
                disabled={isEditing}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-subdominio">Subdomínio</Label>
              <Input
                id="edit-subdominio"
                value={newCity.subdominio}
                onChange={(e) => setNewCity({ ...newCity, subdominio: e.target.value })}
                placeholder="ex: jiparana"
                disabled={isEditing}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Apenas letras minúsculas, números e hífens.
              </p>
            </div>
            <Button onClick={handleEditCity} className="mt-2" disabled={isEditing}>
              {isEditing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar alterações"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir município?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O município {selectedCity?.name} e os dados associados serão removidos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCity} disabled={isDeleting}>
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Excluindo...
                </>
              ) : (
                "Excluir"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
