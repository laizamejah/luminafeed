import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("font-serif text-2xl font-black text-foreground", className)}>
      Lumina
    </span>
  );
}
