import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MapPin, Upload as UploadIcon, Image, ArrowLeft, X, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { parsePhotoEXIF } from '@/utils/exifParser';
import { reverseGeocode } from '@/utils/reverseGeocode';
import { useDropzone } from 'react-dropzone';

const Upload = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [gpsData, setGpsData] = useState<{ latitude: number; longitude: number; timestamp: Date | null } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiTags, setAiTags] = useState<string[]>([]);
  const [aiDescription, setAiDescription] = useState('');
  const [aiSubjects, setAiSubjects] = useState<string[]>([]);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  const processFile = async (file: File) => {
    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    // Parse EXIF
    try {
      const exifData = await parsePhotoEXIF(file);
      if (exifData) {
        setGpsData({
          latitude: exifData.latitude,
          longitude: exifData.longitude,
          timestamp: exifData.timestamp,
        });
      } else {
        setGpsData(null);
      }
    } catch (error) {
      console.error('Error parsing EXIF:', error);
      setGpsData(null);
    }

    setSelectedFile(file);
  };

  const handleAnalyzePhoto = async () => {
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
        setAiSubjects(analysis.subjects || []);

        if (!caption.trim()) {
          const tagString = analysis.tags.map((t: string) => `#${t}`).join(' ');
          setCaption(analysis.description ? `${analysis.description}\n${tagString}` : tagString);
        }
        toast.success('AI分析完了！タグを生成しました');
      } else {
        toast.info('タグを生成できませんでした');
      }
    } catch (error) {
      console.error('AI analysis error:', error);
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
    if (!selectedFile || !user) return;

    setUploading(true);
    try {
      // Upload to storage
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('photos')
        .upload(fileName, selectedFile);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('photos')
        .getPublicUrl(fileName);

      // Reverse geocode to get address info (町丁目まで)
      const geocode = gpsData
        ? await reverseGeocode(gpsData.latitude, gpsData.longitude)
        : { prefecture: null, city: null, town: null };

      // Insert photo record
      const { error: insertError } = await supabase
        .from('photos')
        .insert({
          user_id: user.id,
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

      toast.success('写真をアップロードしました！');
      navigate('/feed');
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
    setAiSubjects([]);
  };

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
          <h1 className="text-lg font-bold">写真をアップロード</h1>
          <div className="w-10" />
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-20 pb-8 max-w-lg mx-auto px-4">
        {!selectedFile ? (
          /* Dropzone */
          <div
            {...getRootProps()}
            className={`glass-panel p-8 text-center cursor-pointer transition-colors
              ${isDragActive ? 'border-primary/50 bg-primary/5' : 'hover:border-primary/30'}
            `}
          >
            <input {...getInputProps()} />
            <div className="inline-flex p-4 bg-primary/10 rounded-2xl mb-4">
              <Image className="w-12 h-12 text-primary" />
            </div>
            <h2 className="text-lg font-semibold mb-2">
              {isDragActive ? 'ドロップしてアップロード' : '写真を選択'}
            </h2>
            <p className="text-sm text-muted-foreground">
              ドラッグ＆ドロップまたはクリックして選択
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              ※ GPS情報が含まれている写真は位置が表示されます
            </p>
          </div>
        ) : (
          /* Preview & Form */
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            {/* Preview */}
            <div className="relative glass-panel overflow-hidden">
              <button
                onClick={clearSelection}
                className="absolute top-2 right-2 z-10 p-1 bg-background/80 rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
              <img
                src={preview || ''}
                alt="Preview"
                className="w-full aspect-square object-cover"
              />
            </div>

            {/* GPS Info */}
            {gpsData ? (
              <div className="glass-panel p-4 flex items-center gap-3">
                <div className="p-2 bg-green-500/10 rounded-lg">
                  <MapPin className="w-5 h-5 text-green-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">位置情報あり</p>
                  <p className="text-xs text-muted-foreground">
                    {gpsData.latitude.toFixed(6)}, {gpsData.longitude.toFixed(6)}
                  </p>
                </div>
              </div>
            ) : (
              <div className="glass-panel p-4 flex items-center gap-3">
                <div className="p-2 bg-muted rounded-lg">
                  <MapPin className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">位置情報なし</p>
                  <p className="text-xs text-muted-foreground">
                    この写真にはGPS情報が含まれていません
                  </p>
                </div>
              </div>
            )}

            {/* AI Auto-Tag Button */}
            <Button
              variant="outline"
              className="w-full"
              onClick={handleAnalyzePhoto}
              disabled={analyzing}
            >
              {analyzing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  AI分析中...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  AIで自動タグ付け
                </>
              )}
            </Button>

            {/* AI Results */}
            {aiTags.length > 0 && (
              <div className="glass-panel p-4 space-y-3">
                <p className="text-sm font-medium flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  AI分析結果
                </p>
                {aiDescription && (
                  <p className="text-sm text-muted-foreground">{aiDescription}</p>
                )}
                {aiSubjects.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">被写体</p>
                    <div className="flex flex-wrap gap-1">
                      {aiSubjects.map((subject, i) => (
                        <Badge key={i} variant="secondary">{subject}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-1">
                  {aiTags.map((tag, i) => (
                    <Badge key={i} variant="outline" className="text-xs">#{tag}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Caption */}
            <div className="glass-panel p-4 space-y-2">
              <label className="text-sm font-medium">キャプション</label>
              <Textarea
                placeholder="写真について書く... #ハッシュタグも使えます"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                className="min-h-[100px]"
              />
            </div>

            {/* Upload Button */}
            <Button
              className="w-full"
              size="lg"
              onClick={handleUpload}
              disabled={uploading}
            >
              {uploading ? (
                <>
                  <span className="animate-spin mr-2">⏳</span>
                  アップロード中...
                </>
              ) : (
                <>
                  <UploadIcon className="w-4 h-4 mr-2" />
                  投稿する
                </>
              )}
            </Button>
          </motion.div>
        )}
      </main>
    </div>
  );
};

export default Upload;
