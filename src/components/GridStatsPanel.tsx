import { motion } from 'framer-motion';
import { Grid3X3, MapPin, ImageIcon } from 'lucide-react';
import { GridStats, getGridCellColor } from '@/utils/gridCalculator';

interface GridStatsPanelProps {
  gridStats: GridStats;
  onCellClick?: (cellId: string) => void;
}

const GridStatsPanel = ({ gridStats, onCellClick }: GridStatsPanelProps) => {
  const topCells = gridStats.cells.slice(0, 10);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, delay: 0.4 }}
      className="glass-panel p-6"
    >
      <div className="flex items-center gap-2 mb-4">
        <Grid3X3 className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold gradient-text">エリア別統計</h2>
      </div>

      <div className="text-sm text-muted-foreground mb-4 space-y-1">
        <p>グリッドサイズ: {gridStats.cellSizeMeters}m × {gridStats.cellSizeMeters}m</p>
        <p>訪問エリア数: {gridStats.totalCells}</p>
      </div>

      <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
        {topCells.map((cell, index) => {
          const representativePhoto = cell.photos[0];
          const color = getGridCellColor(cell.intensity);

          return (
            <motion.button
              key={cell.id}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2, delay: 0.03 * index }}
              onClick={() => onCellClick?.(cell.id)}
              className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/50 transition-colors text-left group"
            >
              {/* Rank badge */}
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                style={{ backgroundColor: color }}
              >
                {index + 1}
              </div>

              {/* Thumbnail or icon */}
              {representativePhoto ? (
                <img
                  src={representativePhoto.thumbnailUrl}
                  alt=""
                  className="w-10 h-10 rounded object-cover border border-border group-hover:border-primary/50 transition-colors"
                />
              ) : (
                <div className="w-10 h-10 rounded bg-secondary flex items-center justify-center">
                  <ImageIcon className="w-5 h-5 text-muted-foreground" />
                </div>
              )}

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 text-sm font-medium">
                  <MapPin className="w-3 h-3 text-primary" />
                  <span className="truncate">エリア {index + 1}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {cell.count}枚の写真
                </p>
              </div>

              {/* Intensity bar */}
              <div className="w-12 h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.round(cell.intensity * 100)}%`,
                    backgroundColor: color,
                  }}
                />
              </div>
            </motion.button>
          );
        })}
      </div>

      {gridStats.cells.length > 10 && (
        <p className="text-xs text-muted-foreground/70 mt-3 text-center">
          他 {gridStats.cells.length - 10} エリア
        </p>
      )}
    </motion.div>
  );
};

export default GridStatsPanel;
