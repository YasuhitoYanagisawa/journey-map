import { motion } from 'framer-motion';
import { MapPin, Flame, Map, Building2, Home } from 'lucide-react';
import { ViewMode } from '@/types/photo';

interface ViewModeToggleProps {
  currentMode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

const ViewModeToggle = ({ currentMode, onChange }: ViewModeToggleProps) => {
  const modes: { mode: ViewMode; icon: typeof MapPin; label: string }[] = [
    { mode: 'markers', icon: MapPin, label: 'マーカー' },
    { mode: 'heatmap', icon: Flame, label: 'ヒート' },
    { mode: 'admin-prefecture', icon: Map, label: '都道府県' },
    { mode: 'admin-city', icon: Building2, label: '市区町村' },
    { mode: 'admin-town', icon: Home, label: '町丁目' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel p-1.5 inline-flex gap-1"
    >
      {modes.map(({ mode, icon: Icon, label }) => (
        <button
          key={mode}
          onClick={() => onChange(mode)}
          className={`
            relative px-4 py-2 rounded-lg flex items-center gap-2
            transition-colors duration-200
            ${currentMode === mode 
              ? 'text-primary-foreground' 
              : 'text-muted-foreground hover:text-foreground'
            }
          `}
        >
          {currentMode === mode && (
            <motion.div
              layoutId="viewmode-bg"
              className="absolute inset-0 bg-primary rounded-lg"
              transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
            />
          )}
          <span className="relative z-10 flex items-center gap-2">
            <Icon className="w-4 h-4" />
            <span className="text-sm font-medium">{label}</span>
          </span>
        </button>
      ))}
    </motion.div>
  );
};

export default ViewModeToggle;
