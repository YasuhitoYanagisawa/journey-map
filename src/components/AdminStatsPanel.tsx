import { useState } from 'react';
import { motion } from 'framer-motion';
import { Building2, MapPin, ChevronRight, RefreshCw } from 'lucide-react';
import { AdminBoundaryStats, AdminLevel, getAdminLevelLabel } from '@/utils/adminBoundaryCalculator';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface AdminStatsPanelProps {
  stats: AdminBoundaryStats;
  adminLevel: AdminLevel;
  onLevelChange: (level: AdminLevel) => void;
  onAreaClick?: (areaId: string) => void;
  onUpdateAddressInfo?: (onProgress: (current: number, total: number) => void) => Promise<number>;
  hasPhotosWithoutAddress?: boolean;
}

const AdminStatsPanel = ({ stats, adminLevel, onLevelChange, onAreaClick, onUpdateAddressInfo, hasPhotosWithoutAddress }: AdminStatsPanelProps) => {
  const levels: AdminLevel[] = ['prefecture', 'city', 'town'];
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<{ current: number; total: number } | null>(null);

  const handleUpdateAddress = async () => {
    if (!onUpdateAddressInfo) return;
    setIsUpdating(true);
    setUpdateProgress({ current: 0, total: 0 });
    
    try {
      await onUpdateAddressInfo((current, total) => {
        setUpdateProgress({ current, total });
      });
    } finally {
      setIsUpdating(false);
      setUpdateProgress(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="glass-panel p-4 space-y-4"
    >
      <div className="flex items-center gap-2">
        <Building2 className="w-5 h-5 text-primary" />
        <h3 className="font-semibold gradient-text">行政区画別集計</h3>
      </div>

      {/* Level selector */}
      <div className="flex gap-1 p-1 bg-muted/50 rounded-lg">
        {levels.map((level) => (
          <Button
            key={level}
            variant={adminLevel === level ? 'default' : 'ghost'}
            size="sm"
            className={cn(
              'flex-1 h-8 text-xs',
              adminLevel === level && 'bg-primary text-primary-foreground'
            )}
            onClick={() => onLevelChange(level)}
          >
            {getAdminLevelLabel(level)}
          </Button>
        ))}
      </div>

      {/* Stats summary */}
      <div className="text-sm text-muted-foreground">
        {stats.totalAreas}エリア・最大{stats.maxCount}枚
      </div>

      {/* Update address button - always show for re-fetching */}
      {onUpdateAddressInfo && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={handleUpdateAddress}
          disabled={isUpdating}
        >
          {isUpdating ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              {updateProgress ? `${updateProgress.current}/${updateProgress.total}` : '更新中...'}
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4 mr-2" />
              住所情報を取得
            </>
          )}
        </Button>
      )}

      {/* Area list */}
      <div className="space-y-2 max-h-[300px] overflow-y-auto">
        {stats.cells.map((cell, index) => (
          <motion.button
            key={cell.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.03 }}
            onClick={() => onAreaClick?.(cell.id)}
            className="w-full p-3 bg-muted/30 rounded-lg flex items-center gap-3 hover:bg-muted/50 transition-colors text-left"
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-white"
              style={{
                backgroundColor: getIntensityColor(cell.intensity),
              }}
            >
              {index + 1}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{cell.name}</p>
              <p className="text-xs text-muted-foreground">
                {cell.count}枚の写真
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </motion.button>
        ))}

        {stats.cells.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>位置情報のある写真がありません</p>
            <p className="text-xs mt-1">写真をアップロードすると表示されます</p>
          </div>
        )}
      </div>
    </motion.div>
  );
};

function getIntensityColor(intensity: number): string {
  const stops = [
    { t: 0.0, h: 210, s: 70, l: 50 },
    { t: 0.25, h: 180, s: 70, l: 50 },
    { t: 0.5, h: 120, s: 60, l: 45 },
    { t: 0.75, h: 45, s: 90, l: 50 },
    { t: 1.0, h: 0, s: 80, l: 50 },
  ];

  let lower = stops[0];
  let upper = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (intensity >= stops[i].t && intensity <= stops[i + 1].t) {
      lower = stops[i];
      upper = stops[i + 1];
      break;
    }
  }

  const range = upper.t - lower.t || 1;
  const localT = (intensity - lower.t) / range;

  const h = lower.h + (upper.h - lower.h) * localT;
  const s = lower.s + (upper.s - lower.s) * localT;
  const l = lower.l + (upper.l - lower.l) * localT;

  return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
}

export default AdminStatsPanel;
