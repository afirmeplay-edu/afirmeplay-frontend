import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Coins } from 'lucide-react';

export interface RewardEarnedModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coins: number;
  title?: string;
  description?: string;
}

export function RewardEarnedModal({
  open,
  onOpenChange,
  coins,
  title = 'Você ganhou moedas!',
  description,
}: RewardEarnedModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex justify-center">
            <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-4">
              <CheckCircle2 className="h-14 w-14 text-green-600 dark:text-green-400" />
            </div>
          </div>
          <DialogTitle className="text-center text-xl">{title}</DialogTitle>
          <DialogDescription className="text-center sr-only">
            {description || `Você ganhou ${coins} moedas.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-6">
            <div className="flex items-center gap-2">
              <Coins className="h-8 w-8 text-amber-500 animate-bounce" aria-hidden />
              <span
                className="text-2xl font-bold text-amber-700 dark:text-amber-400 animate-pulse"
                style={{ animationDuration: '1.5s' }}
              >
                +{coins} moedas!
              </span>
            </div>
            {description ? (
              <p className="text-sm text-center text-muted-foreground">{description}</p>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button className="w-full" onClick={() => onOpenChange(false)}>
            Continuar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
