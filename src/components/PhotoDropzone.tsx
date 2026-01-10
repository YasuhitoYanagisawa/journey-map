import { useCallback, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, ImageIcon, Loader2, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PhotoDropzoneProps {
  onFilesSelected: (files: File[]) => void;
  isLoading?: boolean;
}

const PhotoDropzone = ({ onFilesSelected, isLoading = false }: PhotoDropzoneProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [processingCount, setProcessingCount] = useState(0);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback((files: File[]) => {
    if (files.length === 0) return;
    setProcessingCount(files.length);
    onFilesSelected(files);
    // Reset after a delay
    setTimeout(() => setProcessingCount(0), 500);
  }, [onFilesSelected]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files).filter((file) =>
      file.type.startsWith('image/')
    );

    handleFiles(files);
  }, [handleFiles]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    handleFiles(files);
  }, [handleFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleCameraClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    cameraInputRef.current?.click();
  };

  const handleFileClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    fileInputRef.current?.click();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full max-w-2xl mx-auto"
    >
      {/* Hidden inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileInput}
        className="hidden"
      />
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
          {isLoading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex flex-col items-center gap-4"
            >
              <Loader2 className="w-12 h-12 text-primary animate-spin" />
              <p className="text-muted-foreground">
                写真を処理中...
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
                GPS情報を含むJPEG画像に対応
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default PhotoDropzone;
