import { Copy, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

interface OfflinePackQrDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  code?: string | null;
  qrDataUrl?: string | null;
  loading?: boolean;
  title?: string;
  description?: string;
}

export function OfflinePackQrDialog({
  open,
  onOpenChange,
  code,
  qrDataUrl,
  loading = false,
  title = 'QR Code do código',
  description = 'Escaneie no aplicativo móvel ou compartilhe a imagem com quem deve ativar o modo offline.',
}: OfflinePackQrDialogProps) {
  const { toast } = useToast();

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      toast({ title: 'Copiado', description: 'Código copiado.' });
    } catch {
      toast({ title: 'Não foi possível copiar', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-2">
          {loading ? (
            <div className="flex h-[256px] w-[256px] items-center justify-center rounded-lg border bg-muted/30">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt={code ? `QR Code do código ${code}` : 'QR Code do código offline'}
              width={256}
              height={256}
              className="rounded-lg border bg-white"
            />
          ) : (
            <p className="text-muted-foreground text-sm">QR Code indisponível.</p>
          )}
          {code && (
            <div className="w-full space-y-2">
              <Label>Código</Label>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <code className="bg-background rounded-lg border px-4 py-2 text-base font-semibold tracking-widest">
                  {code}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={copyCode}
                  disabled={loading}
                  aria-label="Copiar código"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
