import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, X, Sparkles, Loader2, Image, Upload, MapPinPlus, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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

interface PendingFile {
  file: File;
  preview: string;
  gpsData: { latitude: number; longitude: number; timestamp: Date | null } | null;
  caption: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
}

const InlineUploadForm = ({ userId, onUploaded }: InlineUploadFormProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showLocationPicker, setShowLocationPicker] = useState<number | null>(null);

  const processFiles = useCallback(async (files: File[]) => {
    const newPending: PendingFile[] = [];

    for (const file of files) {
      const preview = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsDataURL(file);
      });

      let gpsData: PendingFile['gpsData'] = null;
      try {
        const exifData = await parsePhotoEXIF(file);
        if (exifData) {
          gpsData = { latitude: exifData.latitude, longitude: exifData.longitude, timestamp: exifData.timestamp };
        }
      } catch {
        // no GPS
      }

      newPending.push({ file, preview, gpsData, caption: '', status: 'pending' });
    }

    setPendingFiles(prev => [...prev, ...newPending]);
  }, []);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    console.log('onDrop called with', acceptedFiles.length, 'files');
    if (acceptedFiles.length > 0) {
      await processFiles(acceptedFiles);
    }
  }, [processFiles]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    multiple: true,
  });

  const removeFile = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };

  const updateCaption = (index: number, caption: string) => {
    setPendingFiles(prev => prev.map((f, i) => i === index ? { ...f, caption } : f));
  };

  const setLocationForFile = (index: number, lat: number, lng: number) => {
    setPendingFiles(prev => prev.map((f, i) =>
      i === index ? { ...f, gpsData: { latitude: lat, longitude: lng, timestamp: f.gpsData?.timestamp || null } } : f
    ));
    setShowLocationPicker(null);
  };

  const handleAnalyze = async (index: number) => {
    const pending = pendingFiles[index];
    if (!pending) return;

    try {
      const { data, error } = await supabase.functions.invoke('analyze-photo', {
        body: { imageUrl: pending.preview },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const analysis = data.analysis;
      if (analysis?.tags?.length > 0) {
        const tagString = analysis.tags.map((t: string) => `#${t}`).join(' ');
        const newCaption = analysis.description ? `${analysis.description}\n${tagString}` : tagString;
        updateCaption(index, newCaption);
        toast.success('AI分析完了！');
      } else {
        toast.info('タグを生成できませんでした');
      }
    } catch {
      toast.error('AI分析に失敗しました');
    }
  };

  const handleUploadAll = async () => {
    const toUpload = pendingFiles.filter(f => f.status === 'pending');
    if (toUpload.length === 0) return;

    setUploading(true);
    setUploadProgress(0);
    let completed = 0;

    for (let i = 0; i < pendingFiles.length; i++) {
      const pending = pendingFiles[i];
      if (pending.status !== 'pending') continue;

      setPendingFiles(prev => prev.map((f, j) => j === i ? { ...f, status: 'uploading' } : f));

      try {
        const fileExt = pending.file.name.split('.').pop();
        const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).substr(2, 6)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage.from('photos').upload(fileName, pending.file);
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from('photos').getPublicUrl(fileName);
        const geocode = pending.gpsData
          ? await reverseGeocode(pending.gpsData.latitude, pending.gpsData.longitude)
          : { prefecture: null, city: null, town: null };

        const { error: insertError } = await supabase.from('photos').insert({
          user_id: userId,
          filename: pending.file.name,
          storage_path: fileName,
          thumbnail_url: urlData.publicUrl,
          latitude: pending.gpsData?.latitude || null,
          longitude: pending.gpsData?.longitude || null,
          taken_at: pending.gpsData?.timestamp?.toISOString() || null,
          caption: pending.caption.trim() || null,
          prefecture: geocode.prefecture,
          city: geocode.city,
          town: geocode.town,
        });
        if (insertError) throw insertError;

        setPendingFiles(prev => prev.map((f, j) => j === i ? { ...f, status: 'done' } : f));
        completed++;
        setUploadProgress(Math.round((completed / toUpload.length) * 100));
      } catch (error) {
        console.error('Upload error:', error);
        setPendingFiles(prev => prev.map((f, j) => j === i ? { ...f, status: 'error' } : f));
      }
    }

    if (completed > 0) {
      toast.success(`${completed}枚の写真を投稿しました！`);
      onUploaded();
    }
    if (completed === toUpload.length) {
      setTimeout(() => {
        setPendingFiles([]);
        setIsOpen(false);
        setUploading(false);
        setUploadProgress(0);
      }, 1000);
    } else {
      setUploading(false);
    }
  };

  const clearAll = () => {
    setPendingFiles([]);
    setShowLocationPicker(null);
    setIsOpen(false);
  };

  const pendingCount = pendingFiles.filter(f => f.status === 'pending').length;
  const noGpsFiles = pendingFiles.filter(f => f.status === 'pending' && !f.gpsData);

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
        <h3 className="text-sm font-semibold">
          新しい投稿 {pendingFiles.length > 0 && `(${pendingFiles.length}枚)`}
        </h3>
        <button onClick={clearAll} className="p-1 hover:bg-muted rounded">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Dropzone - always show when not uploading */}
      {!uploading && (
        <div className="space-y-2">
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors
              ${isDragActive ? 'border-primary/50 bg-primary/5' : 'border-border hover:border-primary/30'}`}
          >
            <input {...getInputProps()} />
            <Upload className="w-6 h-6 text-muted-foreground mx-auto mb-1" />
            <p className="text-sm text-muted-foreground">
              {pendingFiles.length > 0 ? '写真を追加（ドラッグ＆ドロップ）' : '写真をドラッグ＆ドロップ'}
            </p>
          </div>
          <label className="flex items-center justify-center gap-2 w-full px-3 py-2 text-sm border border-border rounded-lg cursor-pointer hover:bg-muted transition-colors">
            <Image className="w-4 h-4" />
            ファイルを選択（複数可）
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                console.log('File input onChange:', files.length, 'files');
                if (files.length > 0) {
                  processFiles(files);
                }
                e.target.value = '';
              }}
            />
          </label>
        </div>
      )}

      {/* Pending files list */}
      {pendingFiles.length > 0 && (
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {pendingFiles.map((pending, index) => (
            <motion.div
              key={`${pending.file.name}-${index}`}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex gap-3 p-2 rounded-lg border transition-colors ${
                pending.status === 'done' ? 'border-green-500/30 bg-green-500/5' :
                pending.status === 'error' ? 'border-destructive/30 bg-destructive/5' :
                pending.status === 'uploading' ? 'border-primary/30 bg-primary/5' :
                'border-border'
              }`}
            >
              <div className="relative w-16 h-16 shrink-0">
                <img src={pending.preview} alt="" className="w-full h-full object-cover rounded-md" />
                {pending.status === 'done' && (
                  <div className="absolute inset-0 bg-green-500/20 rounded-md flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6 text-green-500" />
                  </div>
                )}
                {pending.status === 'uploading' && (
                  <div className="absolute inset-0 bg-background/50 rounded-md flex items-center justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium truncate">{pending.file.name}</p>
                  {pending.status === 'pending' && !uploading && (
                    <button onClick={() => removeFile(index)} className="p-0.5 hover:bg-muted rounded shrink-0">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {pending.gpsData ? (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-green-500" />
                    {pending.gpsData.latitude.toFixed(4)}, {pending.gpsData.longitude.toFixed(4)}
                  </p>
                ) : pending.status === 'pending' && (
                  showLocationPicker === index ? (
                    <LocationPicker
                      onLocationSelect={(lat, lng) => setLocationForFile(index, lat, lng)}
                      onCancel={() => setShowLocationPicker(null)}
                    />
                  ) : (
                    <button
                      onClick={() => setShowLocationPicker(index)}
                      className="text-xs text-amber-600 flex items-center gap-1 hover:underline"
                    >
                      <MapPinPlus className="w-3 h-3" />
                      GPS無し - 位置を設定
                    </button>
                  )
                )}

                {pending.status === 'pending' && !uploading && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleAnalyze(index)}
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5"
                    >
                      <Sparkles className="w-3 h-3" />
                      AI分析
                    </button>
                  </div>
                )}

                {pending.status === 'pending' && !uploading && (
                  <Textarea
                    placeholder="キャプション..."
                    value={pending.caption}
                    onChange={(e) => updateCaption(index, e.target.value)}
                    className="min-h-[36px] text-xs p-1.5 resize-none"
                    rows={1}
                  />
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Upload progress */}
      {uploading && (
        <div className="space-y-1">
          <Progress value={uploadProgress} className="h-2" />
          <p className="text-xs text-muted-foreground text-center">{uploadProgress}% 完了</p>
        </div>
      )}

      {/* GPS warning */}
      {noGpsFiles.length > 0 && !uploading && (
        <p className="text-xs text-amber-600">
          ⚠ {noGpsFiles.length}枚の写真にGPS情報がありません
        </p>
      )}

      {/* Upload button */}
      {pendingCount > 0 && !uploading && (
        <Button className="w-full" size="sm" onClick={handleUploadAll}>
          {pendingCount}枚を投稿する
        </Button>
      )}
    </motion.div>
  );
};

export default InlineUploadForm;
