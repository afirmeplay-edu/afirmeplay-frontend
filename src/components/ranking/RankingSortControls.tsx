import { ArrowDown, ArrowUp } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { RANKING_SORT_FIELDS, type RankingSortDir, type RankingSortKey } from "@/utils/rankingSort";

type Props = {
  sortBy: RankingSortKey;
  sortDir: RankingSortDir;
  onSortByChange: (value: RankingSortKey) => void;
  onSortDirChange: (value: RankingSortDir) => void;
  className?: string;
};

export function RankingSortControls({ sortBy, sortDir, onSortByChange, onSortDirChange, className }: Props) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-xl border border-border/70 bg-muted/20 p-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between ${className || ""}`}
    >
      <div className="space-y-1.5 sm:min-w-[220px] sm:flex-1">
        <Label htmlFor="ranking-sort-field" className="text-xs text-muted-foreground">
          Ordenar ranking por
        </Label>
        <Select value={sortBy} onValueChange={(value) => onSortByChange(value as RankingSortKey)}>
          <SelectTrigger id="ranking-sort-field" className="h-9 bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANKING_SORT_FIELDS.map((field) => (
              <SelectItem key={field.value} value={field.value}>
                {field.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Ordem</Label>
        <ToggleGroup
          type="single"
          value={sortDir}
          onValueChange={(value) => {
            if (value === "asc" || value === "desc") onSortDirChange(value);
          }}
          className="justify-start"
        >
          <ToggleGroupItem value="desc" aria-label="Decrescente (maior primeiro)" className="gap-1.5 px-3 text-xs">
            <ArrowDown className="h-3.5 w-3.5" />
            Decrescente
          </ToggleGroupItem>
          <ToggleGroupItem value="asc" aria-label="Crescente (menor primeiro)" className="gap-1.5 px-3 text-xs">
            <ArrowUp className="h-3.5 w-3.5" />
            Crescente
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
    </div>
  );
}
