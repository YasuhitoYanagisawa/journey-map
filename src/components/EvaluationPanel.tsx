import { useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, Play, Loader2, TrendingUp, Target, CheckCircle2, Zap, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';

interface EvaluationResult {
  timestamp: string;
  metrics: {
    precision: number;
    visit_rate: number;
    ai_ratio: number;
    quality_score: number;
  };
  counts: {
    total_traces: number;
    unique_suggestions: number;
    adopted_from_suggestions: number;
    total_adopted_ai: number;
    total_visited_ai: number;
    total_events: number;
  };
  area_breakdown: {
    area: string;
    suggested: number;
    adopted: number;
    precision: number;
  }[];
}

const EvaluationPanel = () => {
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const runEvaluation = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('evaluate-events');
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult(data);
      toast.success('評価が完了しました');
    } catch (err) {
      console.error('Evaluation error:', err);
      toast.error('評価に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel p-4 space-y-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-sm gradient-text">AI精度評価</h3>
        </div>
        <Button
          onClick={runEvaluation}
          size="sm"
          disabled={isLoading}
          className="gap-2"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          評価実行
        </Button>
      </div>

      {!result && !isLoading && (
        <p className="text-xs text-muted-foreground">
          Weaveトレースとイベント採用データを比較し、AI検索の精度を測定します
        </p>
      )}

      {result && (
        <>
          {/* Score Cards */}
          <div className="grid grid-cols-2 gap-3">
            <ScoreCard
              icon={Target}
              label="適合率"
              value={`${Math.round(result.metrics.precision * 100)}%`}
              description="提案→採用率"
              color="text-amber-500"
            />
            <ScoreCard
              icon={CheckCircle2}
              label="訪問率"
              value={`${Math.round(result.metrics.visit_rate * 100)}%`}
              description="採用→訪問率"
              color="text-emerald-500"
            />
            <ScoreCard
              icon={Zap}
              label="AI活用率"
              value={`${Math.round(result.metrics.ai_ratio * 100)}%`}
              description="全イベント中AI由来"
              color="text-blue-500"
            />
            <ScoreCard
              icon={TrendingUp}
              label="品質スコア"
              value={`${result.metrics.quality_score}`}
              description="総合評価 (0-100)"
              color="text-primary"
              highlight
            />
          </div>

          {/* Counts */}
          <div className="text-xs text-muted-foreground space-y-1 p-3 rounded-lg bg-secondary/20">
            <p>📊 分析トレース数: {result.counts.total_traces}</p>
            <p>💡 ユニーク提案数: {result.counts.unique_suggestions}</p>
            <p>✅ 提案から採用: {result.counts.adopted_from_suggestions}</p>
            <p>🎯 AI採用イベント: {result.counts.total_adopted_ai} / {result.counts.total_events}件</p>
            <p>👣 AI訪問済み: {result.counts.total_visited_ai}件</p>
          </div>

          {/* Area Breakdown */}
          {result.area_breakdown.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                エリア別内訳
              </h4>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {result.area_breakdown.map((area, i) => (
                  <div key={i} className="flex items-center justify-between text-xs p-2 rounded bg-secondary/10">
                    <span className="truncate flex-1">{area.area}</span>
                    <div className="flex gap-3 text-muted-foreground shrink-0">
                      <span>提案{area.suggested}</span>
                      <span>採用{area.adopted}</span>
                      <span className={area.precision > 0.5 ? 'text-emerald-500' : area.precision > 0 ? 'text-amber-500' : 'text-muted-foreground'}>
                        {Math.round(area.precision * 100)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground text-right">
            {new Date(result.timestamp).toLocaleString('ja-JP')}
          </p>
        </>
      )}
    </motion.div>
  );
};

const ScoreCard = ({
  icon: Icon,
  label,
  value,
  description,
  color,
  highlight,
}: {
  icon: any;
  label: string;
  value: string;
  description: string;
  color: string;
  highlight?: boolean;
}) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    className={`p-3 rounded-lg text-center ${highlight ? 'bg-primary/10 border border-primary/30' : 'bg-secondary/20'}`}
  >
    <Icon className={`w-4 h-4 mx-auto mb-1 ${color}`} />
    <p className="text-lg font-bold">{value}</p>
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="text-[10px] text-muted-foreground/70">{description}</p>
  </motion.div>
);

export default EvaluationPanel;
