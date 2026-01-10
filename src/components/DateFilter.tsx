import { useState, useMemo, useEffect } from 'react';
import { format, startOfDay, startOfWeek, startOfMonth, endOfDay, endOfWeek, endOfMonth, isWithinInterval, subDays, subWeeks, subMonths } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type DateFilterMode = 'all' | 'day' | 'week' | 'month';

interface DateFilterProps {
  photos: { timestamp: Date }[];
  onFilterChange: (filteredIndices: number[] | null, label: string) => void;
}

interface DateRange {
  start: Date;
  end: Date;
  label: string;
}

const DateFilter = ({ photos, onFilterChange }: DateFilterProps) => {
  const [mode, setMode] = useState<DateFilterMode>('all');
  const [offset, setOffset] = useState(0);

  // Get available dates from photos
  const availableDates = useMemo(() => {
    return photos.map(p => p.timestamp).sort((a, b) => b.getTime() - a.getTime());
  }, [photos]);

  const latestDate = useMemo(() => {
    if (availableDates.length === 0) return new Date();
    return availableDates[0];
  }, [availableDates]);

  // Calculate current date range based on mode and offset
  const currentRange = useMemo((): DateRange | null => {
    if (mode === 'all') return null;

    const baseDate = latestDate;
    let start: Date;
    let end: Date;
    let label: string;

    if (mode === 'day') {
      const targetDate = subDays(baseDate, offset);
      start = startOfDay(targetDate);
      end = endOfDay(targetDate);
      label = format(targetDate, 'M月d日 (E)', { locale: ja });
    } else if (mode === 'week') {
      const targetDate = subWeeks(baseDate, offset);
      start = startOfWeek(targetDate, { weekStartsOn: 1 });
      end = endOfWeek(targetDate, { weekStartsOn: 1 });
      label = `${format(start, 'M/d', { locale: ja })} - ${format(end, 'M/d', { locale: ja })}`;
    } else {
      const targetDate = subMonths(baseDate, offset);
      start = startOfMonth(targetDate);
      end = endOfMonth(targetDate);
      label = format(targetDate, 'yyyy年M月', { locale: ja });
    }

    return { start, end, label };
  }, [mode, offset, latestDate]);

  // Filter photos and notify parent
  useEffect(() => {
    if (mode === 'all' || !currentRange) {
      onFilterChange(null, '全期間の統計');
      return;
    }

    const indices: number[] = [];
    photos.forEach((photo, index) => {
      if (isWithinInterval(photo.timestamp, { start: currentRange.start, end: currentRange.end })) {
        indices.push(index);
      }
    });
    
    // Create label based on mode
    let statsLabel = '';
    if (mode === 'day') {
      statsLabel = `${currentRange.label}の統計`;
    } else if (mode === 'week') {
      statsLabel = `${currentRange.label}の統計`;
    } else if (mode === 'month') {
      statsLabel = `${currentRange.label}の統計`;
    }
    
    onFilterChange(indices, statsLabel);
  }, [photos, mode, currentRange, onFilterChange]);

  // Count photos in current range
  const photosInRange = useMemo(() => {
    if (mode === 'all' || !currentRange) return photos.length;
    return photos.filter(p => 
      isWithinInterval(p.timestamp, { start: currentRange.start, end: currentRange.end })
    ).length;
  }, [photos, mode, currentRange]);

  const handleModeChange = (newMode: DateFilterMode) => {
    setMode(newMode);
    setOffset(0);
  };

  return (
    <div className="glass-panel px-3 py-2 space-y-2">
      {/* Mode Buttons */}
      <div className="flex gap-1">
        {[
          { mode: 'all' as const, label: '全て' },
          { mode: 'day' as const, label: '日' },
          { mode: 'week' as const, label: '週' },
          { mode: 'month' as const, label: '月' },
        ].map(({ mode: m, label }) => (
          <Button
            key={m}
            variant={mode === m ? 'default' : 'ghost'}
            size="sm"
            className={cn(
              'h-7 px-2 text-xs',
              mode === m && 'bg-primary text-primary-foreground'
            )}
            onClick={() => handleModeChange(m)}
          >
            {label}
          </Button>
        ))}
      </div>

      {/* Navigation */}
      {mode !== 'all' && currentRange && (
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setOffset(offset + 1)}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="font-medium">{currentRange.label}</span>
            <span className="text-muted-foreground">({photosInRange}枚)</span>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setOffset(Math.max(0, offset - 1))}
            disabled={offset === 0}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default DateFilter;
