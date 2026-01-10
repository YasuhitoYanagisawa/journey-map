import { motion } from 'framer-motion';
import { PhotoLocation } from '@/types/photo';
import { formatTime } from '@/utils/statsCalculator';

interface PhotoTimelineProps {
  photos: PhotoLocation[];
}

const PhotoTimeline = ({ photos }: PhotoTimelineProps) => {
  const sortedPhotos = [...photos].sort((a, b) => 
    a.timestamp.getTime() - b.timestamp.getTime()
  );

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="glass-panel p-6"
    >
      <h2 className="text-lg font-semibold gradient-text mb-4">タイムライン</h2>
      
      <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
        {sortedPhotos.map((photo, index) => (
          <motion.div
            key={photo.id}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.05 * index }}
            className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/50 transition-colors cursor-pointer group"
          >
            <div className="relative">
              <img
                src={photo.thumbnailUrl}
                alt={photo.filename}
                className="w-12 h-12 rounded-lg object-cover border border-border group-hover:border-primary/50 transition-colors"
              />
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-primary-foreground text-xs font-bold rounded-full flex items-center justify-center">
                {index + 1}
              </span>
            </div>
            
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {photo.filename}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatTime(photo.timestamp)}
              </p>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
};

export default PhotoTimeline;
