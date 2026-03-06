import { useCallback, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, ImageIcon, Loader2, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import InAppCamera from '@/components/InAppCamera';

interface PhotoDropzoneProps {
  onFilesSelected: (files: File[]) => void;
  onCameraCapture?: (file: File, coords: { latitude: number; longitude: number }) => void;
  isLoading?: boolean;
}

const PhotoDropzone = ({ onFilesSelected, onCameraCapture, isLoading = false }: PhotoDropzoneProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [pendingCoords, setPendingCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter((file) =>
      file.type.startsWith('image/')
    );
    if (files.length > 0) onFilesSelected(files);
  }, [onFilesSelected]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length > 0) onFilesSelected(files);
  }, [onFilesSelected]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleCameraClick = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Get GPS first, then open in-app camera
    setGettingLocation(true);
    let coords: { latitude: number; longitude: number } | null = null;
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        });
      });
      coords = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      console.log('[PhotoDropzone] GPS acquired:', coords.latitude, coords.longitude);
    } catch (error) {
      console.error('[PhotoDropzone] Geolocation error:', error);
      toast.error('位置情報を取得できませんでした', {
        description: 'ブラウザの位置情報を許可してください',
      });
    } finally {
      setGettingLocation(false);
    }

    setPendingCoords(coords);
    setShowCamera(true);
  }, []);

  const handleCameraCapture = useCallback((file: File) => {
    setShowCamera(false);
    if (pendingCoords && onCameraCapture) {
      onCameraCapture(file, pendingCoords);
      toast.success('📍 現在地の位置情報を付与しました');
    } else {
      onFilesSelected([file]);
    }
    setPendingCoords(null);
  }, [pendingCoords, onCameraCapture, onFilesSelected]);

  const handleCameraClose = useCallback(() => {
    setShowCamera(false);
    setPendingCoords(null);
  }, []);

  const handleFileClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    fileInputRef.current?.click();
  };

  return (
    <>
      {/* In-app camera overlay */}
      <AnimatePresence>
        {showCamera && (
          <InAppCamera onCapture={handleCameraCapture} onClose={handleCameraClose} />
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-2xl mx-auto"
      >
        {/* Hidden file input (for file selection only) */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          onChange={handleFileInput}
          className="hidden"
        />

        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`
            relative flex flex-col items-center justify-center
            w-full h-64 p-8
            border-2 border-dashed rounded-2xl
            transition-all duration-300
            ${isDragging 
              ? 'border-primary bg-primary/10 scale-[1.02]' 
              : 'border-border hover:border-primary/50 hover:bg-card/50'
            }
          `}
        >
          <AnimatePresence mode="wait">
            {isLoading || gettingLocation ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex flex-col items-center gap-4"
              >
                <Loader2 className="w-12 h-12 text-primary animate-spin" />
                <p className="text-muted-foreground">
                  {gettingLocation ? '📍 位置情報を取得中...' : '写真を処理中...'}
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="idle"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex flex-col items-center gap-4"
              >
                <motion.div 
                  className={`
                    p-4 rounded-full
                    ${isDragging ? 'bg-primary/20' : 'bg-secondary'}
                  `}
                  animate={isDragging ? { scale: [1, 1.1, 1] } : {}}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                >
                  {isDragging ? (
                    <ImageIcon className="w-8 h-8 text-primary" />
                  ) : (
                    <Upload className="w-8 h-8 text-muted-foreground" />
                  )}
                </motion.div>
                
                <div className="text-center">
                  <p className="text-lg font-medium text-foreground">
                    {isDragging ? '写真をドロップ' : '写真をドラッグ&ドロップ'}
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row items-center gap-3 mt-2">
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={handleCameraClick}
                    disabled={gettingLocation}
                    className="gap-2"
                  >
                    <Camera className="w-4 h-4" />
                    カメラで撮影
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleFileClick}
                    className="gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    写真を選択
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground/70 mt-2">
                  📍 カメラ撮影時はブラウザの位置情報を自動付与
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </>
  );
};

export default PhotoDropzone;
