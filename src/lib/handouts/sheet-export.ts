/** Сохраняет страницы листа картинками: одна страница как PNG, несколько одним архивом. */
export async function downloadSheetImages(root: HTMLElement, baseName: string): Promise<void> {
  const { toBlob } = await import("html-to-image");
  const pages = [...root.querySelectorAll<HTMLElement>("[data-sheet-page]")];
  if (pages.length === 0) throw new Error("На экране нет страниц листа");
  const blobs: Blob[] = [];
  for (const page of pages) {
    const blob = await toBlob(page, {
      pixelRatio: 2,
      backgroundColor: "#ffffff",
      filter: (node) => !(node instanceof Element && node.hasAttribute("data-no-capture")),
    });
    if (!blob) throw new Error("Браузер не смог сохранить картинку");
    blobs.push(blob);
  }
  if (blobs.length === 1) {
    saveBlob(blobs[0]!, `${baseName}.png`);
    return;
  }
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  blobs.forEach((blob, i) => zip.file(`${baseName} - стр ${i + 1}.png`, blob));
  saveBlob(await zip.generateAsync({ type: "blob" }), `${baseName}.zip`);
}

function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
