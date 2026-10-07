import "server-only";

import type { ProposedAction } from "./loop";
import type { SafetyDecision } from "./safety";
import type { ElementProbe } from "./screen";

/** Cross-request confirmation requests for the computer-use agent. */
export interface ConfirmationRequest {
  id: string;
  action: ProposedAction;
  decision: SafetyDecision;
  probe: ElementProbe;
}

interface PendingConfirmation extends ConfirmationRequest {
  userId: string;
  createdAt: number;
  resolve: (allowed: boolean) => void;
}

const TIMEOUT_MS = 120_000;
const pending: PendingConfirmation[] = [];

export function listPending(userId: string): ConfirmationRequest[] {
  return pending
    .filter((entry) => entry.userId === userId)
    .map(({ id, action, decision, probe }) => ({ id, action, decision, probe }));
}

export function resolveConfirmation(userId: string, id: string, allowed: boolean): boolean {
  const pos = pending.findIndex((entry) => entry.userId === userId && entry.id === id);
  if (pos === -1) return false;
  const entry = pending[pos];
  if (!entry) return false;
  pending.splice(pos, 1);
  entry.resolve(allowed);
  return true;
}

export function cancelAll(userId: string): void {
  for (let i = pending.length - 1; i >= 0; i -= 1) {
    const entry = pending[i];
    if (entry?.userId !== userId) continue;
    pending.splice(i, 1);
    entry.resolve(false);
  }
}

export function countPending(userId: string): number {
  return pending.filter((entry) => entry.userId === userId).length;
}

let counter = 0;

export function waitForConfirmation(
  userId: string,
  action: ProposedAction,
  decision: SafetyDecision,
  probe: ElementProbe,
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const entry: PendingConfirmation = {
      id: `${Date.now().toString(36)}-${(counter += 1).toString(36)}`,
      userId,
      action,
      decision,
      probe,
      createdAt: Date.now(),
      resolve: (allowed) => {
        clearTimeout(timer);
        resolve(allowed);
      },
    };
    const timer = setTimeout(() => {
      const pos = pending.indexOf(entry);
      if (pos !== -1) pending.splice(pos, 1);
      resolve(false);
    }, TIMEOUT_MS);
    pending.push(entry);
  });
}
