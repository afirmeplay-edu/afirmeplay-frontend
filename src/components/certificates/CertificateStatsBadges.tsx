import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Clock, FileText, Users } from 'lucide-react';
import type { CertificateStats } from '@/utils/certificateStats';

interface CertificateStatsBadgesProps {
  stats: CertificateStats;
  compact?: boolean;
}

export function CertificateStatsBadges({ stats, compact = false }: CertificateStatsBadgesProps) {
  const iconClass = compact ? 'h-3 w-3 mr-1' : 'h-3.5 w-3.5 mr-1';

  return (
    <div className="flex flex-wrap gap-2">
      <Badge variant="default" className="bg-green-600 hover:bg-green-600">
        <CheckCircle2 className={iconClass} />
        {stats.approved} aprovado{stats.approved !== 1 ? 's' : ''}
      </Badge>
      {stats.pending > 0 && (
        <Badge variant="secondary">
          <Clock className={iconClass} />
          {stats.pending} pendente{stats.pending !== 1 ? 's' : ''}
        </Badge>
      )}
      {stats.notIssued > 0 && (
        <Badge variant="outline">
          <FileText className={iconClass} />
          {stats.notIssued} não emitido{stats.notIssued !== 1 ? 's' : ''}
        </Badge>
      )}
      <Badge variant="outline" className="text-muted-foreground">
        <Users className={iconClass} />
        {stats.total} {stats.total !== 1 ? 'elegíveis' : 'elegível'}
      </Badge>
    </div>
  );
}
