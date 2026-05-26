import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/context/authContext';
import { api } from '@/lib/api';
import {
  getCityBranding,
  uploadCityLogo,
  uploadCityLetterhead,
  deleteCityBranding,
  getBrandingErrorMessage,
  resolveBrandingUrls,
  type CityBrandingResponse,
} from '@/services/cityBrandingApi';
import {
  loadBrandingImage,
  revokeBrandingImage,
} from '@/utils/brandingImageUtils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Building2, FileImage, FileText, Loader2, Trash2, Upload } from 'lucide-react';
import { toast } from 'react-toastify';

const BRANDING_CITY_STORAGE_KEY = 'settings_branding_city_id';

const VIEW_ROLES = ['admin', 'tecadm', 'diretor', 'coordenador', 'professor'];
const EDIT_ROLES = ['admin', 'tecadm', 'diretor', 'coordenador'];

interface CityRow {
  id: string;
  name: string;
  state?: string;
}

function effectiveCityIdFromUser(user: { city_id?: string; tenant_id?: string }): string | null {
  const id = user.city_id?.trim() || user.tenant_id?.trim();
  return id || null;
}

export function MunicipalityBrandingSection() {
  const { user } = useAuth();
  const role = (user.role ?? '').toLowerCase();
  const canView = VIEW_ROLES.includes(role);
  const canEdit = EDIT_ROLES.includes(role);
  const isAdminLike = role === 'admin' || role === 'tecadm';

  const [cities, setCities] = useState<CityRow[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [selectedCityId, setSelectedCityId] = useState<string>('');

  const [branding, setBranding] = useState<CityBrandingResponse | null>(null);
  const [brandingLoading, setBrandingLoading] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [letterheadUploading, setLetterheadUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [storePdf, setStorePdf] = useState(true);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | undefined>(undefined);
  const [letterheadImagePreviewUrl, setLetterheadImagePreviewUrl] = useState<string | undefined>(undefined);
  const [letterheadPdfPreviewUrl, setLetterheadPdfPreviewUrl] = useState<string | undefined>(undefined);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const letterheadInputRef = useRef<HTMLInputElement>(null);

  const brandingUrls = useMemo(() => resolveBrandingUrls(branding), [branding]);

  const userCityId = useMemo(() => effectiveCityIdFromUser(user), [user.city_id, user.tenant_id]);

  const resolvedCityId = isAdminLike ? selectedCityId : userCityId ?? '';

  useEffect(() => {
    if (!isAdminLike || !canView) return;
    let cancelled = false;
    setCitiesLoading(true);
    api
      .get<CityRow[]>('/city/')
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res.data) ? res.data : [];
        setCities(list.map((c) => ({ id: c.id, name: c.name, state: c.state })));
      })
      .catch(() => {
        if (!cancelled) {
          setCities([]);
          toast.error('Não foi possível carregar a lista de municípios.');
        }
      })
      .finally(() => {
        if (!cancelled) setCitiesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdminLike, canView]);

  useEffect(() => {
    if (!isAdminLike || cities.length === 0) return;
    try {
      const saved = sessionStorage.getItem(BRANDING_CITY_STORAGE_KEY);
      if (saved && cities.some((c) => c.id === saved)) {
        setSelectedCityId(saved);
        return;
      }
    } catch {
      /* ignore */
    }
    setSelectedCityId((prev) => (prev && cities.some((c) => c.id === prev) ? prev : cities[0].id));
  }, [isAdminLike, cities]);

  const loadBranding = useCallback(async () => {
    if (!resolvedCityId) {
      setBranding(null);
      return;
    }
    setBrandingLoading(true);
    try {
      const data = await getCityBranding(resolvedCityId);
      setBranding(data);
    } catch (err: unknown) {
      setBranding(null);
      toast.error(getBrandingErrorMessage(err));
    } finally {
      setBrandingLoading(false);
    }
  }, [resolvedCityId]);

  useEffect(() => {
    if (!canView || !resolvedCityId) return;
    loadBranding();
  }, [canView, resolvedCityId, loadBranding]);

  useEffect(() => {
    const logoUrl = brandingUrls.logo_url;
    const lhImgUrl = brandingUrls.letterhead_image_url;
    const lhPdfUrl = brandingUrls.letterhead_pdf_url;
    let cancelled = false;

    setLogoPreviewUrl(undefined);
    setLetterheadImagePreviewUrl(undefined);
    setLetterheadPdfPreviewUrl(undefined);

    (async () => {
      const [logo, lhImg, lhPdf] = await Promise.all([
        loadBrandingImage(logoUrl),
        loadBrandingImage(lhImgUrl),
        loadBrandingImage(lhPdfUrl),
      ]);
      if (cancelled) return;
      setLogoPreviewUrl(logo);
      setLetterheadImagePreviewUrl(lhImg);
      setLetterheadPdfPreviewUrl(lhPdf);
    })();

    return () => {
      cancelled = true;
      if (logoUrl) revokeBrandingImage(logoUrl);
      if (lhImgUrl) revokeBrandingImage(lhImgUrl);
      if (lhPdfUrl) revokeBrandingImage(lhPdfUrl);
    };
  }, [brandingUrls.logo_url, brandingUrls.letterhead_image_url, brandingUrls.letterhead_pdf_url]);

  const onAdminCityChange = (cityId: string) => {
    setSelectedCityId(cityId);
    try {
      sessionStorage.setItem(BRANDING_CITY_STORAGE_KEY, cityId);
    } catch {
      /* ignore */
    }
  };

  const onLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !resolvedCityId || !canEdit) return;
    const replace = !!branding?.logo_object_key;
    setLogoUploading(true);
    try {
      await uploadCityLogo(resolvedCityId, file, replace);
      toast.success('Logo atualizado.');
      await loadBranding();
    } catch (err: unknown) {
      toast.error(getBrandingErrorMessage(err));
    } finally {
      setLogoUploading(false);
    }
  };

  const onLetterheadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !resolvedCityId || !canEdit) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Envie um arquivo PDF para o timbrado.');
      return;
    }
    const replace = !!letterheadExists(branding);
    setLetterheadUploading(true);
    try {
      await uploadCityLetterhead(resolvedCityId, file, { replace, storePdf });
      toast.success('Timbrado atualizado.');
      await loadBranding();
    } catch (err: unknown) {
      toast.error(getBrandingErrorMessage(err));
    } finally {
      setLetterheadUploading(false);
    }
  };

  const runDelete = async (logo: boolean, letterhead: boolean) => {
    if (!resolvedCityId || !canEdit) return;
    setDeleting(true);
    try {
      await deleteCityBranding(resolvedCityId, { logo, letterhead });
      toast.success('Arquivos removidos.');
      await loadBranding();
    } catch (err: unknown) {
      toast.error(getBrandingErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  if (!canView) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Identidade visual do município
        </CardTitle>
        <CardDescription>
          Logo e timbrado usados nos relatórios. O timbrado deve ser enviado em PDF; o servidor gera a imagem
          (primeira página) para visualização e exportação.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isAdminLike && (
          <div className="space-y-2">
            <Label htmlFor="branding-city">Município</Label>
            {citiesLoading ? (
              <Skeleton className="h-10 w-full max-w-md" />
            ) : cities.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum município disponível.</p>
            ) : (
              <Select value={selectedCityId} onValueChange={onAdminCityChange}>
                <SelectTrigger id="branding-city" className="w-full max-w-md">
                  <SelectValue placeholder="Selecione o município" />
                </SelectTrigger>
                <SelectContent>
                  {cities.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                      {c.state ? ` (${c.state})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {!isAdminLike && !userCityId && (
          <p className="text-sm text-muted-foreground">
            Não foi possível identificar o município do seu usuário. Entre em contato com o suporte.
          </p>
        )}

        {resolvedCityId && (
          <>
            {brandingLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-32 w-full max-w-md" />
                <Skeleton className="h-48 w-full max-w-md" />
              </div>
            ) : (
              <>
                <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <FileImage className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Logo</span>
                  </div>
                  {brandingUrls.logo_url ? (
                    logoPreviewUrl ? (
                      <div className="flex flex-wrap items-end gap-4">
                        <img
                          src={logoPreviewUrl}
                          alt="Logo do município"
                          className="max-h-24 max-w-[200px] object-contain rounded border bg-white p-2"
                        />
                      </div>
                    ) : (
                      <Skeleton className="h-24 w-[200px]" />
                    )
                  ) : (
                    <p className="text-sm text-muted-foreground">Nenhum logo enviado.</p>
                  )}
                  {canEdit && (
                    <div className="flex flex-wrap items-center gap-2 pt-2">
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/webp"
                        className="sr-only"
                        tabIndex={-1}
                        disabled={logoUploading}
                        onChange={onLogoFile}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={logoUploading}
                        onClick={() => logoInputRef.current?.click()}
                      >
                        {logoUploading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Upload className="h-4 w-4" />
                        )}
                        <span className="ml-2">
                          {branding?.logo_object_key ? 'Substituir logo' : 'Enviar logo'}
                        </span>
                      </Button>
                      {branding?.logo_object_key && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button type="button" variant="ghost" size="sm" className="text-destructive" disabled={deleting}>
                              <Trash2 className="h-4 w-4 mr-1" />
                              Remover logo
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remover logo?</AlertDialogTitle>
                              <AlertDialogDescription>
                                O arquivo do logo será apagado do armazenamento deste município.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => runDelete(true, false)}>Remover</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Timbrado</span>
                  </div>
                  {brandingUrls.letterhead_image_url ? (
                    letterheadImagePreviewUrl ? (
                      <div className="space-y-2">
                        <img
                          src={letterheadImagePreviewUrl}
                          alt="Prévia do timbrado"
                          className="max-h-64 w-full max-w-md object-contain rounded border bg-white p-2"
                        />
                        {brandingUrls.letterhead_pdf_url && letterheadPdfPreviewUrl && (
                          <a
                            href={letterheadPdfPreviewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary underline"
                          >
                            Abrir PDF do timbrado
                          </a>
                        )}
                      </div>
                    ) : (
                      <Skeleton className="h-64 w-full max-w-md" />
                    )
                  ) : (
                    <p className="text-sm text-muted-foreground">Nenhum timbrado enviado.</p>
                  )}
                  {canEdit && (
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="store-pdf"
                          checked={storePdf}
                          onCheckedChange={(v) => setStorePdf(v === true)}
                        />
                        <Label htmlFor="store-pdf" className="text-sm font-normal cursor-pointer">
                          Guardar também o PDF original no servidor
                        </Label>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          ref={letterheadInputRef}
                          type="file"
                          accept="application/pdf,.pdf"
                          className="sr-only"
                          tabIndex={-1}
                          disabled={letterheadUploading}
                          onChange={onLetterheadFile}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={letterheadUploading}
                          onClick={() => letterheadInputRef.current?.click()}
                        >
                          {letterheadUploading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Upload className="h-4 w-4" />
                          )}
                          <span className="ml-2">
                            {letterheadExists(branding) ? 'Substituir timbrado (PDF)' : 'Enviar timbrado (PDF)'}
                          </span>
                        </Button>
                        {letterheadExists(branding) && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-destructive"
                                disabled={deleting}
                              >
                                <Trash2 className="h-4 w-4 mr-1" />
                                Remover timbrado
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remover timbrado?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Imagem e PDF (se existirem) serão removidos para este município.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => runDelete(false, true)}>Remover</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {canEdit && hasAnyBranding(branding) && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button type="button" variant="outline" size="sm" disabled={deleting}>
                        Remover logo e timbrado
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remover toda a identidade visual?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Logo e timbrado (PNG e PDF quando existirem) serão apagados.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => runDelete(true, true)}>Remover tudo</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function letterheadExists(b: CityBrandingResponse | null): boolean {
  return !!(b?.letterhead_image_object_key || b?.letterhead_pdf_object_key);
}

function hasAnyBranding(b: CityBrandingResponse | null): boolean {
  return !!(b?.logo_object_key || letterheadExists(b));
}
