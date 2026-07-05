import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Volume2, VolumeX } from "lucide-react";
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
  preload = "metadata",
  unloadOnExit = true,
  showMuteButton = true,
}: PostMediaProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [shouldLoadVideo, setShouldLoadVideo] = useState(type !== "video");
  const [isInView, setIsInView] = useState(type !== "video");
  const [hasRendered, setHasRendered] = useState(false);
  const { data: url, isLoading } = useSignedUrl("media", type === "video" && !shouldLoadVideo ? null : path);
  const { data: posterUrl } = useSignedUrl("media", thumbnailPath);
  const [loaded, setLoaded] = useState(false);
  const [muted, setMuted] = useState(initialMuted);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const aspect = width && height ? `${width} / ${height}` : "4 / 5";

  useEffect(() => {
    setLoaded(false);
    setMuted(initialMuted);
    setShouldLoadVideo(type !== "video");
    setIsInView(type !== "video");
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
      { rootMargin: "160px 0px 160px 0px", threshold: [0, 0.2, 0.5, 1] },
    );
    io.observe(shell);
    return () => io.disconnect();
  }, [type, unloadOnExit]);

  useEffect(() => {
    if (!autoplayOnView || type !== "video" || !url || !isInView) return;
    const el = videoRef.current;
    if (!el) return;
    el.muted = muted;
    el.play().catch(() => {
      /* browser blocked */
    });
  }, [autoplayOnView, isInView, muted, type, url]);

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

  return (
    <div
      ref={shellRef}
      className={cn("relative w-full overflow-hidden rounded-[1.25rem] bg-muted will-change-transform", className)}
      style={{ aspectRatio: aspect, contain: "layout paint" }}
    >
      {(isLoading || (!loaded && type !== "video")) && <div className="absolute inset-0 animate-pulse bg-muted" />}
      {url && type === "image" && (
        <img
          src={url}
          alt=""
          onLoad={() => setLoaded(true)}
          className={cn("h-full w-full object-cover transition-opacity duration-500", loaded ? "opacity-100" : "opacity-0")}
        />
      )}
      {type === "video" && (
        <>
          <video
            ref={videoRef}
            src={shouldLoadVideo ? (url ?? undefined) : undefined}
            poster={posterUrl}
            muted={muted}
            loop
            playsInline
            preload={shouldLoadVideo ? preload : "none"}
            controls={!autoplayOnView}
            onLoadedData={() => setLoaded(true)}
            onCanPlay={() => {
              if (autoplayOnView && isInView) videoRef.current?.play().catch(() => {});
            }}
            className={cn("h-full w-full object-cover transition-opacity duration-300", hasRendered ? "opacity-100" : "opacity-0")}
          />
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
