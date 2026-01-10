import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, ImageIcon, Loader2 } from 'lucide-react';

interface PhotoDropzoneProps {
  onFilesSelected: (files: File[]) => void;
  isLoading?: boolean;
}

const PhotoDropzone = ({ onFilesSelected, isLoading = false }: PhotoDropzoneProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [processingCount, setProcessingCount] = useState(0);

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

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full max-w-2xl mx-auto"
    >
      <label
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          relative flex flex-col items-center justify-center
          w-full h-64 p-8
          border-2 border-dashed rounded-2xl
          cursor-pointer
          transition-all duration-300
          ${isDragging 
            ? 'border-primary bg-primary/10 scale-[1.02]' 
            : 'border-border hover:border-primary/50 hover:bg-card/50'
          }
        `}
      >
        <input
          type="file"
          multiple
          accept="image/*"
          onChange={handleFileInput}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        
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
                <p className="mt-1 text-sm text-muted-foreground">
                  またはクリックして選択
                </p>
              </div>

              <p className="text-xs text-muted-foreground/70 mt-2">
                GPS情報を含むJPEG画像に対応
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </label>
    </motion.div>
  );
};

export default PhotoDropzone;
