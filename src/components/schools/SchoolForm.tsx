import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Building } from "lucide-react";
import { AREA_TYPE_FORM_OPTIONS, type SchoolAreaTypeCode } from "@/lib/schoolAreaType";

interface City {
  id: string;
  name: string;
  state: string;
  created_at: string;
}

interface School {
  id: string;
  name: string;
  city_id: string;
  address: string;
  domain: string;
  area_type?: SchoolAreaTypeCode | null;
  created_at: string;
  city: City;
}

interface SchoolFormProps {
  school?: School;
  /** Se definido em modo criação, o select mostra apenas este município (opção única). */
  lockedMunicipality?: { id: string; name: string; state: string };
  onClose: () => void;
  onSave: (school: Partial<School>) => void;
  onDelete?: (schoolId: string) => void;
  isLoading?: boolean;
}

export default function SchoolForm({
  school,
  lockedMunicipality,
  onClose,
  onSave,
  onDelete,
  isLoading = false,
}: SchoolFormProps) {
  const [formData, setFormData] = useState({
    name: school?.name || "",
    address: school?.address || "",
    domain: school?.domain || "",
    city_id:
      school?.city_id ||
      (!school && lockedMunicipality ? lockedMunicipality.id : "") ||
      "",
    area_type: school?.area_type || "",
  });
  const [cities, setCities] = useState<City[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  // Sincronizar formulário quando abrir em modo edição
  useEffect(() => {
    if (school) {
      setFormData({
        name: school.name || "",
        address: school.address || "",
        domain: school.domain || "",
        city_id: school.city_id || "",
        area_type: school.area_type || "",
      });
    }
  }, [school]);

  useEffect(() => {
    const fetchCities = async () => {
      try {
        const response = await api.get("/city/");
        setCities(response.data);
      } catch (error) {
        toast({
          title: "Erro",
          description: "Erro ao carregar municípios",
          variant: "destructive",
        });
      }
    };

    fetchCities();
  }, [toast]);

  const isCreateMode = !school;
  const singleMunicipalityMode = isCreateMode && Boolean(lockedMunicipality);

  const municipalityOptions: City[] = useMemo(() => {
    if (!singleMunicipalityMode || !lockedMunicipality) return cities;
    const fromApi = cities.find((c) => c.id === lockedMunicipality.id);
    if (fromApi) return [fromApi];
    return [
      {
        id: lockedMunicipality.id,
        name: lockedMunicipality.name,
        state: lockedMunicipality.state,
        created_at: "",
      },
    ];
  }, [singleMunicipalityMode, lockedMunicipality, cities]);

  useEffect(() => {
    if (!singleMunicipalityMode || !lockedMunicipality) return;
    setFormData((prev) =>
      prev.city_id === lockedMunicipality.id ? prev : { ...prev, city_id: lockedMunicipality.id }
    );
  }, [singleMunicipalityMode, lockedMunicipality]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim() || !formData.address.trim() || !formData.city_id || !formData.area_type) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha nome, endereço, município e tipo de área antes de salvar.",
        variant: "destructive",
      });
      return;
    }

    if (school) {
      // Modo edição: chamar PUT no backend
      setIsSaving(true);
      try {
        const payload = {
          name: formData.name.trim(),
          domain: formData.domain?.trim() || undefined,
          address: formData.address.trim(),
          city_id: formData.city_id,
          area_type: formData.area_type,
        };
        await api.put(`/school/${school.id}`, payload);
        const updatedCity = cities.find((c) => c.id === formData.city_id) || school.city;
        onSave({
          ...formData,
          city: updatedCity,
        });
        toast({
          title: "Sucesso",
          description: "Escola atualizada com sucesso",
        });
        onClose();
      } catch (error: unknown) {
        const axiosError = error as { response?: { data?: { erro?: string; detalhes?: string } } };
        const message =
          axiosError.response?.data?.erro ||
          axiosError.response?.data?.detalhes ||
          "Erro ao atualizar escola. Tente novamente.";
        toast({
          title: "Erro",
          description: message,
          variant: "destructive",
        });
      } finally {
        setIsSaving(false);
      }
      return;
    }

    // Modo criação (nova escola): comportamento existente
    try {
      onSave(formData);
      onClose();
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao salvar escola",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!school || !onDelete) return;
    setIsDeleting(true);

    try {
      await api.delete(`/school/${school.id}`);
      onDelete(school.id);
      toast({
        title: "Sucesso",
        description: "Escola excluída com sucesso",
      });
      onClose();
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao excluir escola",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="w-full max-w-[95vw] sm:max-w-2xl lg:max-w-3xl max-h-[95vh] overflow-hidden flex flex-col">
        <DialogHeader className="pb-3 border-b">
          <DialogTitle className="text-lg sm:text-xl flex items-center gap-2">
            <Building className="h-5 w-5 sm:h-6 sm:w-6 text-orange-600" />
            {school ? "Editar Escola" : "Nova Escola"}
          </DialogTitle>
          <DialogDescription>
            {school
              ? "Atualize os dados da escola."
              : "Cadastre uma nova escola informando nome, endereço e município."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100 py-4" autoComplete="off">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="flex items-center gap-1">
                Nome da Escola
                <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                disabled={isLoading || isDeleting || isSaving}
                autoComplete="off"
                className="h-11"
                placeholder="Nome completo da instituição"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="domain" className="flex items-center gap-1">
                Domínio
              </Label>
              <Input
                id="domain"
                value={formData.domain}
                onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                disabled={isLoading || isDeleting || isSaving}
                autoComplete="off"
                className="h-11"
                placeholder="exemplo.com.br"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="address" className="flex items-center gap-1">
              Endereço
              <span className="text-red-500">*</span>
            </Label>
            <Input
              id="address"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              required
              disabled={isLoading || isDeleting || isSaving}
              autoComplete="off"
              className="h-11"
            placeholder="Endereço completo da escola"
          />
          </div>
          <div className="space-y-2">
            <Label htmlFor="area_type" className="flex items-center gap-1">
              Tipo de área
              <span className="text-red-500">*</span>
            </Label>
            <Select
              value={formData.area_type || undefined}
              onValueChange={(value) => setFormData({ ...formData, area_type: value })}
              disabled={isLoading || isDeleting || isSaving}
            >
              <SelectTrigger id="area_type" className="h-11">
                <SelectValue placeholder="Selecione o tipo de área" />
              </SelectTrigger>
              <SelectContent>
                {AREA_TYPE_FORM_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="city" className="flex items-center gap-1">
              Município
              <span className="text-red-500">*</span>
            </Label>
            <Select
              value={formData.city_id || undefined}
              onValueChange={(value) => setFormData({ ...formData, city_id: value })}
              disabled={isLoading || isDeleting || isSaving}
            >
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Selecione um município" />
              </SelectTrigger>
              <SelectContent>
                {municipalityOptions.map((city) => (
                  <SelectItem key={city.id} value={city.id}>
                    {city.state ? `${city.name} - ${city.state}` : city.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {singleMunicipalityMode && lockedMunicipality && (
              <p className="text-xs text-muted-foreground">
                Somente o município do domínio (ou da sua conta) pode ser selecionado aqui.
              </p>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
            {school && onDelete && (
              <Button 
                type="button" 
                variant="destructive" 
                onClick={handleDelete}
                disabled={isLoading || isDeleting || isSaving}
                className="h-11 order-3 sm:order-1"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Excluindo...
                  </>
                ) : (
                  "Excluir Escola"
                )}
              </Button>
            )}
            <div className="flex flex-col sm:flex-row gap-3 flex-1 sm:justify-end">
              <Button 
                type="button" 
                variant="outline" 
                onClick={onClose} 
                disabled={isLoading || isDeleting || isSaving}
                className="h-11 order-2 sm:order-1"
              >
                Cancelar
              </Button>
              <Button 
                type="submit" 
                disabled={isLoading || isDeleting || isSaving}
                className="h-11 order-1 sm:order-2"
              >
                {isLoading || isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  school ? "Salvar Alterações" : "Criar Escola"
                )}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}