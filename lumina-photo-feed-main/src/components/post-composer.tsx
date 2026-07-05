"use client";
import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { AvatarImage } from "./avatar-image";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { MusicPicker } from "./music-picker";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "./ui/dialog";
import { toast } from "sonner";
import { X, Music as MusicIcon, FileText, ImagePlus } from "lucide-react";
import type { SpotifyTrack } from "@/lib/spotify.functions";

export function PostComposer() {
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [track, setTrack] = useState<SpotifyTrack | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [showMusic, setShowMusic] = useState(false);
  const [showFeeling, setShowFeeling] = useState(false);
  const [feeling, setFeeling] = useState("");
  const [activeTab, setActiveTab] = useState<"post" | "story" | "room">("post");

  async function addFiles(filesList: FileList | null) {
    if (!filesList) return;
    const arr = Array.from(filesList).slice(0, 6 - files.length);
    setFiles((f) => [...f, ...arr]);
  }

  async function publish() {
    if (!user) return toast.info("Sign in to post");
    if (!text && files.length === 0 && !track && !feeling) return toast.info("Write something or add media.");
    setPublishing(true);
    try {
      const captionText = [feeling.trim(), text.trim()].filter(Boolean).join(" · ");

      let currentFiles = [...files];
      const audioIndex = currentFiles.findIndex((f) => f.type.startsWith("audio/"));
      let audioUrl: string | null = track?.preview_url ?? null;
      let audioTitle: string | null = track?.title ?? null;
      let audioArtist: string | null = track?.artist ?? null;
      let audioArtwork: string | null = track?.artwork_url ?? null;

      if (audioIndex !== -1) {
        const audioFile = currentFiles[audioIndex];
        const path = `${user.id}/audio/${crypto.randomUUID()}-${audioFile.name}`;
        const { error: upErr } = await supabase.storage.from('media').upload(path, audioFile, { contentType: audioFile.type });
        if (upErr) throw upErr;
        const { data: publicData, error: publicErr } = supabase.storage.from('media').getPublicUrl(path);
        if (publicErr) throw publicErr;
        const publicUrl = publicData?.publicUrl;
        if (!publicUrl) throw new Error('Could not generate audio preview URL');
        audioUrl = publicUrl;
        audioTitle = audioFile.name.replace(/\.[^.]+$/, '');
        currentFiles = currentFiles.filter((_, i) => i !== audioIndex);
        setFiles((f) => f.filter((_, i) => i !== audioIndex));
      }

      if (activeTab === 'story') {
        if (currentFiles.length === 0) {
          throw new Error('A story requires a photo or video attachment.');
        }
        const storyFile = currentFiles[0];
        const mediaType = storyFile.type.startsWith('video/') ? 'video' : storyFile.type.startsWith('image/') ? 'image' : null;
        if (!mediaType) {
          throw new Error('A story requires a photo or video attachment.');
        }
        const ext = storyFile.name.split('.').pop() || (mediaType === 'video' ? 'mp4' : 'jpg');
        const path = `${user.id}/stories/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('media').upload(path, storyFile, { contentType: storyFile.type });
        if (upErr) throw upErr;

        const storyPayload: Record<string, unknown> = {
          user_id: user.id,
          storage_path: path,
          media_type: storyFile.type.startsWith('video/') ? 'video' : 'image',
          caption: captionText || null,
        };
        if (audioUrl) {
          storyPayload.audio_preview_url = audioUrl;
          storyPayload.audio_title = audioTitle;
          storyPayload.audio_artist = audioArtist;
          storyPayload.audio_artwork_url = audioArtwork;
        }

        let storyResult = await supabase.from('stories').insert(storyPayload);
        if (storyResult.error && audioUrl) {
          storyResult = await supabase.from('stories').insert({
            user_id: user.id,
            storage_path: path,
            media_type: storyFile.type.startsWith('video/') ? 'video' : 'image',
            caption: captionText || null,
          });
        }
        if (storyResult.error) throw storyResult.error;

        toast.success('Story shared — visible for 24 hours');
        setText(''); setFiles([]); setTrack(null); setFeeling('');
        qc.invalidateQueries({ queryKey: ['stories'] });
        return;
      }

      const mediaFiles = currentFiles;
      const postPayload: Record<string, unknown> = {
        user_id: user.id,
        caption: captionText || null,
        comments_enabled: true,
        is_reel: mediaFiles.some((f) => f.type.startsWith('video/')),
        kid_safe: false,
      };
      if (audioUrl) {
        postPayload.audio_preview_url = audioUrl;
        postPayload.audio_title = audioTitle;
        postPayload.audio_artist = audioArtist;
        postPayload.audio_artwork_url = audioArtwork;
      }

      let insertPost = await supabase.from('posts').insert(postPayload).select().single();
      if (insertPost.error && audioUrl) {
        insertPost = await supabase.from('posts').insert({
          user_id: user.id,
          caption: captionText || null,
          comments_enabled: true,
          is_reel: mediaFiles.some((f) => f.type.startsWith('video/')),
          kid_safe: false,
        }).select().single();
      }
      if (insertPost.error || !insertPost.data) throw insertPost.error ?? new Error('Create post failed');
      const post = insertPost.data;

      for (let i = 0; i < mediaFiles.length; i++) {
        const f = mediaFiles[i];
        const ext = f.name.split('.').pop() || 'jpg';
        const path = `${user.id}/${post.id}/${i}-${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('media').upload(path, f, { contentType: f.type });
        if (upErr) throw upErr;
        const { error: mErr } = await supabase.from('post_media').insert({
          post_id: post.id,
          uploader_id: user.id,
          storage_path: path,
          media_type: f.type.startsWith('video/') ? 'video' : 'image',
          width: null,
          height: null,
          thumbnail_path: null,
          position: i,
        });
        if (mErr) throw mErr;
      }

      toast.success('Posted');
      setText(''); setFiles([]); setTrack(null); setFeeling('');
      await qc.invalidateQueries({ queryKey: ['feed'], exact: false });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setPublishing(false);
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <div className="flex items-center gap-3 rounded-full border border-border bg-card px-4 py-3 shadow-sm transition hover:bg-secondary/60 cursor-pointer">
          <AvatarImage path={user?.avatar_url} name={user?.display_name ?? user?.username} size={40} />
          <span className="text-sm text-muted-foreground">What's on your mind?</span>
        </div>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl">{activeTab === 'post' ? 'Create post' : activeTab === 'story' ? 'Add story' : 'Start room'}</DialogTitle>
          <DialogDescription>
            {activeTab === 'post'
              ? 'Share a photo, video, text, or music clip with your friends.'
              : activeTab === 'story'
              ? 'Capture a moment for your story — it will stay visible for a limited time.'
              : 'Create a room to chat, share ideas, and play music together.'}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <button
              type="button"
              onClick={() => setActiveTab("post")}
              className={`rounded-full px-4 py-2 ${activeTab === "post" ? "bg-blue-500 text-white" : "border border-border bg-background text-muted-foreground hover:bg-secondary/50"}`}
            >Post</button>
            <button
              type="button"
              onClick={() => setActiveTab("story")}
              className={`rounded-full px-4 py-2 ${activeTab === "story" ? "bg-emerald-500 text-white" : "border border-border bg-background text-muted-foreground hover:bg-secondary/50"}`}
            >Story</button>
            <button
              type="button"
              onClick={() => setActiveTab("room")}
              className={`rounded-full px-4 py-2 ${activeTab === "room" ? "bg-violet-500 text-white" : "border border-border bg-background text-muted-foreground hover:bg-secondary/50"}`}
            >Room</button>
          </div>

          {activeTab !== 'room' && (
            <Textarea
              ref={textRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              className="mt-4 bg-background"
              placeholder={
                activeTab === 'story'
                  ? 'Share a quick story...'
                  : "What's on your mind?"
              }
            />
          )}
          {activeTab === 'room' && (
            <div className="mt-4 rounded-3xl border border-border bg-secondary/50 p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Room details</p>
              <p className="mt-2">Start a live room for friends to join and talk. Share your current mood, topic, or music to set the tone.</p>
              <Textarea
                ref={textRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                className="mt-4 bg-background"
                placeholder="What should people talk about?"
              />
            </div>
          )}
          {showFeeling && (
            <div className="mt-3 rounded-2xl border border-border bg-background px-4 py-3">
              <div className="text-sm font-medium">Feeling / Activity</div>
              <input
                type="text"
                value={feeling}
                onChange={(e) => setFeeling(e.target.value)}
                placeholder="Feeling happy, watching a movie, etc."
                className="mt-2 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          )}

          {files.length > 0 && (
            <div className="mt-4 grid grid-cols-4 gap-3">
              {files.map((f, i) => (
                <div key={i} className="relative aspect-square overflow-hidden rounded-2xl bg-muted">
                  {f.type.startsWith('video/') ? (
                    <video src={URL.createObjectURL(f)} className="h-full w-full object-cover" muted playsInline />
                  ) : (
                    <img src={URL.createObjectURL(f)} alt="" className="h-full w-full object-cover" />
                  )}
                  <button onClick={() => setFiles(files.filter((_, j) => j !== i))} className="absolute right-2 top-2 rounded-full bg-background/90 p-1 hover:bg-background"><X className="h-3 w-3" /></button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 rounded-3xl border border-border bg-background p-4">
            <div className="flex items-center justify-between gap-4 mb-4 text-sm text-muted-foreground">
              <div>
                <div className="font-medium">Add music</div>
                <div className="text-xs text-muted-foreground">Attach a Spotify preview clip to your post.</div>
              </div>
              <button onClick={() => setShowMusic((s) => !s)} className="rounded-full border border-border px-4 py-2 text-sm hover:bg-secondary/50">
                {showMusic ? 'Hide' : 'Show'} music
              </button>
            </div>
            {(showMusic || track) && <MusicPicker value={track} onChange={setTrack} />}
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <label className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm text-muted-foreground hover:bg-secondary/50 cursor-pointer">
              <ImagePlus className="h-4 w-4" />
              Add photo/video
              <input type="file" multiple accept="image/*,video/*,audio/*" className="sr-only" onChange={(e) => addFiles(e.target.files)} />
            </label>
            <button type="button" onClick={() => setShowMusic((s) => !s)} className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm text-muted-foreground hover:bg-secondary/50">
              <MusicIcon className="h-4 w-4" />
              {showMusic ? 'Hide music' : 'Add music'}
            </button>
            <button type="button" onClick={() => setShowFeeling((s) => !s)} className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm text-muted-foreground hover:bg-secondary/50">
              <FileText className="h-4 w-4" />
              {showFeeling ? 'Hide feeling' : 'Feeling/Activity'}
            </button>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <DialogClose asChild>
              <button className="rounded-full border border-border bg-background px-4 py-2 text-sm text-muted-foreground hover:bg-secondary/50">Cancel</button>
            </DialogClose>
            <Button onClick={publish} disabled={publishing}>{publishing ? 'Posting…' : 'Post'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
