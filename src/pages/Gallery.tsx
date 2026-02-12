import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, ArrowLeft, Archive, RotateCcw, Trash2, Image, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { ja } from 'date-fns/locale';

interface Photo {
  id: string;
  user_id: string;
  filename: string;
  storage_path: string;
  caption: string | null;
  latitude: number | null;
  longitude: number | null;
  taken_at: string | null;
  created_at: string;
  is_archived: boolean;
}

const Gallery = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(true);
  const [tab, setTab] = useState('active');
  const [deleteTarget, setDeleteTarget] = useState<Photo | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate('/auth');
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) fetchPhotos();
  }, [user]);

  const fetchPhotos = async () => {
    try {
      const { data, error } = await supabase
        .from('photos')
        .select('id, user_id, filename, storage_path, caption, latitude, longitude, taken_at, created_at, is_archived')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setPhotos(data || []);
    } catch (error) {
      console.error('Error fetching photos:', error);
      toast.error('写真の読み込みに失敗しました');
    } finally {
      setLoadingPhotos(false);
    }
  };

  const toggleArchive = async (photo: Photo) => {
    try {
      const { error } = await supabase
        .from('photos')
        .update({ is_archived: !photo.is_archived })
        .eq('id', photo.id)
        .eq('user_id', user!.id);
      if (error) throw error;
      setPhotos(prev => prev.map(p => p.id === photo.id ? { ...p, is_archived: !p.is_archived } : p));
      toast.success(photo.is_archived ? 'フィードに復元しました' : 'アーカイブしました');
    } catch (error) {
      console.error('Error toggling archive:', error);
      toast.error('操作に失敗しました');
    }
  };

  const handlePermanentDelete = async () => {
    if (!deleteTarget || !user) return;
    setDeleting(true);
    try {
      await supabase.storage.from('photos').remove([deleteTarget.storage_path]);
      await supabase.from('likes').delete().eq('photo_id', deleteTarget.id);
      await supabase.from('comments').delete().eq('photo_id', deleteTarget.id);
      const { error } = await supabase.from('photos').delete().eq('id', deleteTarget.id).eq('user_id', user.id);
      if (error) throw error;
      setPhotos(prev => prev.filter(p => p.id !== deleteTarget.id));
      toast.success('完全に削除しました');
    } catch (error) {
      console.error('Error deleting photo:', error);
      toast.error('削除に失敗しました');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const getPublicUrl = (path: string) => {
    const { data } = supabase.storage.from('photos').getPublicUrl(path);
    return data.publicUrl;
  };

  const activePhotos = photos.filter(p => !p.is_archived);
  const archivedPhotos = photos.filter(p => p.is_archived);

  if (loading || loadingPhotos) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const PhotoGrid = ({ items, showRestore }: { items: Photo[]; showRestore?: boolean }) => (
    <div className="grid grid-cols-3 gap-1">
      {items.map((photo, index) => (
        <motion.div
          key={photo.id}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: index * 0.02 }}
          className="relative aspect-square group"
        >
          <img
            src={getPublicUrl(photo.storage_path)}
            alt={photo.filename}
            className="w-full h-full object-cover rounded-sm"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors rounded-sm flex items-center justify-center opacity-0 group-hover:opacity-100">
            <div className="flex gap-1">
              {showRestore ? (
                <button
                  onClick={() => toggleArchive(photo)}
                  className="p-2 bg-background/80 rounded-full hover:bg-background transition-colors"
                  title="フィードに復元"
                >
                  <RotateCcw className="w-4 h-4 text-foreground" />
                </button>
              ) : (
                <button
                  onClick={() => toggleArchive(photo)}
                  className="p-2 bg-background/80 rounded-full hover:bg-background transition-colors"
                  title="アーカイブ"
                >
                  <Archive className="w-4 h-4 text-foreground" />
                </button>
              )}
              <button
                onClick={() => setDeleteTarget(photo)}
                className="p-2 bg-destructive/80 rounded-full hover:bg-destructive transition-colors"
                title="完全に削除"
              >
                <Trash2 className="w-4 h-4 text-destructive-foreground" />
              </button>
            </div>
          </div>
          {photo.is_archived && !showRestore && (
            <div className="absolute top-1 right-1">
              <EyeOff className="w-3 h-3 text-white drop-shadow" />
            </div>
          )}
        </motion.div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="fixed top-0 left-0 right-0 z-50 glass-panel border-t-0 rounded-t-none">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/feed')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-bold gradient-text">マイギャラリー</h1>
            <p className="text-xs text-muted-foreground">{photos.length} 枚の写真</p>
          </div>
        </div>
      </header>

      <main className="pt-20 pb-8 max-w-2xl mx-auto px-4">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full mb-4">
            <TabsTrigger value="active" className="flex-1 gap-1">
              <Eye className="w-4 h-4" />
              公開中 ({activePhotos.length})
            </TabsTrigger>
            <TabsTrigger value="archived" className="flex-1 gap-1">
              <Archive className="w-4 h-4" />
              アーカイブ ({archivedPhotos.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active">
            {activePhotos.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Image className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>公開中の写真はありません</p>
              </div>
            ) : (
              <PhotoGrid items={activePhotos} />
            )}
          </TabsContent>

          <TabsContent value="archived">
            {archivedPhotos.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Archive className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>アーカイブされた写真はありません</p>
              </div>
            ) : (
              <PhotoGrid items={archivedPhotos} showRestore />
            )}
          </TabsContent>
        </Tabs>
      </main>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>完全に削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              この操作は取り消せません。写真データ、いいね、コメントがすべて完全に削除されます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={handlePermanentDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? '削除中...' : '完全に削除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Gallery;
