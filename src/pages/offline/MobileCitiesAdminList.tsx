import { useEffect, useState } from 'react';
import { Loader2, Trash2, Server, Cloud } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  deleteMobileCity,
  getMobileCityApiError,
  listMobileCities,
  type MobileCityDirectory,
} from '@/services/mobile/mobileCitiesAdminApi';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface MobileCitiesAdminListProps {
  refreshTrigger: number;
  onCityDeleted: () => void;
}

export function MobileCitiesAdminList({
  refreshTrigger,
  onCityDeleted,
}: MobileCitiesAdminListProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [cities, setCities] = useState<MobileCityDirectory[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [cityToDelete, setCityToDelete] = useState<MobileCityDirectory | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadCities();
  }, [refreshTrigger]);

  const loadCities = async () => {
    setLoading(true);
    try {
      const response = await listMobileCities();
      setCities(response.cities || []);
    } catch (err: unknown) {
      toast({
        title: 'Erro ao carregar municípios',
        description: getMobileCityApiError(err, 'Não foi possível carregar a lista.'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (city: MobileCityDirectory) => {
    setCityToDelete(city);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!cityToDelete) return;

    setDeleting(true);
    try {
      await deleteMobileCity(cityToDelete.id);
      toast({
        title: 'Município removido',
        description: `${cityToDelete.city_name} foi removido do catálogo mobile.`,
      });
      setDeleteDialogOpen(false);
      setCityToDelete(null);
      onCityDeleted();
    } catch (err: unknown) {
      toast({
        title: 'Erro ao remover',
        description: getMobileCityApiError(err, 'Não foi possível remover o município.'),
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (cities.length === 0) {
    return (
      <Alert>
        <AlertDescription>
          Nenhum município cadastrado no mobile. Use a aba "Adicionar Município" para começar.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Município</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Tenant Code</TableHead>
              <TableHead>Modo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cities.map((city) => (
              <TableRow key={city.id}>
                <TableCell className="font-medium">{city.city_name}</TableCell>
                <TableCell>
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{city.city_slug}</code>
                </TableCell>
                <TableCell>
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                    {city.tenant_code}
                  </code>
                </TableCell>
                <TableCell>
                  {city.hosting_mode === 'shared' ? (
                    <Badge variant="secondary" className="gap-1">
                      <Cloud className="h-3 w-3" />
                      VPS Central
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1">
                      <Server className="h-3 w-3" />
                      VPS Dedicada
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    {city.mobile_visible && (
                      <Badge variant="default" className="w-fit text-xs">
                        Visível
                      </Badge>
                    )}
                    {city.is_active && (
                      <Badge variant="secondary" className="w-fit text-xs">
                        Ativo
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteClick(city)}
                    aria-label={`Remover ${city.city_name}`}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover município do mobile?</AlertDialogTitle>
            <AlertDialogDescription>
              {cityToDelete && (
                <>
                  O município <strong>{cityToDelete.city_name}</strong> será removido do catálogo
                  mobile e não aparecerá mais no aplicativo.
                  <br />
                  <br />
                  Esta ação não pode ser desfeita.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Removendo...
                </>
              ) : (
                'Remover'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
