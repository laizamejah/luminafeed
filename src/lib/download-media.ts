import { getSignedUrl } from "@/hooks/use-signed-url";
import { toast } from "sonner";

/** Saves a post's media file to the device (gallery on mobile via share sheet when possible). */
export async function downloadMedia(storagePath: string, filenameBase: string) {
  const id = toast.loading("Downloading…");
  try {
    const url = await getSignedUrl("media", storagePath);
    const res = await fetch(url);
    if (!res.ok) throw new Error("Download failed");
    const blob = await res.blob();
    const ext = storagePath.split(".").pop() || (blob.type.startsWith("video") ? "mp4" : "jpg");
    const name = `${filenameBase}.${ext}`;
    const file = new File([blob], name, { type: blob.type });
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
    if (/iPhone|iPad|Android/i.test(navigator.userAgent) && nav.canShare?.({ files: [file] })) {
      toast.dismiss(id);
      await navigator.share({ files: [file] });
      return;
    }
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 4000);
    toast.success("Saved to downloads", { id });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return toast.dismiss(id);
    toast.error(e instanceof Error ? e.message : "Download failed", { id });
  }
}
