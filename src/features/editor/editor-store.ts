import { create } from 'zustand';
import { commit, redo, startHistory, undo, type EditorHistory } from '@/core/history';
import type { Command } from '@/core/commands';
import type { Project } from '@/core/schema';
import { projects } from '@/app/services';
import { SaveConflictError } from '@/services/storage/project-repository';

type EditorState = {
  history: EditorHistory | null;
  revision: number;
  saveStatus: 'saved' | 'saving' | 'error';
  error: string | null;
  conflict: boolean;
  session: number;
  open: (project: Project) => void;
  execute: (command: Command) => void;
  undo: () => void;
  redo: () => void;
  retrySave: () => void;
};

const pendingSaves = new Set<Promise<void>>();

async function persist(document: Project, revision: number, session: number) {
  try {
    await projects.save(document);
    const state = useEditorStore.getState();
    if (
      state.session === session &&
      state.history?.document.id === document.id &&
      state.revision === revision
    )
      useEditorStore.setState({ saveStatus: 'saved', error: null });
  } catch (error) {
    const state = useEditorStore.getState();
    if (
      state.session === session &&
      state.history?.document.id === document.id &&
      state.revision === revision
    )
      useEditorStore.setState({
        saveStatus: 'error',
        conflict: error instanceof SaveConflictError,
        error: error instanceof Error ? error.message : 'Could not save your project.',
      });
  }
}

function scheduleSave(document: Project, revision: number, session: number) {
  const task = persist(document, revision, session);
  pendingSaves.add(task);
  void task.finally(() => pendingSaves.delete(task));
}

function updateHistory(transform: (history: EditorHistory) => EditorHistory) {
  const state = useEditorStore.getState();
  if (!state.history || state.conflict) return;
  const history = transform(state.history);
  if (history === state.history) return;
  const revision = state.revision + 1;
  useEditorStore.setState({ history, revision, saveStatus: 'saving', error: null });
  scheduleSave(history.document, revision, state.session);
}

export const useEditorStore = create<EditorState>((set, get) => ({
  history: null,
  revision: 0,
  saveStatus: 'saved',
  error: null,
  conflict: false,
  session: 0,
  open: (project) =>
    set((state) => ({
      history: startHistory(project),
      session: state.session + 1,
      revision: 0,
      saveStatus: 'saved',
      error: null,
      conflict: false,
    })),
  execute: (command) => updateHistory((history) => commit(history, command)),
  undo: () => updateHistory(undo),
  redo: () => updateHistory(redo),
  retrySave: () => {
    const state = get();
    if (!state.history || state.conflict) return;
    set({ saveStatus: 'saving', error: null });
    scheduleSave(state.history.document, state.revision, state.session);
  },
}));

export async function flushEditor(): Promise<void> {
  const initial = useEditorStore.getState();
  if (initial.saveStatus === 'error' && !initial.conflict) initial.retrySave();
  while (pendingSaves.size) await Promise.all([...pendingSaves]);
  await projects.flush();
  const state = useEditorStore.getState();
  if (state.saveStatus === 'error') throw new Error(state.error ?? 'Could not save your project.');
}
