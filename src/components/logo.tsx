import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("font-serif text-2xl tracking-tight font-bold text-violet-600", className)}>
      Lumina<span className="text-[color:var(--ochre)]">.</span>
    </span>
  );
}
