import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, X, Sparkles, Loader2, Image, Upload, MapPinPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/sonner';
import { supabase } from '@/integrations/supabase/client';
import { parsePhotoEXIF } from '@/utils/exifParser';
import { reverseGeocode } from '@/utils/reverseGeocode';
import { useDropzone } from 'react-dropzone';
import LocationPicker from '@/components/LocationPicker';

interface InlineUploadFormProps {
  userId: string;
  onUploaded: () => void;
}

const InlineUploadForm = ({ userId, onUploaded }: InlineUploadFormProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [gpsData, setGpsData] = useState<{ latitude: number; longitude: number; timestamp: Date | null } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiTags, setAiTags] = useState<string[]>([]);
  const [aiDescription, setAiDescription] = useState('');
  const [showLocationPicker, setShowLocationPicker] = useState(false);

  const processFile = async (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    try {
      const exifData = await parsePhotoEXIF(file);
      setGpsData(exifData ? { latitude: exifData.latitude, longitude: exifData.longitude, timestamp: exifData.timestamp } : null);
    } catch {
      setGpsData(null);
    }
    setSelectedFile(file);
  };

  const handleAnalyze = async () => {
    if (!preview) return;
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-photo', {
        body: { imageUrl: preview },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const analysis = data.analysis;
      if (analysis?.tags?.length > 0) {
        setAiTags(analysis.tags);
        setAiDescription(analysis.description || '');
        if (!caption.trim()) {
          const tagString = analysis.tags.map((t: string) => `#${t}`).join(' ');
          setCaption(analysis.description ? `${analysis.description}\n${tagString}` : tagString);
        }
        toast.success('AI分析完了！');
      } else {
        toast.info('タグを生成できませんでした');
      }
    } catch {
      toast.error('AI分析に失敗しました');
    } finally {
      setAnalyzing(false);
    }
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      await processFile(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    maxFiles: 1,
  });

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    try {
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${userId}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage.from('photos').upload(fileName, selectedFile);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('photos').getPublicUrl(fileName);
      const geocode = gpsData ? await reverseGeocode(gpsData.latitude, gpsData.longitude) : { prefecture: null, city: null, town: null };

      const { error: insertError } = await supabase.from('photos').insert({
        user_id: userId,
        filename: selectedFile.name,
        storage_path: fileName,
        thumbnail_url: urlData.publicUrl,
        latitude: gpsData?.latitude || null,
        longitude: gpsData?.longitude || null,
        taken_at: gpsData?.timestamp?.toISOString() || null,
        caption: caption.trim() || null,
        prefecture: geocode.prefecture,
        city: geocode.city,
        town: geocode.town,
      });
      if (insertError) throw insertError;

      toast.success('写真を投稿しました！');
      clearSelection();
      setIsOpen(false);
      onUploaded();
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('アップロードに失敗しました');
    } finally {
      setUploading(false);
    }
  };

  const clearSelection = () => {
    setSelectedFile(null);
    setPreview(null);
    setGpsData(null);
    setCaption('');
    setAiTags([]);
    setAiDescription('');
    setShowLocationPicker(false);
  };

  if (!isOpen) {
    return (
      <Button variant="outline" className="w-full gap-2" onClick={() => setIsOpen(true)}>
        <Image className="w-4 h-4" />
        新しい投稿を作成
      </Button>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">新しい投稿</h3>
        <button onClick={() => { clearSelection(); setIsOpen(false); }} className="p-1 hover:bg-muted rounded">
          <X className="w-4 h-4" />
        </button>
      </div>

      {!selectedFile ? (
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
            ${isDragActive ? 'border-primary/50 bg-primary/5' : 'border-border hover:border-primary/30'}`}
        >
          <input {...getInputProps()} />
          <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">写真を選択またはドロップ</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="relative">
            <button onClick={clearSelection} className="absolute top-1 right-1 z-10 p-1 bg-background/80 rounded-full">
              <X className="w-3 h-3" />
            </button>
            <img src={preview || ''} alt="Preview" className="w-full max-h-64 object-cover rounded-lg" />
          </div>

          {gpsData ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <MapPin className="w-3 h-3 text-green-500" />
              <span>{gpsData.latitude.toFixed(4)}, {gpsData.longitude.toFixed(4)}</span>
            </div>
          ) : showLocationPicker ? (
            <LocationPicker
              onLocationSelect={(lat, lng) => {
                setGpsData({ latitude: lat, longitude: lng, timestamp: null });
                setShowLocationPicker(false);
              }}
              onCancel={() => setShowLocationPicker(false)}
            />
          ) : (
            <Button variant="outline" size="sm" className="w-full" onClick={() => setShowLocationPicker(true)}>
              <MapPinPlus className="w-3 h-3 mr-1" />
              手動で位置を設定
            </Button>
          )}

          <Button variant="outline" size="sm" className="w-full" onClick={handleAnalyze} disabled={analyzing}>
            {analyzing ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />AI分析中...</> : <><Sparkles className="w-3 h-3 mr-1" />AIで自動タグ付け</>}
          </Button>

          <AnimatePresence>
            {aiTags.length > 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
                {aiDescription && <p className="text-xs text-muted-foreground">{aiDescription}</p>}
                <div className="flex flex-wrap gap-1">
                  {aiTags.map((tag, i) => (
                    <Badge key={i} variant="outline" className="text-xs">#{tag}</Badge>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <Textarea
            placeholder="キャプション... #ハッシュタグも使えます"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            className="min-h-[60px] text-sm"
          />

          <Button className="w-full" size="sm" onClick={handleUpload} disabled={uploading}>
            {uploading ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />投稿中...</> : '投稿する'}
          </Button>
        </div>
      )}
    </motion.div>
  );
};

export default InlineUploadForm;
