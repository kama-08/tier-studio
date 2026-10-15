import { applyPatches, type Patch } from 'immer';
import { applyCommand, type Command } from './commands';
import type { Project } from './schema';

type HistoryEntry = { patches: Patch[]; inversePatches: Patch[] };
export type EditorHistory = { document: Project; past: HistoryEntry[]; future: HistoryEntry[] };

export function startHistory(document: Project): EditorHistory {
  return { document, past: [], future: [] };
}

export function commit(history: EditorHistory, command: Command): EditorHistory {
  const result = applyCommand(history.document, command);
  if (!result.patches.length) return history;
  return {
    document: { ...result.document, updatedAt: Date.now() },
    past: [
      ...history.past.slice(-99),
      { patches: result.patches, inversePatches: result.inversePatches },
    ],
    future: [],
  };
}

export function undo(history: EditorHistory): EditorHistory {
  const entry = history.past.at(-1);
  if (!entry) return history;
  return {
    document: { ...applyPatches(history.document, entry.inversePatches), updatedAt: Date.now() },
    past: history.past.slice(0, -1),
    future: [...history.future, entry],
  };
}

export function redo(history: EditorHistory): EditorHistory {
  const entry = history.future.at(-1);
  if (!entry) return history;
  return {
    document: { ...applyPatches(history.document, entry.patches), updatedAt: Date.now() },
    past: [...history.past, entry],
    future: history.future.slice(0, -1),
  };
}
