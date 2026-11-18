export const REMOTE_SCREEN_WIDTH = 1280;
export const REMOTE_SCREEN_HEIGHT = 800;

export interface ViewportRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface RemoteBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Converts pointer coordinates on an `object-fit: contain` image element
 * to pixel coordinates on the remote 1280x800 browser viewport.
 */
export function clientPointToRemote(input: {
  clientX: number;
  clientY: number;
  rect: ViewportRect;
  remoteW?: number;
  remoteH?: number;
}): { x: number; y: number; localX: number; localY: number } | null {
  const remoteW = input.remoteW ?? REMOTE_SCREEN_WIDTH;
  const remoteH = input.remoteH ?? REMOTE_SCREEN_HEIGHT;
  const { clientX, clientY, rect } = input;
  if (rect.width <= 0 || rect.height <= 0 || remoteW <= 0 || remoteH <= 0) {
    return null;
  }

  const fitScale = Math.min(rect.width / remoteW, rect.height / remoteH);
  const renderedW = remoteW * fitScale;
  const renderedH = remoteH * fitScale;
  const offsetX = (rect.width - renderedW) / 2;
  const offsetY = (rect.height - renderedH) / 2;

  const rawX = (clientX - rect.left - offsetX) / fitScale;
  const rawY = (clientY - rect.top - offsetY) / fitScale;
  if (rawX < 0 || rawY < 0 || rawX >= remoteW || rawY >= remoteH) {
    return null;
  }

  return {
    x: Math.round(rawX),
    y: Math.round(rawY),
    localX: clientX - rect.left,
    localY: clientY - rect.top,
  };
}

/**
 * Converts an active field bounding box from remote 1280x800 viewport space
 * to overlay CSS coordinates over an `object-fit: contain` container.
 */
export function remoteBoxToOverlay(input: {
  box: RemoteBox;
  containerW: number;
  containerH: number;
  remoteW?: number;
  remoteH?: number;
}): { left: number; top: number; width: number; height: number } | null {
  const remoteW = input.remoteW ?? REMOTE_SCREEN_WIDTH;
  const remoteH = input.remoteH ?? REMOTE_SCREEN_HEIGHT;
  const { box, containerW, containerH } = input;
  if (
    containerW <= 0 ||
    containerH <= 0 ||
    remoteW <= 0 ||
    remoteH <= 0 ||
    box.width <= 0 ||
    box.height <= 0
  ) {
    return null;
  }

  const fitScale = Math.min(containerW / remoteW, containerH / remoteH);
  const renderedW = remoteW * fitScale;
  const renderedH = remoteH * fitScale;
  const offsetX = (containerW - renderedW) / 2;
  const offsetY = (containerH - renderedH) / 2;

  return {
    left: Math.round(offsetX + box.x * fitScale),
    top: Math.round(offsetY + box.y * fitScale),
    width: Math.max(80, Math.round(box.width * fitScale)),
    height: Math.max(26, Math.round(box.height * fitScale)),
  };
}
