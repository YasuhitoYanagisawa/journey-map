import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Target, CheckCircle2, CalendarDays, TrendingUp } from 'lucide-react';
import { EventItem } from '@/types/event';

interface EventCoverageKPIProps {
  events: EventItem[];
}

const EventCoverageKPI = ({ events }: EventCoverageKPIProps) => {
  const stats = useMemo(() => {
    if (events.length === 0) return null;

    const total = events.length;
    const visited = events.filter(e => e.visited).length;
    const upcoming = events.filter(e => !e.visited).length;
    const coverageRate = total > 0 ? Math.round((visited / total) * 100) : 0;

    // Monthly breakdown
    const now = new Date();
    const thisMonth = events.filter(e => {
      if (!e.event_start) return false;
      const d = new Date(e.event_start);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });
    const thisMonthVisited = thisMonth.filter(e => e.visited).length;
    const thisMonthRate = thisMonth.length > 0 ? Math.round((thisMonthVisited / thisMonth.length) * 100) : 0;

    return { total, visited, upcoming, coverageRate, thisMonth: thisMonth.length, thisMonthVisited, thisMonthRate };
  }, [events]);

  if (!stats) return null;

  const kpis = [
    { icon: CalendarDays, label: '総イベント', value: `${stats.total}件`, color: 'text-primary' },
    { icon: CheckCircle2, label: '訪問済み', value: `${stats.visited}件`, color: 'text-emerald-500' },
    { icon: Target, label: 'カバー率', value: `${stats.coverageRate}%`, color: 'text-amber-500' },
    { icon: TrendingUp, label: '今月', value: `${stats.thisMonthVisited}/${stats.thisMonth}`, color: 'text-blue-500' },
  ];

  return (
    <div className="glass-panel p-4">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Target className="w-4 h-4 text-primary" />
        イベントカバレッジ
      </h3>

      <div className="grid grid-cols-4 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="text-center"
          >
            <kpi.icon className={`w-4 h-4 mx-auto mb-1 ${kpi.color}`} />
            <p className="text-lg font-bold">{kpi.value}</p>
            <p className="text-xs text-muted-foreground">{kpi.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Coverage bar */}
      <div className="mt-3">
        <div className="h-2 bg-secondary/30 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${stats.coverageRate}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="h-full bg-gradient-to-r from-primary to-emerald-500 rounded-full"
          />
        </div>
      </div>
    </div>
  );
};

export default EventCoverageKPI;
