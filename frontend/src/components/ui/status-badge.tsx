import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const STATUS_CONFIG = {
  booting: { label: 'Booting', className: 'bg-warning/15 text-warning border-warning/20' },
  ready: { label: 'Idle', className: 'bg-success/15 text-success border-success/20' },
  error: { label: 'Error', className: 'bg-destructive/15 text-destructive border-destructive/20' },
  stopping: { label: 'Stopping', className: 'bg-muted-foreground/15 text-muted-foreground border-muted-foreground/20' },
  working: { label: 'Working', className: 'bg-primary/15 text-primary border-primary/20' },
} as const;

type StatusKey = keyof typeof STATUS_CONFIG;

export function StatusBadge({ status }: { status: StatusKey }) {
  const config = STATUS_CONFIG[status];
  return (
    <Badge variant="outline" className={cn('text-[10px] font-medium', config.className)}>
      {status === 'booting' && <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-warning animate-pulse" />}
      {status === 'working' && <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />}
      {config.label}
    </Badge>
  );
}
