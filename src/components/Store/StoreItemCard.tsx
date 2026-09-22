import React from 'react';
import { ShoppingBag, Coins, Sparkles, Palette, Shield, Gift, Lock } from 'lucide-react';
import type { StoreItem } from '@/types/store';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatCoins } from '@/utils/coins';
import { cn } from '@/lib/utils';
import { getStoreIcon, getStoreIconGradient } from '@/constants/storeIcons';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  frame: Sparkles,
  stamp: Shield,
  sidebar_theme: Palette,
  physical: Gift,
};

export interface StoreItemCardProps {
  item: StoreItem;
  balance: number;
  onPurchase: (itemId: string) => void;
  loading?: boolean;
}

export const StoreItemCard: React.FC<StoreItemCardProps> = ({
  item,
  balance,
  onPurchase,
  loading = false,
}) => {
  const customIcon = getStoreIcon(item.icon);
  const Icon = customIcon ?? (CATEGORY_ICONS[item.category] ?? Gift);
  const iconColorKey =
    item.category === 'sidebar_theme' && item.reward_data
      ? item.reward_data
      : item.icon_color;
  const iconGradient = getStoreIconGradient(iconColorKey);
  const alreadyPurchased = item.already_purchased === true;
  const lockedByRequirement =
    !alreadyPurchased && Boolean(item.requirement) && item.requirement_met === false;
  const insufficientBalance = balance < item.price;
  const canPurchase = !alreadyPurchased && !lockedByRequirement && !insufficientBalance && !loading;

  const purchaseButton = (
    <Button
      className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
      size="sm"
      onClick={() => canPurchase && onPurchase(item.id)}
      disabled={!canPurchase}
    >
      {loading ? (
        'Processando...'
      ) : alreadyPurchased ? (
        'Já comprado'
      ) : lockedByRequirement ? (
        'Bloqueado'
      ) : (
        <>
          <ShoppingBag className="h-4 w-4 mr-2" />
          Comprar
        </>
      )}
    </Button>
  );

  return (
    <Card
      className={cn(
        'overflow-hidden transition-all flex flex-col',
        alreadyPurchased
          ? 'opacity-80 border-muted'
          : lockedByRequirement
            ? 'opacity-90 border-muted'
            : 'hover:shadow-lg hover:border-primary/30 border-primary/20'
      )}
    >
      <div className="relative">
        <div className="h-28 flex items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5 dark:from-primary/20 dark:to-primary/10">
          <div className={cn('flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br shadow-md', iconGradient)}>
            <Icon className="h-7 w-7 text-white" />
          </div>
        </div>
        {alreadyPurchased && (
          <span className="absolute top-2 right-2 rounded-full bg-green-600 px-2 py-0.5 text-xs font-medium text-white shadow">
            Já comprado
          </span>
        )}
        {lockedByRequirement && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/65">
            <span className="rounded-full bg-muted p-2 shadow">
              <Lock className="h-6 w-6 text-muted-foreground" />
            </span>
          </div>
        )}
      </div>
      <CardContent className="p-4 flex-1 flex flex-col">
        <h3 className="font-semibold text-foreground mb-1">{item.name}</h3>
        {item.description?.trim() ? (
          <p className="text-sm text-muted-foreground flex-1 line-clamp-2">
            {item.description}
          </p>
        ) : null}
        {lockedByRequirement && item.requirement_reason ? (
          <p className="text-xs text-muted-foreground mt-2 flex items-start gap-1.5">
            <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{item.requirement_reason}</span>
          </p>
        ) : null}
        <div className="flex items-center gap-1.5 mt-3">
          <Coins className="h-4 w-4 text-primary" />
          <span className="font-bold text-primary tabular-nums">
            {formatCoins(item.price)}
          </span>
          <span className="text-xs text-muted-foreground">AfirmeCoins</span>
        </div>
      </CardContent>
      <CardFooter className="p-4 pt-0">
        {insufficientBalance && !alreadyPurchased && !lockedByRequirement ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="w-full block">{purchaseButton}</span>
              </TooltipTrigger>
              <TooltipContent>
                <p>Saldo insuficiente</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          purchaseButton
        )}
      </CardFooter>
    </Card>
  );
};
