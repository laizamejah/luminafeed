import { AvatarImage } from "@/components/avatar-image";
import { cn } from "@/lib/utils";

/**
 * Avatar with a solid BLACK active-status dot (Lumina's custom tweak on
 * Messenger's green dot), or a "4m"-style last-active badge.
 */
export function PresenceAvatar({
  path,
  name,
  size = 56,
  active,
  label,
  className,
}: {
  path?: string | null;
  name?: string | null;
  size?: number;
  active?: boolean;
  label?: string;
  className?: string;
}) {
  const dot = Math.max(10, Math.round(size * 0.24));
  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <AvatarImage path={path} name={name} size={size} />
      {active && (
        <span
          className="absolute bottom-0 right-0 rounded-full bg-foreground ring-2 ring-background"
          style={{ width: dot, height: dot }}
          aria-label="Active now"
        />
      )}
      {!active && label && (
        <span className="absolute -bottom-0.5 -right-1 rounded-full bg-secondary px-1.5 py-px text-[10px] font-semibold leading-tight text-muted-foreground ring-2 ring-background">
          {label}
        </span>
      )}
    </div>
  );
}
