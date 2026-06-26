import { useState } from 'react';
import { Settings } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MobileCitiesAdminList } from './MobileCitiesAdminList';
import { MobileCitiesAdminForm } from './MobileCitiesAdminForm';

interface MobileCitiesAdminDialogProps {
  isAdmin: boolean;
}

export function MobileCitiesAdminDialog({ isAdmin }: MobileCitiesAdminDialogProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('list');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  if (!isAdmin) return null;

  const handleCityAdded = () => {
    setRefreshTrigger((prev) => prev + 1);
    setActiveTab('list');
  };

  const handleCityDeleted = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings className="mr-2 h-4 w-4" />
          Gerenciar Municípios Mobile
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerenciar Municípios Mobile</DialogTitle>
          <DialogDescription>
            Adicione ou remova municípios que aparecem no aplicativo mobile offline.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="list">Municípios no Mobile</TabsTrigger>
            <TabsTrigger value="add">Adicionar Município</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="mt-4">
            <MobileCitiesAdminList
              refreshTrigger={refreshTrigger}
              onCityDeleted={handleCityDeleted}
            />
          </TabsContent>

          <TabsContent value="add" className="mt-4">
            <MobileCitiesAdminForm onSuccess={handleCityAdded} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
