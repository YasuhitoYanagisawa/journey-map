import { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Plus, Loader2, MapPin, Calendar, Sparkles, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EventSearchResult } from '@/types/event';

interface EventSearchPanelProps {
  onSearch: (prefecture: string, city?: string, period?: string) => Promise<EventSearchResult[]>;
  onAddResults: (results: EventSearchResult[]) => Promise<number>;
  onAddManual: (event: Partial<EventSearchResult>) => void;
  isLoading: boolean;
  isLoggedIn: boolean;
}

const PREFECTURES = [
  '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
  '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
  '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県',
  '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県',
  '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県',
  '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県',
  '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県',
];

const EventSearchPanel = ({ onSearch, onAddResults, onAddManual, isLoading, isLoggedIn }: EventSearchPanelProps) => {
  const [prefecture, setPrefecture] = useState('');
  const [city, setCity] = useState('');
  const [period, setPeriod] = useState('');
  const [searchResults, setSearchResults] = useState<EventSearchResult[]>([]);
  const [selectedResults, setSelectedResults] = useState<Set<number>>(new Set());
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualLocation, setManualLocation] = useState('');
  const [manualStart, setManualStart] = useState('');
  const [manualEnd, setManualEnd] = useState('');
  const [manualDescription, setManualDescription] = useState('');

  const handleSearch = async () => {
    if (!prefecture) return;
    const results = await onSearch(prefecture, city || undefined, period || undefined);
    setSearchResults(results);
    setSelectedResults(new Set(results.map((_, i) => i))); // Select all by default
  };

  const handleAddSelected = async () => {
    const selected = searchResults.filter((_, i) => selectedResults.has(i));
    if (selected.length > 0) {
      await onAddResults(selected);
      setSearchResults([]);
      setSelectedResults(new Set());
    }
  };

  const toggleResult = (index: number) => {
    setSelectedResults(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleManualAdd = () => {
    if (!manualName) return;
    onAddManual({
      name: manualName,
      location_name: manualLocation,
      event_start: manualStart || null,
      event_end: manualEnd || null,
      description: manualDescription,
      prefecture: prefecture || undefined,
      city: city || undefined,
    });
    setManualName('');
    setManualLocation('');
    setManualStart('');
    setManualEnd('');
    setManualDescription('');
    setShowManualForm(false);
  };

  return (
    <div className="space-y-4">
      {/* AI Search Section */}
      <div className="glass-panel p-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-sm">AIでイベント検索</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
          <select
            value={prefecture}
            onChange={(e) => setPrefecture(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
          >
            <option value="">都道府県を選択</option>
            {PREFECTURES.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <Input
            placeholder="市区町村（任意）"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="h-9 text-sm"
          />
          <Input
            placeholder="時期（例：7月、夏）"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="h-9 text-sm"
          />
        </div>

        <div className="flex gap-2">
          <Button
            onClick={handleSearch}
            disabled={!prefecture || isLoading || !isLoggedIn}
            size="sm"
            className="gap-2"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            検索
          </Button>
          <Button
            onClick={() => setShowManualForm(!showManualForm)}
            variant="outline"
            size="sm"
            disabled={!isLoggedIn}
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            手動追加
          </Button>
        </div>

        {!isLoggedIn && (
          <p className="text-xs text-muted-foreground mt-2">
            イベントを登録するにはログインが必要です
          </p>
        )}
      </div>

      {/* Manual Add Form */}
      {showManualForm && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="glass-panel p-4"
        >
          <h3 className="font-semibold text-sm mb-3">手動でイベントを追加</h3>
          <div className="space-y-2">
            <Input
              placeholder="イベント名 *"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              className="h-9 text-sm"
            />
            <Input
              placeholder="場所"
              value={manualLocation}
              onChange={(e) => setManualLocation(e.target.value)}
              className="h-9 text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                value={manualStart}
                onChange={(e) => setManualStart(e.target.value)}
                className="h-9 text-sm"
                placeholder="開始日"
              />
              <Input
                type="date"
                value={manualEnd}
                onChange={(e) => setManualEnd(e.target.value)}
                className="h-9 text-sm"
                placeholder="終了日"
              />
            </div>
            <Input
              placeholder="説明（任意）"
              value={manualDescription}
              onChange={(e) => setManualDescription(e.target.value)}
              className="h-9 text-sm"
            />
            <Button onClick={handleManualAdd} size="sm" disabled={!manualName}>
              追加
            </Button>
          </div>
        </motion.div>
      )}

      {/* Search Results */}
      {searchResults.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="glass-panel p-4"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">検索結果（{searchResults.length}件）</h3>
            <Button onClick={handleAddSelected} size="sm" disabled={selectedResults.size === 0} className="gap-2">
              <Plus className="w-4 h-4" />
              選択した{selectedResults.size}件を追加
            </Button>
          </div>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {searchResults.map((result, index) => (
              <button
                key={index}
                onClick={() => toggleResult(index)}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  selectedResults.has(index)
                    ? 'border-primary/50 bg-primary/10'
                    : 'border-border/50 bg-secondary/20 hover:bg-secondary/30'
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 ${
                    selectedResults.has(index) ? 'bg-primary border-primary' : 'border-muted-foreground/30'
                  }`}>
                    {selectedResults.has(index) && <Check className="w-3 h-3 text-primary-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{result.name}</p>
                    {result.location_name && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <MapPin className="w-3 h-3" />
                        {result.location_name}
                      </p>
                    )}
                    {(result.event_start || result.event_end) && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Calendar className="w-3 h-3" />
                        {result.event_start}{result.event_end && result.event_end !== result.event_start ? ` 〜 ${result.event_end}` : ''}
                      </p>
                    )}
                    {result.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{result.description}</p>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default EventSearchPanel;
