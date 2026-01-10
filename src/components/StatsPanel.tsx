import { motion } from 'framer-motion';
import { Camera, Route, Clock, MapPin } from 'lucide-react';
import { DayStats } from '@/types/photo';
import { formatDuration, formatTime } from '@/utils/statsCalculator';

interface StatsPanelProps {
  stats: DayStats;
  title?: string;
}

const StatsPanel = ({ stats, title = '今日の統計' }: StatsPanelProps) => {
  const statItems = [
    {
      icon: Camera,
      label: '写真',
      value: stats.totalPhotos.toString(),
      unit: '枚',
    },
    {
      icon: Route,
      label: '移動距離',
      value: stats.totalDistance.toFixed(1),
      unit: 'km',
    },
    {
      icon: Clock,
      label: '活動時間',
      value: formatDuration(stats.duration),
      unit: '',
    },
    {
      icon: MapPin,
      label: '時間帯',
      value: stats.startTime && stats.endTime 
        ? `${formatTime(stats.startTime)} - ${formatTime(stats.endTime)}`
        : '-',
      unit: '',
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="glass-panel p-6 space-y-4"
    >
      <h2 className="text-lg font-semibold gradient-text">{title}</h2>
      
      <div className="grid grid-cols-2 gap-4">
        {statItems.map((item, index) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 * index }}
            className="stat-card"
          >
            <div className="flex items-center gap-2 mb-2">
              <item.icon className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground">{item.label}</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-foreground">{item.value}</span>
              <span className="text-sm text-muted-foreground">{item.unit}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
};

export default StatsPanel;
