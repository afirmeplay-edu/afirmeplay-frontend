import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Shield, Palette, Check } from 'lucide-react';
import { storeApi } from '@/services/store/storeService';
import type { StudentPurchase } from '@/types/store';
import { useStudentPreferences } from '@/context/StudentPreferencesContext';
import { Skeleton } from '@/components/ui/skeleton';

export const RewardsPreferencesSection: React.FC = () => {
  const prefs = useStudentPreferences();
  const [purchases, setPurchases] = useState<StudentPurchase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    storeApi
      .getMyPurchases({ limit: 100, offset: 0 })
      .then(({ data }) => {
        if (!cancelled) setPurchases(data.purchases ?? []);
      })
      .catch(() => {
        if (!cancelled) setPurchases([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stamps = purchases.filter((p) => String(p.reward_type ?? '').trim().toLowerCase() === 'stamp');
  const themes = purchases.filter((p) => String(p.reward_type ?? '').trim().toLowerCase() === 'sidebar_theme');
  const selectedStampId = prefs?.preferences?.stamp_id ?? null;
  const selectedThemeId = prefs?.preferences?.sidebar_theme_id ?? null;

  const handleUseStamp = (rewardData: string | null) => {
    if (!rewardData || !prefs) return;
    prefs.setPreferences({ stamp_id: rewardData });
  };

  const handleUseTheme = (rewardData: string | null) => {
    if (!rewardData || !prefs) return;
    prefs.setPreferences({ sidebar_theme_id: rewardData });
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Selos e temas</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  if (stamps.length === 0 && themes.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Selos e temas da loja</CardTitle>
        <p className="text-sm text-muted-foreground">
          Itens comprados na loja podem ser aplicados aqui. Use o botão &quot;Usar&quot; para ativar.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {stamps.length > 0 && (
          <div>
            <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
              <Shield className="h-4 w-4" />
              Selos
            </h4>
            <div className="flex flex-wrap gap-2">
              {stamps.map((p) => {
                const id = p.reward_data ?? p.store_item_id;
                const isSelected = selectedStampId === id;
                return (
                  <Button
                    key={p.id}
                    variant={isSelected ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleUseStamp(p.reward_data)}
                  >
                    {isSelected && <Check className="h-3 w-3 mr-1" />}
                    {p.item_name || 'Selo'} {isSelected && '(em uso)'}
                  </Button>
                );
              })}
            </div>
          </div>
        )}
        {themes.length > 0 && (
          <div>
            <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
              <Palette className="h-4 w-4" />
              Tema do menu
            </h4>
            <div className="flex flex-wrap gap-2">
              {themes.map((p) => {
                const id = p.reward_data ?? p.store_item_id;
                const isSelected = selectedThemeId === id;
                return (
                  <Button
                    key={p.id}
                    variant={isSelected ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleUseTheme(p.reward_data)}
                  >
                    {isSelected && <Check className="h-3 w-3 mr-1" />}
                    {p.item_name || 'Tema'} {isSelected && '(em uso)'}
                  </Button>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
