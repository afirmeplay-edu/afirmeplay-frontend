import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Edit, Trash2, Plus, Building, Eye, Search, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
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
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import SchoolForm from "./SchoolForm";
import { api } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { schoolAreaTypeLabel } from "@/lib/schoolAreaType";

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
  area_type?: string | null;
  created_at: string;
  students_count?: number;
  classes_count?: number;
  city: City;
}

export default function SchoolsTable() {
  const navigate = useNavigate();
  const [schools, setSchools] = useState<School[]>([]);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [currentSchool, setCurrentSchool] = useState<School | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoadingSchools, setIsLoadingSchools] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchSchools();
  }, []);

  const fetchSchools = async () => {
    try {
      setIsLoadingSchools(true);
      const response = await api.get("/school");
      setSchools(response.data || []);
    } catch (error) {
      console.error("Error fetching schools:", error);
      toast({
        title: "Erro",
        description: "Erro ao carregar escolas. Verifique sua conexão.",
        variant: "destructive",
      });
      setSchools([]);
    } finally {
      setIsLoadingSchools(false);
    }
  };

  // Filter schools based on search query
  const filteredSchools = schools?.filter((school) =>
    school.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    school.city?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    school.address?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Handler for adding a school
  const handleAddSchool = async (schoolData: Partial<School>) => {
    try {
      await api.post("/school", schoolData);
      await fetchSchools(); // Refresh the schools list
      setIsAddDialogOpen(false);
      toast({
        title: "Sucesso",
        description: "Escola criada com sucesso!",
      });
    } catch (error: any) {
      console.error("Error creating school:", error);
      toast({
        title: "Erro",
        description: error.response?.data?.error || "Erro ao criar escola",
        variant: "destructive",
      });
    }
  };

  // Handler for editing a school
  const handleEditSchool = async (_schoolData: Partial<School>) => {
    if (!currentSchool) return;
    try {
      // SchoolForm já fez PUT com payload válido; só atualiza a lista.
      await fetchSchools();
      setIsEditDialogOpen(false);
      setCurrentSchool(null);
      toast({
        title: "Sucesso",
        description: "Escola atualizada com sucesso!",
      });
    } catch (error: any) {
      console.error("Error updating school:", error);
      toast({
        title: "Erro",
        description: error.response?.data?.error || "Erro ao atualizar escola",
        variant: "destructive",
      });
    }
  };

  // Handler for deleting a school
  const handleDeleteSchool = async () => {
    if (!currentSchool) return;
    
    try {
      setIsDeleting(true);
      await api.delete(`/school/${currentSchool.id}`);
      await fetchSchools(); // Refresh the schools list
      setIsDeleteDialogOpen(false);
      setCurrentSchool(null);
      toast({
        title: "Sucesso",
        description: "Escola excluída com sucesso!",
      });
    } catch (error: any) {
      console.error("Error deleting school:", error);
      toast({
        title: "Erro",
        description: error.response?.data?.error || "Erro ao excluir escola",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Handler for viewing a school
  const handleViewSchool = (schoolId: string) => {
    navigate(`/app/escola/${schoolId}`);
  };

  if (isLoadingSchools) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="h-10 w-64" />
        <div className="space-y-3">
          {[...Array(5)].map((_, index) => (
            <div key={index} className="flex space-x-4">
              <Skeleton className="h-12 flex-1" />
              <Skeleton className="h-12 w-32" />
              <Skeleton className="h-12 w-24" />
              <Skeleton className="h-12 w-32" />
              <Skeleton className="h-12 w-32" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold">Escolas</h2>
          <p className="text-muted-foreground">
            Gerencie as escolas cadastradas no sistema
          </p>
        </div>
        <Button onClick={() => setIsAddDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nova Escola
        </Button>
      </div>

      <div className="flex items-center space-x-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar escolas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <Button
          variant="outline"
          onClick={fetchSchools}
          disabled={isLoadingSchools}
        >
          {isLoadingSchools ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Atualizar"
          )}
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Município</TableHead>
              <TableHead>Tipo de área</TableHead>
              <TableHead>Endereço</TableHead>
              <TableHead>Domínio</TableHead>
              <TableHead className="hidden lg:table-cell">Alunos</TableHead>
              <TableHead className="hidden lg:table-cell">Turmas</TableHead>
              <TableHead className="w-[150px]">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!filteredSchools || filteredSchools.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-6">
                  <div className="flex flex-col items-center gap-2">
                    <Building className="h-10 w-10 text-gray-400" />
                    <h3 className="font-medium text-lg">
                      {searchQuery ? "Nenhuma escola encontrada" : "Nenhuma escola cadastrada"}
                    </h3>
                    <p className="text-gray-500">
                      {searchQuery
                        ? "Tente uma busca diferente ou adicione uma nova escola."
                        : "Adicione uma nova escola para começar."}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredSchools.map((school) => (
                <TableRow key={school.id}>
                  <TableCell className="font-medium">{school.name}</TableCell>
                  <TableCell>{school.city?.name || "Não informado"} - {school.city?.state || ""}</TableCell>
                  <TableCell>{schoolAreaTypeLabel(school.area_type)}</TableCell>
                  <TableCell className="max-w-xs truncate" title={school.address}>
                    {school.address || "Não informado"}
                  </TableCell>
                  <TableCell>{school.domain || "Não informado"}</TableCell>
                  <TableCell className="hidden lg:table-cell">{school.students_count || 0}</TableCell>
                  <TableCell className="hidden lg:table-cell">{school.classes_count || 0}</TableCell>
                  <TableCell>
                    <div className="flex space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewSchool(school.id)}
                        title="Visualizar escola"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setCurrentSchool(school);
                          setIsEditDialogOpen(true);
                        }}
                        title="Editar escola"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setCurrentSchool(school);
                          setIsDeleteDialogOpen(true);
                        }}
                        title="Excluir escola"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add School Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar Nova Escola</DialogTitle>
          </DialogHeader>
          <SchoolForm 
            onClose={() => setIsAddDialogOpen(false)}
            onSave={handleAddSchool}
          />
        </DialogContent>
      </Dialog>

      {/* Edit School Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Escola</DialogTitle>
          </DialogHeader>
          <SchoolForm 
            school={currentSchool || undefined}
            onClose={() => {
              setIsEditDialogOpen(false);
              setCurrentSchool(null);
            }}
            onSave={handleEditSchool}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a escola "{currentSchool?.name}"?
              Esta ação não pode ser desfeita e removerá todos os dados associados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteSchool}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
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