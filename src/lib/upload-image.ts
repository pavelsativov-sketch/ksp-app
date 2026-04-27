/**
 * Client helper: upload a file to /api/upload/image and return its public URL.
 * Use as the `onUploadImage` prop of <RichTextEditor>.
 */
export async function uploadPlanImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/upload/image", { method: "POST", body: fd });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || `HTTP ${res.status}`);
  }
  const { url } = (await res.json()) as { url: string };
  return url;
}
