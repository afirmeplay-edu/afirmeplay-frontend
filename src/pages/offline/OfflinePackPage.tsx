import { useState } from 'react';
import { List, Plus, Smartphone } from 'lucide-react';
import { useAuth } from '@/context/authContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { RegisterOfflinePackResponse } from '@/services/mobile/offlinePackApi';
import { OfflinePackCreateTab } from './OfflinePackCreateTab';
import { OfflinePackListTab } from './OfflinePackListTab';
import { OfflinePackQrDialog } from './OfflinePackQrDialog';
import { MobileCitiesAdminDialog } from './MobileCitiesAdminDialog';
import { useOfflinePackForm } from './useOfflinePackForm';

export default function OfflinePackPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('gerar');
  const [listRefreshToken, setListRefreshToken] = useState(0);
  const [createdQrOpen, setCreatedQrOpen] = useState(false);
  const [createdQr, setCreatedQr] = useState<Pick<
    RegisterOfflinePackResponse,
    'code' | 'qr_code_data_url'
  > | null>(null);
  const form = useOfflinePackForm();

  const isAdmin = (user?.role ?? '').toLowerCase() === 'admin';

  const handleCreated = (data: RegisterOfflinePackResponse) => {
    setListRefreshToken((n) => n + 1);
    if (data.qr_code_data_url) {
      setCreatedQr({ code: data.code, qr_code_data_url: data.qr_code_data_url });
      setCreatedQrOpen(true);
    }
    setActiveTab('codigos');
  };

  const handleCreatedQrOpenChange = (open: boolean) => {
    setCreatedQrOpen(open);
    if (!open) setCreatedQr(null);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-4 pb-16 md:p-6 lg:p-8">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Smartphone className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Modo offline</h1>
              <p className="text-muted-foreground text-sm">
                Gere e gerencie códigos para o aplicativo móvel baixar dados do município ou de um escopo
                personalizado.
              </p>
            </div>
          </div>
          <MobileCitiesAdminDialog isAdmin={isAdmin} />
        </div>
      </header>

      <OfflinePackQrDialog
        open={createdQrOpen}
        onOpenChange={handleCreatedQrOpenChange}
        code={createdQr?.code}
        qrDataUrl={createdQr?.qr_code_data_url}
        title="Código gerado"
        description="Escaneie o QR no aplicativo ou copie o código abaixo. O mesmo código permanece após edições futuras do pacote."
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="gerar" className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Gerar código
          </TabsTrigger>
          <TabsTrigger value="codigos" className="flex items-center gap-2">
            <List className="h-4 w-4" />
            Códigos gerados
          </TabsTrigger>
        </TabsList>

        <TabsContent value="gerar" className="mt-6 space-y-6">
          <OfflinePackCreateTab form={form} onCreated={handleCreated} />
        </TabsContent>

        <TabsContent value="codigos" className="mt-6">
          <OfflinePackListTab form={form} refreshToken={listRefreshToken} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
