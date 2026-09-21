import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Coins } from 'lucide-react';
import { getBalance } from '@/services/coinsApi';
import { formatCoins } from '@/utils/coins';
import { COINS_UPDATED_EVENT } from '@/constants/contentRewards';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface CoinBalanceProps {
  studentId?: string;
  size?: 'small' | 'medium' | 'large';
  showLabel?: boolean;
  /** Se true, exibe como card clicável (recomendado para aluno no histórico) */
  asCard?: boolean;
}

const sizeClasses = {
  small: 'text-sm',
  medium: 'text-base',
  large: 'text-2xl',
};

const iconSizes = {
  small: 'h-4 w-4',
  medium: 'h-5 w-5',
  large: 'h-7 w-7',
};

export const CoinBalance: React.FC<CoinBalanceProps> = ({
  studentId,
  size = 'medium',
  showLabel = true,
  asCard = false,
}) => {
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchBalance = async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      setError(null);
      try {
        const value = await getBalance(studentId);
        if (!cancelled) setBalance(value);
      } catch (err) {
        if (!cancelled) {
          console.error('Erro ao buscar saldo:', err);
          setError('Erro ao carregar saldo');
        }
      } finally {
        if (!cancelled && !opts?.silent) setLoading(false);
      }
    };

    fetchBalance();
    const onCoinsUpdated = () => {
      void fetchBalance({ silent: true });
    };
    window.addEventListener(COINS_UPDATED_EVENT, onCoinsUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener(COINS_UPDATED_EVENT, onCoinsUpdated);
    };
  }, [studentId]);

  if (loading) {
    return (
      <div
        className={cn(
          'coin-balance flex items-center gap-2 animate-pulse',
          asCard && 'rounded-xl border bg-muted/30 px-4 py-3'
        )}
        data-testid="coin-balance"
      >
        <Coins className={cn(iconSizes[size], 'text-muted-foreground')} />
        <span className={sizeClasses[size]}>—</span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={cn(
          'coin-balance flex items-center gap-2 text-muted-foreground',
          asCard && 'rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3'
        )}
        data-testid="coin-balance"
      >
        <Coins className={iconSizes[size]} />
        <span className={sizeClasses[size]}>{error}</span>
      </div>
    );
  }

  const displayValue = balance ?? 0;
  const content = (
    <div
      className={cn(
        'coin-balance flex items-center gap-2',
        sizeClasses[size],
        asCard &&
          'rounded-xl border-2 border-amber-200/60 dark:border-amber-800/50 bg-gradient-to-br from-amber-50/80 to-yellow-50/80 dark:from-amber-950/30 dark:to-yellow-950/30 px-4 py-3 shadow-sm'
      )}
      data-testid="coin-balance"
    >
      <Coins className={cn(iconSizes[size], 'text-amber-600 dark:text-amber-400')} />
      <span className="font-semibold tabular-nums">{formatCoins(displayValue)}</span>
      {showLabel && (
        <span className="text-muted-foreground text-sm">moedas</span>
      )}
    </div>
  );

  const showHistoryLink = !studentId;
  if (showHistoryLink) {
    const linkContent = (
      <Link
        to="/aluno/moedas/historico"
        className={cn(
          'flex items-center gap-2 transition-all rounded-xl',
          asCard
            ? 'hover:shadow-md hover:border-amber-300 dark:hover:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500/50'
            : 'hover:opacity-80'
        )}
      >
        {content}
      </Link>
    );
    if (!asCard) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
            <TooltipContent>
              <p>Ver histórico de moedas</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    return linkContent;
  }

  return content;
};
