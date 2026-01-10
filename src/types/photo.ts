export interface PhotoLocation {
  id: string;
  filename: string;
  latitude: number;
  longitude: number;
  timestamp: Date;
  thumbnailUrl: string;
  originalFile?: File;
}

export interface DayStats {
  totalPhotos: number;
  totalDistance: number; // in kilometers
  startTime: Date | null;
  endTime: Date | null;
  duration: number; // in minutes
  locations: PhotoLocation[];
}

export type ViewMode = 'markers' | 'heatmap' | 'route';
