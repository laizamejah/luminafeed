import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { toast } from "sonner";

/** Floating "Drop a thought…" status bubble that sits above the profile avatar. */
export function ProfileThoughtBubble({ userId, editable }: { userId: string; editable: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  const { data: note } = useQuery({
    queryKey: ["profile-note", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_notes")
        .select("id, content, created_at")
        .eq("user_id", userId)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  if (!note && !editable) return null;

  async function save() {
    const content = text.trim();
    if (!content) return;
    const { error } = await supabase.from("user_notes").insert({ user_id: userId, content });
    if (error) return toast.error(error.message);
    setText("");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["profile-note", userId] });
    toast.success("Thought posted");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => editable && setOpen(true)}
        disabled={!editable}
        className="liquid-glass relative max-w-[14rem] truncate rounded-2xl px-3 py-1.5 text-xs shadow-md disabled:cursor-default"
      >
        {note?.content ?? "Drop a thought…"}
        <span className="absolute -bottom-1 left-6 h-2.5 w-2.5 rotate-45 rounded-[2px] bg-background/80 backdrop-blur" />
      </button>

      {open && (
        <Dialog open onOpenChange={(o) => !o && setOpen(false)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Drop a thought</DialogTitle></DialogHeader>
            <Input
              autoFocus
              maxLength={120}
              value={text}
              placeholder="What's on your mind?"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
            />
            <p className="text-xs text-muted-foreground">Disappears after 24 hours.</p>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save}>Share</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
