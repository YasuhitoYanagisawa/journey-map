import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MapPin, Upload as UploadIcon, Image, ArrowLeft, X, Sparkles, Loader2, MapPinPlus, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { parsePhotoEXIF } from '@/utils/exifParser';
import { reverseGeocode } from '@/utils/reverseGeocode';
import { useDropzone } from 'react-dropzone';
import LocationPicker from '@/components/LocationPicker';

interface PendingFile {
  file: File;
  preview: string;
  gpsData: { latitude: number; longitude: number; timestamp: Date | null } | null;
  caption: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
}

const Upload = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showLocationPicker, setShowLocationPicker] = useState<number | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

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
    if (!user) return;
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
        const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substr(2, 6)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage.from('photos').upload(fileName, pending.file);
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from('photos').getPublicUrl(fileName);
        const geocode = pending.gpsData
          ? await reverseGeocode(pending.gpsData.latitude, pending.gpsData.longitude)
          : { prefecture: null, city: null, town: null };

        const { error: insertError } = await supabase.from('photos').insert({
          user_id: user.id,
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
    }
    if (completed === toUpload.length) {
      setTimeout(() => navigate('/feed'), 1500);
    } else {
      setUploading(false);
    }
  };

  const clearAll = () => {
    setPendingFiles([]);
    setShowLocationPicker(null);
  };

  const pendingCount = pendingFiles.filter(f => f.status === 'pending').length;
  const noGpsFiles = pendingFiles.filter(f => f.status === 'pending' && !f.gpsData);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 glass-panel border-t-0 rounded-t-none">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={() => navigate('/feed')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-bold">
            写真をアップロード {pendingFiles.length > 0 && `(${pendingFiles.length}枚)`}
          </h1>
          {pendingFiles.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearAll}>
              全削除
            </Button>
          )}
          {pendingFiles.length === 0 && <div className="w-10" />}
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-20 pb-8 max-w-lg mx-auto px-4 space-y-4">
        {/* Dropzone & File selector */}
        {!uploading && (
          <div className="space-y-2">
            <div
              {...getRootProps()}
              className={`glass-panel p-8 text-center cursor-pointer transition-colors
                ${isDragActive ? 'border-primary/50 bg-primary/5' : 'hover:border-primary/30'}`}
            >
              <input {...getInputProps()} />
              <div className="inline-flex p-4 bg-primary/10 rounded-2xl mb-4">
                <Image className="w-12 h-12 text-primary" />
              </div>
              <h2 className="text-lg font-semibold mb-2">
                {isDragActive ? 'ドロップしてアップロード' : pendingFiles.length > 0 ? '写真を追加' : '写真を選択'}
              </h2>
              <p className="text-sm text-muted-foreground">
                ドラッグ＆ドロップまたはクリックして選択
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                ※ 複数選択可。GPS情報が含まれている写真は位置が表示されます
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
                  if (files.length > 0) processFiles(files);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        )}

        {/* Pending files list */}
        {pendingFiles.length > 0 && (
          <div className="space-y-3">
            {pendingFiles.map((pending, index) => (
              <motion.div
                key={`${pending.file.name}-${index}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`glass-panel p-3 space-y-2 ${
                  pending.status === 'done' ? 'border-green-500/30' :
                  pending.status === 'error' ? 'border-destructive/30' :
                  pending.status === 'uploading' ? 'border-primary/30' : ''
                }`}
              >
                <div className="flex gap-3">
                  <div className="relative w-20 h-20 shrink-0">
                    <img src={pending.preview} alt="" className="w-full h-full object-cover rounded-lg" />
                    {pending.status === 'done' && (
                      <div className="absolute inset-0 bg-green-500/20 rounded-lg flex items-center justify-center">
                        <CheckCircle2 className="w-8 h-8 text-green-500" />
                      </div>
                    )}
                    {pending.status === 'uploading' && (
                      <div className="absolute inset-0 bg-background/50 rounded-lg flex items-center justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-primary" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium truncate">{pending.file.name}</p>
                      {pending.status === 'pending' && !uploading && (
                        <button onClick={() => removeFile(index)} className="p-1 hover:bg-muted rounded shrink-0">
                          <X className="w-4 h-4" />
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
                      <button
                        onClick={() => handleAnalyze(index)}
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5"
                      >
                        <Sparkles className="w-3 h-3" />
                        AIで自動タグ付け
                      </button>
                    )}
                  </div>
                </div>

                {pending.status === 'pending' && !uploading && (
                  <Textarea
                    placeholder="キャプション... #ハッシュタグも使えます"
                    value={pending.caption}
                    onChange={(e) => updateCaption(index, e.target.value)}
                    className="min-h-[50px] text-sm"
                    rows={2}
                  />
                )}

                {pending.caption && pending.status !== 'pending' && (
                  <p className="text-xs text-muted-foreground truncate">{pending.caption}</p>
                )}
              </motion.div>
            ))}
          </div>
        )}

        {/* Upload progress */}
        {uploading && (
          <div className="glass-panel p-4 space-y-2">
            <Progress value={uploadProgress} className="h-2" />
            <p className="text-sm text-muted-foreground text-center">{uploadProgress}% 完了</p>
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
          <Button className="w-full" size="lg" onClick={handleUploadAll}>
            <UploadIcon className="w-4 h-4 mr-2" />
            {pendingCount}枚を投稿する
          </Button>
        )}
      </main>
    </div>
  );
};

export default Upload;
