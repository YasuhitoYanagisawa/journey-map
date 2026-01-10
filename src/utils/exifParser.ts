import EXIF from 'exif-js';
import { PhotoLocation } from '@/types/photo';

function convertDMSToDD(degrees: number, minutes: number, seconds: number, direction: string): number {
  let dd = degrees + minutes / 60 + seconds / 3600;
  if (direction === 'S' || direction === 'W') {
    dd = dd * -1;
  }
  return dd;
}

function getGPSCoordinates(exifData: any): { latitude: number; longitude: number } | null {
  const latData = exifData.GPSLatitude;
  const lonData = exifData.GPSLongitude;
  const latRef = exifData.GPSLatitudeRef;
  const lonRef = exifData.GPSLongitudeRef;

  if (!latData || !lonData || !latRef || !lonRef) {
    return null;
  }

  const latitude = convertDMSToDD(
    latData[0],
    latData[1],
    latData[2],
    latRef
  );

  const longitude = convertDMSToDD(
    lonData[0],
    lonData[1],
    lonData[2],
    lonRef
  );

  return { latitude, longitude };
}

function getTimestamp(exifData: any): Date {
  const dateTimeOriginal = exifData.DateTimeOriginal;
  if (dateTimeOriginal) {
    // EXIF date format: "YYYY:MM:DD HH:MM:SS"
    const parts = dateTimeOriginal.split(' ');
    const dateParts = parts[0].split(':');
    const timeParts = parts[1]?.split(':') || ['00', '00', '00'];
    return new Date(
      parseInt(dateParts[0]),
      parseInt(dateParts[1]) - 1,
      parseInt(dateParts[2]),
      parseInt(timeParts[0]),
      parseInt(timeParts[1]),
      parseInt(timeParts[2])
    );
  }
  return new Date();
}

export function parsePhotoEXIF(file: File): Promise<PhotoLocation | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    
    reader.onload = function(e) {
      const img = new Image();
      img.onload = function() {
        EXIF.getData(img as any, function(this: any) {
          const exifData = EXIF.getAllTags(this);
          const coords = getGPSCoordinates(exifData);
          
          if (!coords) {
            resolve(null);
            return;
          }

          const timestamp = getTimestamp(exifData);
          const thumbnailUrl = URL.createObjectURL(file);

          resolve({
            id: `${file.name}-${Date.now()}`,
            filename: file.name,
            latitude: coords.latitude,
            longitude: coords.longitude,
            timestamp,
            thumbnailUrl,
            originalFile: file,
          });
        });
      };
      img.src = e.target?.result as string;
    };
    
    reader.readAsDataURL(file);
  });
}

export async function parseMultiplePhotos(files: File[]): Promise<PhotoLocation[]> {
  const results = await Promise.all(files.map(parsePhotoEXIF));
  return results.filter((result): result is PhotoLocation => result !== null);
}
