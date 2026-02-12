import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Heart, MessageCircle, Share2, User, Plus, LogOut, Map, MoreVertical, Trash2, Bookmark, Image, Archive, Pencil, Check, X } from 'lucide-react';
import InlineUploadForm from '@/components/InlineUploadForm';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from '@/components/ui/sonner';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { ja } from 'date-fns/locale';
import { renderWithHashtags } from '@/utils/hashtagUtils';

interface Photo {
  id: string;
  user_id: string;
  filename: string;
  storage_path: string;
  thumbnail_url: string | null;
  latitude: number | null;
  longitude: number | null;
  taken_at: string | null;
  caption: string | null;
  created_at: string;
  profiles?: {
    display_name: string | null;
    avatar_url: string | null;
    username: string | null;
  } | null;
  likes_count?: number;
  comments_count?: number;
  is_liked?: boolean;
}

interface Comment {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  profiles?: {
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

const Feed = () => {
  const navigate = useNavigate();
  const { user, signOut, loading } = useAuth();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(true);
  const [expandedPhoto, setExpandedPhoto] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [newComment, setNewComment] = useState<Record<string, string>>({});
  const [submittingComment, setSubmittingComment] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Photo | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState('');

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      fetchPhotos();
    }
  }, [user]);

  const fetchPhotos = async () => {
    try {
      // Fetch photos
      const { data: photosData, error: photosError } = await supabase
        .from('photos')
        .select('*')
        .eq('is_archived', false)
        .order('created_at', { ascending: false })
        .limit(50);

      if (photosError) throw photosError;

      // Fetch profiles for each unique user
      const userIds = [...new Set(photosData?.map(p => p.user_id) || [])];
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url, username')
        .in('user_id', userIds);

      const profilesMap = (profilesData || []).reduce((acc, profile) => {
        acc[profile.user_id] = profile;
        return acc;
      }, {} as Record<string, typeof profilesData[0]>);

      // Fetch likes count for each photo
      const photoIds = photosData?.map(p => p.id) || [];
      
      const { data: likesData } = await supabase
        .from('likes')
        .select('photo_id')
        .in('photo_id', photoIds);

      const { data: userLikes } = await supabase
        .from('likes')
        .select('photo_id')
        .eq('user_id', user?.id)
        .in('photo_id', photoIds);

      const { data: commentsData } = await supabase
        .from('comments')
        .select('photo_id')
        .in('photo_id', photoIds);

      const likesCountMap = (likesData || []).reduce((acc, like) => {
        acc[like.photo_id] = (acc[like.photo_id] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const userLikesSet = new Set((userLikes || []).map(l => l.photo_id));

      const commentsCountMap = (commentsData || []).reduce((acc, comment) => {
        acc[comment.photo_id] = (acc[comment.photo_id] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const photosWithCounts: Photo[] = (photosData || []).map(photo => ({
        ...photo,
        profiles: profilesMap[photo.user_id] || null,
        likes_count: likesCountMap[photo.id] || 0,
        comments_count: commentsCountMap[photo.id] || 0,
        is_liked: userLikesSet.has(photo.id),
      }));

      setPhotos(photosWithCounts);
    } catch (error) {
      console.error('Error fetching photos:', error);
      toast.error('写真の読み込みに失敗しました');
    } finally {
      setLoadingPhotos(false);
    }
  };

  const handleLike = async (photoId: string) => {
    if (!user) return;

    const photo = photos.find(p => p.id === photoId);
    if (!photo) return;

    try {
      if (photo.is_liked) {
        // Unlike
        await supabase
          .from('likes')
          .delete()
          .eq('photo_id', photoId)
          .eq('user_id', user.id);

        setPhotos(prev => prev.map(p => 
          p.id === photoId 
            ? { ...p, is_liked: false, likes_count: (p.likes_count || 1) - 1 }
            : p
        ));
      } else {
        // Like
        await supabase
          .from('likes')
          .insert({ photo_id: photoId, user_id: user.id });

        setPhotos(prev => prev.map(p => 
          p.id === photoId 
            ? { ...p, is_liked: true, likes_count: (p.likes_count || 0) + 1 }
            : p
        ));
      }
    } catch (error) {
      console.error('Error toggling like:', error);
    }
  };

  const fetchComments = async (photoId: string) => {
    try {
      const { data: commentsRaw, error } = await supabase
        .from('comments')
        .select('*')
        .eq('photo_id', photoId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Fetch profiles for commenters
      const userIds = [...new Set(commentsRaw?.map(c => c.user_id) || [])];
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url')
        .in('user_id', userIds);

      const profilesMap = (profilesData || []).reduce((acc, profile) => {
        acc[profile.user_id] = profile;
        return acc;
      }, {} as Record<string, { display_name: string | null; avatar_url: string | null }>);

      const commentsWithProfiles: Comment[] = (commentsRaw || []).map(c => ({
        id: c.id,
        user_id: c.user_id,
        content: c.content,
        created_at: c.created_at,
        profiles: profilesMap[c.user_id] || null,
      }));

      setComments(prev => ({ ...prev, [photoId]: commentsWithProfiles }));
    } catch (error) {
      console.error('Error fetching comments:', error);
    }
  };

  const handleExpandComments = async (photoId: string) => {
    if (expandedPhoto === photoId) {
      setExpandedPhoto(null);
    } else {
      setExpandedPhoto(photoId);
      if (!comments[photoId]) {
        await fetchComments(photoId);
      }
    }
  };

  const handleAddComment = async (photoId: string) => {
    if (!user || !newComment[photoId]?.trim()) return;

    setSubmittingComment(photoId);
    try {
      const { data, error } = await supabase
        .from('comments')
        .insert({
          photo_id: photoId,
          user_id: user.id,
          content: newComment[photoId].trim(),
        })
        .select('*')
        .single();

      if (error) throw error;

      // Get user's profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('user_id', user.id)
        .maybeSingle();

      const newCommentObj: Comment = {
        id: data.id,
        user_id: data.user_id,
        content: data.content,
        created_at: data.created_at,
        profiles: profileData || null,
      };

      setComments(prev => ({
        ...prev,
        [photoId]: [...(prev[photoId] || []), newCommentObj],
      }));
      setNewComment(prev => ({ ...prev, [photoId]: '' }));
      setPhotos(prev => prev.map(p => 
        p.id === photoId 
          ? { ...p, comments_count: (p.comments_count || 0) + 1 }
          : p
      ));
      toast.success('コメントを追加しました');
    } catch (error) {
      console.error('Error adding comment:', error);
      toast.error('コメントの追加に失敗しました');
    } finally {
      setSubmittingComment(null);
    }
  };

  const handleDeletePhoto = async () => {
    if (!deleteTarget || !user) return;
    setDeleting(true);
    try {
      // Archive instead of delete - just hide from feed
      const { error } = await supabase
        .from('photos')
        .update({ is_archived: true })
        .eq('id', deleteTarget.id)
        .eq('user_id', user.id);
      if (error) throw error;
      setPhotos(prev => prev.filter(p => p.id !== deleteTarget.id));
      toast.success('写真をアーカイブしました');
    } catch (error) {
      console.error('Error archiving photo:', error);
      toast.error('写真のアーカイブに失敗しました');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };
  const handleEditComment = async (photoId: string, commentId: string) => {
    if (!user || !editCommentText.trim()) return;
    try {
      const { error } = await supabase
        .from('comments')
        .update({ content: editCommentText.trim() })
        .eq('id', commentId)
        .eq('user_id', user.id);
      if (error) throw error;
      setComments(prev => ({
        ...prev,
        [photoId]: prev[photoId]?.map(c =>
          c.id === commentId ? { ...c, content: editCommentText.trim() } : c
        ) || [],
      }));
      setEditingComment(null);
      setEditCommentText('');
      toast.success('コメントを編集しました');
    } catch (error) {
      console.error('Error editing comment:', error);
      toast.error('コメントの編集に失敗しました');
    }
  };

  const getPublicUrl = (path: string) => {
    const { data } = supabase.storage.from('photos').getPublicUrl(path);
    return data.publicUrl;
  };

  if (loading || loadingPhotos) {
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
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <MapPin className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold gradient-text">PhotoTrail</h1>
              <p className="text-xs text-muted-foreground">フォトSNS</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/')}
              title="マップビュー"
            >
              <Map className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/gallery')}
              title="マイギャラリー"
            >
              <Image className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/upload')}
              title="写真をアップロード"
            >
              <Plus className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={signOut}
              title="ログアウト"
            >
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-20 pb-8 max-w-lg mx-auto px-4">
        {/* Inline Upload Form */}
        {user && (
          <div className="mb-6">
            <InlineUploadForm userId={user.id} onUploaded={fetchPhotos} />
          </div>
        )}

        {photos.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-16"
          >
            <div className="inline-flex p-4 bg-primary/10 rounded-2xl mb-6">
              <MapPin className="w-12 h-12 text-primary" />
            </div>
            <h2 className="text-xl font-semibold mb-2">まだ写真がありません</h2>
            <p className="text-muted-foreground mb-6">
              上のフォームから最初の写真をアップロードしましょう！
            </p>
          </motion.div>
        ) : (
          <div className="space-y-6">
            {photos.map((photo, index) => (
              <motion.article
                key={photo.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="glass-panel overflow-hidden"
              >
                {/* User Header */}
                <div className="p-4 flex items-center gap-3">
                  <Avatar className="w-10 h-10">
                    <AvatarImage src={photo.profiles?.avatar_url || undefined} />
                    <AvatarFallback>
                      <User className="w-5 h-5" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-medium">
                      {photo.profiles?.display_name || photo.profiles?.username || '名無しさん'}
                    </p>
                    {photo.latitude && photo.longitude && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {photo.latitude.toFixed(4)}, {photo.longitude.toFixed(4)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(photo.created_at), { addSuffix: true, locale: ja })}
                    </span>
                    {user?.id === photo.user_id && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-1 rounded-md hover:bg-muted transition-colors">
                            <MoreVertical className="w-4 h-4 text-muted-foreground" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteTarget(photo)}
                          >
                            <Archive className="w-4 h-4 mr-2" />
                            アーカイブ
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>

                {/* Photo */}
                <div className="aspect-square bg-muted">
                  <img
                    src={getPublicUrl(photo.storage_path)}
                    alt={photo.filename}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>

                {/* Actions */}
                <div className="p-4">
                  <div className="flex items-center gap-4 mb-3">
                    <button
                      onClick={() => handleLike(photo.id)}
                      className="flex items-center gap-1 transition-colors"
                    >
                      <Heart
                        className={`w-6 h-6 ${photo.is_liked ? 'fill-red-500 text-red-500' : 'text-foreground'}`}
                      />
                      <span className="text-sm">{photo.likes_count || 0}</span>
                    </button>
                    <button
                      onClick={() => handleExpandComments(photo.id)}
                      className="flex items-center gap-1"
                    >
                      <MessageCircle className="w-6 h-6" />
                      <span className="text-sm">{photo.comments_count || 0}</span>
                    </button>
                    <button className="ml-auto">
                      <Share2 className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Caption with hashtags */}
                  {photo.caption && (
                    <p className="text-sm mb-3">
                      <span className="font-medium mr-2">
                        {photo.profiles?.display_name || '名無しさん'}
                      </span>
                      {renderWithHashtags(photo.caption)}
                    </p>
                  )}

                  {/* Comments Section */}
                  <AnimatePresence>
                    {expandedPhoto === photo.id && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="border-t border-border pt-3 mt-3 space-y-3"
                      >
                        {/* Comments List */}
                        {comments[photo.id]?.map((comment) => (
                          <div key={comment.id} className="flex gap-2 group/comment">
                            <Avatar className="w-6 h-6 shrink-0">
                              <AvatarImage src={comment.profiles?.avatar_url || undefined} />
                              <AvatarFallback>
                                <User className="w-3 h-3" />
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              {editingComment === comment.id ? (
                                <div className="flex gap-1 items-start">
                                  <Textarea
                                    value={editCommentText}
                                    onChange={(e) => setEditCommentText(e.target.value)}
                                    className="min-h-[40px] text-sm flex-1"
                                    autoFocus
                                  />
                                  <button
                                    onClick={() => handleEditComment(photo.id, comment.id)}
                                    className="p-1 text-primary hover:bg-primary/10 rounded"
                                  >
                                    <Check className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => { setEditingComment(null); setEditCommentText(''); }}
                                    className="p-1 text-muted-foreground hover:bg-muted rounded"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <p className="text-sm">
                                    <span className="font-medium mr-2">
                                      {comment.profiles?.display_name || '名無しさん'}
                                    </span>
                                    {renderWithHashtags(comment.content)}
                                  </p>
                                  <div className="flex items-center gap-2">
                                    <p className="text-xs text-muted-foreground">
                                      {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true, locale: ja })}
                                    </p>
                                    {user?.id === comment.user_id && (
                                      <button
                                        onClick={() => { setEditingComment(comment.id); setEditCommentText(comment.content); }}
                                        className="text-xs text-muted-foreground hover:text-primary opacity-0 group-hover/comment:opacity-100 transition-opacity"
                                      >
                                        <Pencil className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        ))}

                        {/* Add Comment */}
                        <div className="flex gap-2">
                          <Textarea
                            placeholder="コメントを追加..."
                            value={newComment[photo.id] || ''}
                            onChange={(e) => setNewComment(prev => ({ ...prev, [photo.id]: e.target.value }))}
                            className="min-h-[60px] text-sm"
                          />
                          <Button
                            size="sm"
                            onClick={() => handleAddComment(photo.id)}
                            disabled={submittingComment === photo.id || !newComment[photo.id]?.trim()}
                          >
                            送信
                          </Button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.article>
            ))}
          </div>
        )}
      </main>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>写真をアーカイブしますか？</AlertDialogTitle>
            <AlertDialogDescription>
              フィードから非表示になりますが、写真データは残ります。ギャラリーからいつでも復元できます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePhoto}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'アーカイブ中...' : 'アーカイブする'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Feed;
