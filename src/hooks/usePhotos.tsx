import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { PhotoLocation } from '@/types/photo';
import { parseMultiplePhotos } from '@/utils/exifParser';
import { reverseGeocode } from '@/utils/reverseGeocode';
import { toast } from '@/components/ui/sonner';

export const usePhotos = () => {
  const { user } = useAuth();
  const [photos, setPhotos] = useState<PhotoLocation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);

  // Fetch photos from Supabase on mount
  const fetchPhotos = useCallback(async () => {
    if (!user) {
      setIsFetching(false);
      return;
    }

    try {
      setIsFetching(true);
      const { data, error } = await supabase
        .from('photos')
        .select('*')
        .eq('user_id', user.id)
        .order('taken_at', { ascending: true });

      if (error) throw error;

      // Convert DB photos to PhotoLocation format (only those with GPS)
      const dbPhotos: PhotoLocation[] = (data || [])
        .filter(p => p.latitude !== null && p.longitude !== null)
        .map(p => ({
          id: p.id,
          filename: p.filename,
          latitude: p.latitude!,
          longitude: p.longitude!,
          timestamp: p.taken_at ? new Date(p.taken_at) : new Date(p.created_at),
          thumbnailUrl: p.thumbnail_url || '',
          prefecture: p.prefecture,
          city: p.city,
          town: p.town,
        }));

      setPhotos(dbPhotos);
    } catch (error) {
      console.error('Error fetching photos:', error);
    } finally {
      setIsFetching(false);
    }
  }, [user]);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  // Upload files and save to Supabase
  const uploadPhotos = useCallback(async (files: File[]): Promise<PhotoLocation[]> => {
    if (!user) {
      toast.error('ログインが必要です');
      return [];
    }

    setIsLoading(true);

    try {
      // Parse EXIF from files
      const parsedPhotos = await parseMultiplePhotos(files, {
        concurrency: 2,
        yieldEvery: 3,
      });

      if (parsedPhotos.length === 0) {
        toast.error('位置情報のある写真が見つかりませんでした', {
          description: '位置情報（GPS）がOFFの写真はスキップされます。',
        });
        return [];
      }

      const skipped = files.length - parsedPhotos.length;
      if (skipped > 0) {
        toast.message('一部の写真をスキップしました', {
          description: `読み込み: ${parsedPhotos.length}枚 / スキップ: ${skipped}枚`,
        });
      }

      // Upload each photo to storage and save to DB
      const uploadedPhotos: PhotoLocation[] = [];

      for (const photo of parsedPhotos) {
        if (!photo.originalFile) continue;

        const file = photo.originalFile;
        const fileExt = file.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`;

        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from('photos')
          .upload(fileName, file);

        if (uploadError) {
          console.error('Upload error:', uploadError);
          continue;
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('photos')
          .getPublicUrl(fileName);

        // Reverse geocode to get address info
        const geocodeResult = await reverseGeocode(photo.latitude, photo.longitude);

        // Insert photo record
        const { data: insertedPhoto, error: insertError } = await supabase
          .from('photos')
          .insert({
            user_id: user.id,
            filename: file.name,
            storage_path: fileName,
            thumbnail_url: urlData.publicUrl,
            latitude: photo.latitude,
            longitude: photo.longitude,
            taken_at: photo.timestamp.toISOString(),
            prefecture: geocodeResult.prefecture,
            city: geocodeResult.city,
            town: geocodeResult.town,
          })
          .select()
          .single();

        if (insertError) {
          console.error('Insert error:', insertError);
          continue;
        }

        uploadedPhotos.push({
          id: insertedPhoto.id,
          filename: insertedPhoto.filename,
          latitude: insertedPhoto.latitude!,
          longitude: insertedPhoto.longitude!,
          timestamp: new Date(insertedPhoto.taken_at!),
          thumbnailUrl: insertedPhoto.thumbnail_url || '',
          prefecture: insertedPhoto.prefecture,
          city: insertedPhoto.city,
          town: insertedPhoto.town,
        });
      }

      if (uploadedPhotos.length > 0) {
        setPhotos(prev => [...prev, ...uploadedPhotos]);
        toast.success(`${uploadedPhotos.length}枚の写真をアップロードしました`);
      }

      return uploadedPhotos;
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('アップロードに失敗しました');
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Add photos locally (for non-logged-in users or preview only)
  const addLocalPhotos = useCallback((newPhotos: PhotoLocation[]) => {
    setPhotos(prev => [...prev, ...newPhotos]);
  }, []);

  // Update address info for photos that don't have it
  const updateAddressInfo = useCallback(async (onProgress?: (current: number, total: number) => void): Promise<number> => {
    if (!user) return 0;

    // Find photos without address info
    const photosNeedingUpdate = photos.filter(p => !p.prefecture && !p.city && !p.town);
    if (photosNeedingUpdate.length === 0) {
      toast.message('すべての写真に住所情報があります');
      return 0;
    }

    let updated = 0;
    const total = photosNeedingUpdate.length;

    for (let i = 0; i < photosNeedingUpdate.length; i++) {
      const photo = photosNeedingUpdate[i];
      onProgress?.(i + 1, total);

      try {
        const geocodeResult = await reverseGeocode(photo.latitude, photo.longitude);
        
        if (geocodeResult.prefecture || geocodeResult.city || geocodeResult.town) {
          const { error } = await supabase
            .from('photos')
            .update({
              prefecture: geocodeResult.prefecture,
              city: geocodeResult.city,
              town: geocodeResult.town,
            })
            .eq('id', photo.id);

          if (!error) {
            updated++;
            // Update local state
            setPhotos(prev => prev.map(p => 
              p.id === photo.id 
                ? { ...p, prefecture: geocodeResult.prefecture, city: geocodeResult.city, town: geocodeResult.town }
                : p
            ));
          }
        }

        // Rate limit: avoid hitting Mapbox limits
        if (i < photosNeedingUpdate.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 150));
        }
      } catch (error) {
        console.error('Geocoding error for photo:', photo.id, error);
      }
    }

    if (updated > 0) {
      toast.success(`${updated}枚の写真に住所情報を追加しました`);
    } else {
      toast.error('住所情報の取得に失敗しました', {
        description: 'Mapbox APIキーを確認してください',
      });
    }

    return updated;
  }, [user, photos]);

  return {
    photos,
    isLoading,
    isFetching,
    uploadPhotos,
    addLocalPhotos,
    updateAddressInfo,
    refetch: fetchPhotos,
  };
};
