import { Badge } from '@/components/ui/badge';
import { Check } from 'lucide-react';

interface RewardBadgeProps {
  claimed: boolean;
  coins: number;
  className?: string;
}

export function RewardBadge({ claimed, coins, className }: RewardBadgeProps) {
  if (claimed) {
    return (
      <Badge
        variant="outline"
        className={`text-[11px] font-medium border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-400 ${className ?? ''}`}
      >
        <Check className="w-3 h-3 mr-1" />
        Moedas recebidas
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className={`text-[11px] font-medium border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300 ${className ?? ''}`}
    >
      🪙 +{coins}
    </Badge>
  );
}
