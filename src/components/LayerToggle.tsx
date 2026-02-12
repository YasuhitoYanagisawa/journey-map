import { motion } from 'framer-motion';
import { Camera, CalendarDays } from 'lucide-react';

interface LayerToggleProps {
  showPhotos: boolean;
  showEvents: boolean;
  onTogglePhotos: () => void;
  onToggleEvents: () => void;
  photoCount: number;
  eventCount: number;
}

const LayerToggle = ({ showPhotos, showEvents, onTogglePhotos, onToggleEvents, photoCount, eventCount }: LayerToggleProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel p-1.5 inline-flex gap-1"
    >
      <button
        onClick={onTogglePhotos}
        className={`
          relative px-3 py-1.5 rounded-lg flex items-center gap-1.5
          transition-colors duration-200 text-sm
          ${showPhotos
            ? 'bg-primary/20 text-primary border border-primary/30'
            : 'text-muted-foreground hover:text-foreground border border-transparent'
          }
        `}
      >
        <Camera className="w-3.5 h-3.5" />
        <span className="font-medium">写真</span>
        <span className="text-xs opacity-70">({photoCount})</span>
      </button>
      <button
        onClick={onToggleEvents}
        className={`
          relative px-3 py-1.5 rounded-lg flex items-center gap-1.5
          transition-colors duration-200 text-sm
          ${showEvents
            ? 'bg-primary/20 text-primary border border-primary/30'
            : 'text-muted-foreground hover:text-foreground border border-transparent'
          }
        `}
      >
        <CalendarDays className="w-3.5 h-3.5" />
        <span className="font-medium">イベント</span>
        <span className="text-xs opacity-70">({eventCount})</span>
      </button>
    </motion.div>
  );
};

export default LayerToggle;
