import { BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface VerifiedBadgeProps {
  verified?: boolean | null;
  className?: string;
}

export function VerifiedBadge({ verified, className }: VerifiedBadgeProps) {
  if (!verified) return null;

  return (
    <span className={cn("ml-1 inline-flex items-center align-middle text-sky-500", className)} aria-label="Verified account">
      <BadgeCheck className="h-4 w-4" />
    </span>
  );
}
