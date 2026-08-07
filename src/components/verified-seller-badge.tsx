import { BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/** Small pill shown on listings and seller profiles. */
export function VerifiedSellerBadge({ verified, className, compact }: { verified?: boolean; className?: string; compact?: boolean }) {
  if (!verified) return null;
  if (compact) return <BadgeCheck className={cn("h-3.5 w-3.5 text-sky-500", className)} aria-label="Verified seller" />;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-600 dark:text-sky-400", className)}>
      <BadgeCheck className="h-3.5 w-3.5" /> Verified seller
    </span>
  );
}
