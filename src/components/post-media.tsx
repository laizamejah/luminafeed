import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Play, Volume2, VolumeX } from "lucide-react";
import { useSignedUrl } from "@/hooks/use-signed-url";
import { cn } from "@/lib/utils";

interface PostMediaProps {
  path: string;
  type: "image" | "video";
  width?: number | null;
  height?: number | null;
  thumbnailPath?: string | null;
  className?: string;
  autoplayOnView?: boolean;
  initialMuted?: boolean;
  preload?: "none" | "metadata" | "auto";
  unloadOnExit?: boolean;
  showMuteButton?: boolean;
  /** Fill the parent container instead of using an intrinsic aspect ratio. */
  fill?: boolean;
  objectFit?: "cover" | "contain";
  tapToPause?: boolean;
}

export function PostMedia({
  path,
  type,
  width,
  height,
  thumbnailPath,
  className,
  autoplayOnView = false,
  initialMuted = true,
  preload = "auto",
  unloadOnExit = false,
  showMuteButton = true,
  fill = false,
  objectFit = "cover",
  tapToPause = false,
}: PostMediaProps) {

  const shellRef = useRef<HTMLDivElement | null>(null);
  const [shouldLoadVideo, setShouldLoadVideo] = useState(type !== "video");
  const [isInView, setIsInView] = useState(type !== "video");
  const [hasRendered, setHasRendered] = useState(false);
  const { data: url, isLoading } = useSignedUrl("media", type === "video" && !shouldLoadVideo ? null : path);
  const { data: posterUrl } = useSignedUrl("media", thumbnailPath);
  const [loaded, setLoaded] = useState(false);
  const [muted, setMuted] = useState(initialMuted);
  const [manuallyPaused, setManuallyPaused] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Clamp aspect ratio so very tall portraits don't dominate the feed (Facebook-style).
  const rawAr = width && height ? width / height : 4 / 5;
  const clampedAr = Math.max(rawAr, 3 / 4); // never taller than 4:3
  const aspect = `${clampedAr}`;

  useEffect(() => {
    setLoaded(false);
    setMuted(initialMuted);
    setShouldLoadVideo(type !== "video");
    setIsInView(type !== "video");
    setManuallyPaused(false);
  }, [path, type, initialMuted]);

  useEffect(() => {
    if (type !== "video" || !shellRef.current) return;
    const shell = shellRef.current;
    const io = new IntersectionObserver(
      ([entry]) => {
        const active = entry.isIntersecting && entry.intersectionRatio > 0.2;
        setIsInView(active);
        if (active) {
          setShouldLoadVideo(true);
        } else {
          const el = videoRef.current;
          if (el) {
            el.pause();
            if (unloadOnExit) {
              el.removeAttribute("src");
              el.load();
            }
          }
          if (unloadOnExit) {
            setLoaded(false);
            setShouldLoadVideo(false);
          }
        }
      },
      { rootMargin: "600px 0px 600px 0px", threshold: [0, 0.2, 0.5, 1] },
    );
    io.observe(shell);
    return () => io.disconnect();
  }, [type, unloadOnExit]);

  useEffect(() => {
    if (!autoplayOnView || type !== "video" || !url || !isInView || manuallyPaused) return;
    const el = videoRef.current;
    if (!el) return;
    el.muted = muted;
    el.play().catch(() => {
      /* browser blocked */
    });
  }, [autoplayOnView, isInView, muted, type, url, manuallyPaused]);

  useEffect(() => {
    if (type !== "video") return;
    setHasRendered(true);
    return () => {
      const el = videoRef.current;
      if (el) {
        el.pause();
        el.removeAttribute("src");
        el.load();
      }
    };
  }, [type]);

  function toggleMute(e: MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    const el = videoRef.current;
    if (!el) return;
    const next = !el.muted;
    el.muted = next;
    setMuted(next);
    if (!next) el.play().catch(() => {});
  }

  const fitClass = objectFit === "contain" ? "object-contain" : "object-cover";

  return (
    <div
      ref={shellRef}
      className={cn(
        "relative mx-auto w-full max-w-full overflow-hidden bg-black/90 will-change-transform",
        fill ? "h-full rounded-none" : "rounded-[1.25rem]",
        className,
      )}
      style={fill ? { contain: "layout paint" } : { aspectRatio: aspect, maxHeight: "70vh", contain: "layout paint" }}
    >
      {(isLoading || (!loaded && type !== "video")) && <div className="absolute inset-0 animate-pulse bg-muted" />}
      {url && type === "image" && (
        <img
          src={url}
          alt=""
          onLoad={() => setLoaded(true)}
          className={cn("h-full w-full transition-opacity duration-500", fitClass, loaded ? "opacity-100" : "opacity-0")}
        />
      )}
      {type === "video" && (
        <>
          <video
            ref={videoRef}
            onClick={tapToPause ? (e) => {
              e.stopPropagation();
              const video = videoRef.current;
              if (!video) return;
              if (video.paused) { setManuallyPaused(false); video.play().catch(() => {}); }
              else { video.pause(); setManuallyPaused(true); }
            } : undefined}
            src={shouldLoadVideo ? (url ?? undefined) : undefined}
            poster={posterUrl}
            muted={muted}
            loop
            playsInline
            preload={shouldLoadVideo ? preload : "none"}
            controls={!autoplayOnView}
            onLoadedData={() => setLoaded(true)}
            onCanPlay={() => {
              if (autoplayOnView && isInView && !manuallyPaused) videoRef.current?.play().catch(() => {});
            }}
            className={cn("h-full w-full transition-opacity duration-300", tapToPause && "cursor-pointer", fitClass, hasRendered ? "opacity-100" : "opacity-0")}
          />
          {tapToPause && manuallyPaused && <Play className="pointer-events-none absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 text-foreground drop-shadow-lg" fill="currentColor" aria-hidden="true" />}

          {!posterUrl && !loaded && <div className="pointer-events-none absolute inset-0 animate-pulse bg-muted" />}
          {autoplayOnView && showMuteButton && url && (
            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? "Unmute" : "Mute"}
              className="absolute bottom-3 right-3 z-10 grid h-10 w-10 place-items-center rounded-full bg-black/60 text-white backdrop-blur hover:bg-black/80 transition-colors"
            >
              {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </button>
          )}
        </>
      )}
    </div>
  );
}
