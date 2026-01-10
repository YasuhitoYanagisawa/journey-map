import { PhotoLocation, DayStats } from '@/types/photo';

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function calculateDayStats(locations: PhotoLocation[]): DayStats {
  if (locations.length === 0) {
    return {
      totalPhotos: 0,
      totalDistance: 0,
      startTime: null,
      endTime: null,
      duration: 0,
      locations: [],
    };
  }

  // Sort by timestamp
  const sorted = [...locations].sort((a, b) => 
    a.timestamp.getTime() - b.timestamp.getTime()
  );

  // Calculate total distance
  let totalDistance = 0;
  for (let i = 1; i < sorted.length; i++) {
    totalDistance += calculateDistance(
      sorted[i - 1].latitude,
      sorted[i - 1].longitude,
      sorted[i].latitude,
      sorted[i].longitude
    );
  }

  const startTime = sorted[0].timestamp;
  const endTime = sorted[sorted.length - 1].timestamp;
  const duration = (endTime.getTime() - startTime.getTime()) / (1000 * 60);

  return {
    totalPhotos: locations.length,
    totalDistance: Math.round(totalDistance * 100) / 100,
    startTime,
    endTime,
    duration: Math.round(duration),
    locations: sorted,
  };
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  if (hours === 0) {
    return `${mins}分`;
  }
  return `${hours}時間${mins > 0 ? ` ${mins}分` : ''}`;
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString('ja-JP', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
}
