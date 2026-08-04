import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { toast } from "sonner";
import { Coffee } from "lucide-react";

const PRESETS = [100, 300, 500, 1000];

export function TipButton({
  recipientId,
  recipientName,
  postId,
  variant = "icon",
  className = "",
}: {
  recipientId: string;
  recipientName: string;
  postId?: string;
  variant?: "icon" | "button";
  className?: string;
}) {
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(300);
  const [note, setNote] = useState("");

  const send = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sign in to tip");
      const { error } = await supabase.from("tips").insert({
        sender_id: user.id,
        recipient_id: recipientId,
        post_id: postId ?? null,
        amount_cents: amount,
        note: note || null,
      });
      if (error) throw error;
      await supabase.from("notifications").insert({
        user_id: recipientId,
        actor_id: user.id,
        type: "tip",
        data: { amount_cents: amount, ...(postId ? { post_id: postId } : {}) },
      });
    },
    onSuccess: () => {
      toast.success(`Tip sent to ${recipientName}`);
      setOpen(false);
      setNote("");
      qc.invalidateQueries({ queryKey: ["tips"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Tip failed"),
  });

  const isSelf = user?.id === recipientId;
  if (isSelf) return null;

  return (
    <>
      {variant === "icon" ? (
        <button
          onClick={() => (user ? setOpen(true) : toast.info("Sign in to tip"))}
          aria-label="Tip creator"
          className={`flex items-center justify-center gap-2 rounded-lg py-2 text-sm transition-colors hover:bg-secondary/60 hover:text-foreground ${className}`}
        >
          <Coffee className="h-5 w-5" />
        </button>
      ) : (
        <Button variant="outline" className={className} onClick={() => (user ? setOpen(true) : toast.info("Sign in to tip"))}>
          <Coffee className="mr-2 h-4 w-4" /> Tip creator
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Tip {recipientName}</DialogTitle>
            <DialogDescription>Send a small thank-you for this work.</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-4 gap-2">
            {PRESETS.map((cents) => (
              <button
                key={cents}
                onClick={() => setAmount(cents)}
                className={`rounded-xl border px-2 py-3 text-sm font-medium transition-colors ${
                  amount === cents ? "border-foreground bg-secondary" : "border-border hover:bg-secondary/50"
                }`}
              >
                ${(cents / 100).toFixed(2)}
              </button>
            ))}
          </div>

          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note (optional)" maxLength={200} />

          <Button onClick={() => send.mutate()} disabled={send.isPending}>
            {send.isPending ? "Sending…" : `Send $${(amount / 100).toFixed(2)}`}
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">Tips are recorded on your account and settled with the creator.</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
