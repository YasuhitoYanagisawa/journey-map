import { motion } from 'framer-motion';
import { Check, Trash2, MapPin, Calendar, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EventItem } from '@/types/event';

interface EventTaskListProps {
  events: EventItem[];
  onToggleVisited: (id: string, visited: boolean) => void;
  onDelete: (id: string) => void;
  onEventClick?: (event: EventItem) => void;
  showVisited?: boolean;
}

const EventTaskList = ({ events, onToggleVisited, onDelete, onEventClick, showVisited = false }: EventTaskListProps) => {
  const displayed = showVisited
    ? events.filter(e => e.visited)
    : events.filter(e => !e.visited);

  if (displayed.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        {showVisited ? '訪問済みのイベントはありません' : '予定しているイベントはありません'}
      </div>
    );
  }

  // Sort by event_start date
  const sorted = [...displayed].sort((a, b) => {
    if (!a.event_start) return 1;
    if (!b.event_start) return -1;
    return new Date(a.event_start).getTime() - new Date(b.event_start).getTime();
  });

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' });
  };

  return (
    <div className="space-y-2">
      {sorted.map((event) => (
        <motion.div
          key={event.id}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className={`p-3 rounded-lg border transition-colors ${
            event.visited
              ? 'border-primary/30 bg-primary/5'
              : 'border-border/50 bg-secondary/20 hover:bg-secondary/30'
          }`}
        >
          <div className="flex items-start gap-3">
            {/* Checkbox */}
            <button
              onClick={() => onToggleVisited(event.id, !event.visited)}
              className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                event.visited ? 'bg-primary border-primary' : 'border-muted-foreground/30 hover:border-primary/50'
              }`}
            >
              {event.visited && <Check className="w-3 h-3 text-primary-foreground" />}
            </button>

            {/* Content */}
            <div
              className="flex-1 min-w-0 cursor-pointer"
              onClick={() => onEventClick?.(event)}
            >
              <p className={`text-sm font-medium ${event.visited ? 'line-through text-muted-foreground' : ''}`}>
                {event.name}
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                {event.location_name && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {event.prefecture} {event.city}
                  </span>
                )}
                {event.event_start && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {formatDate(event.event_start)}
                    {event.event_end && event.event_end !== event.event_start && ` 〜 ${formatDate(event.event_end)}`}
                  </span>
                )}
              </div>
              {event.description && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{event.description}</p>
              )}
            </div>

            {/* Actions */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(event.id)}
              className="shrink-0 h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </motion.div>
      ))}
    </div>
  );
};

export default EventTaskList;
