import exifr from "exifr";

export interface ExifSummary {
  camera?: string;
  lens?: string;
  iso?: number;
  shutter?: string;
  aperture?: string;
  focal?: string;
  taken?: string;
}

function formatShutter(exposure: unknown): string | undefined {
  const value = typeof exposure === "number" ? exposure : undefined;
  if (!value) return undefined;
  if (value >= 1) return `${Number(value.toFixed(1))}s`;
  return `1/${Math.round(1 / value)}s`;
}

/** Read camera metadata out of an image file. Returns null when nothing useful exists. */
export async function extractExif(file: File): Promise<ExifSummary | null> {
  if (!file.type.startsWith("image/")) return null;
  try {
    const raw = await exifr.parse(file, {
      pick: [
        "Make",
        "Model",
        "LensModel",
        "ISO",
        "ISOSpeedRatings",
        "ExposureTime",
        "FNumber",
        "FocalLength",
        "DateTimeOriginal",
      ],
    });
    if (!raw) return null;

    const camera = [raw.Make, raw.Model].filter(Boolean).join(" ").trim();
    const iso = raw.ISO ?? raw.ISOSpeedRatings;
    const summary: ExifSummary = {
      ...(camera ? { camera } : {}),
      ...(raw.LensModel ? { lens: String(raw.LensModel) } : {}),
      ...(typeof iso === "number" ? { iso } : {}),
      ...(formatShutter(raw.ExposureTime) ? { shutter: formatShutter(raw.ExposureTime) } : {}),
      ...(typeof raw.FNumber === "number" ? { aperture: `f/${Number(raw.FNumber.toFixed(1))}` } : {}),
      ...(typeof raw.FocalLength === "number" ? { focal: `${Math.round(raw.FocalLength)}mm` } : {}),
      ...(raw.DateTimeOriginal ? { taken: new Date(raw.DateTimeOriginal).toISOString() } : {}),
    };
    return Object.keys(summary).length > 0 ? summary : null;
  } catch {
    return null;
  }
}

/** Natural pixel dimensions of an image or video file, used to preserve aspect ratio. */
export async function readDimensions(file: File): Promise<{ width: number; height: number } | null> {
  const url = URL.createObjectURL(file);
  try {
    if (file.type.startsWith("image/")) {
      return await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => resolve(null);
        img.src = url;
      });
    }
    if (file.type.startsWith("video/")) {
      return await new Promise((resolve) => {
        const v = document.createElement("video");
        v.preload = "metadata";
        v.onloadedmetadata = () => resolve({ width: v.videoWidth, height: v.videoHeight });
        v.onerror = () => resolve(null);
        v.src = url;
      });
    }
    return null;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}
