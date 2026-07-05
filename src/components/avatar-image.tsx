import { useSignedUrl } from "@/hooks/use-signed-url";
import { cn } from "@/lib/utils";

export function AvatarImage({ path, name, size = 40, className }: { path?: string | null; name?: string | null; size?: number; className?: string }) {
  const isFullUrl = path?.startsWith("http");
  const { data: signed } = useSignedUrl("avatars", isFullUrl ? null : path);
  const url = isFullUrl ? path : signed;
  const initial = (name ?? "?").slice(0, 1).toUpperCase();
  return (
    <div
      className={cn("relative shrink-0 overflow-hidden rounded-full bg-accent flex items-center justify-center text-xs font-medium text-accent-foreground", className)}
      style={{ width: size, height: size }}
    >
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : initial}
    </div>
  );
}
