import { describe, expect, it } from 'vitest';
import { applyCommand } from './commands';
import { createSampleProject, getPlacements } from './project';
import { commit, redo, startHistory, undo } from './history';
import { parseProject, POOL_ID } from './schema';

describe('document editing', () => {
  it('runs the test suite in the Bun runtime', () => {
    expect(process.versions.bun).toBeTruthy();
  });

  it('moves an item across tiers exactly once and undoes the whole edit', () => {
    const project = createSampleProject();
    const item = project.tiers[0].itemIds[0];
    const changed = commit(startHistory(project), {
      type: 'move-item',
      id: item,
      target: project.tiers[1].id,
      index: 1,
    });
    expect(changed.document.tiers[0].itemIds).not.toContain(item);
    expect(changed.document.tiers[1].itemIds[1]).toBe(item);
    expect(
      Object.values(getPlacements(changed.document))
        .flat()
        .filter((id) => id === item),
    ).toHaveLength(1);
    const restored = undo(changed);
    expect(getPlacements(restored.document)).toEqual(getPlacements(project));
    expect(getPlacements(redo(restored).document)).toEqual(getPlacements(changed.document));
    expect(project.tiers[0].itemIds[0]).toBe(item);
  });

  it('deleting a tier preserves its items, and undo restores their order', () => {
    const project = createSampleProject();
    const changed = commit(startHistory(project), { type: 'remove-tier', id: project.tiers[1].id });
    expect(changed.document.unranked).toEqual([...project.unranked, ...project.tiers[1].itemIds]);
    expect(changed.document.items).toEqual(project.items);
    expect(undo(changed).document.tiers).toEqual(project.tiers);
  });

  it('keeps a drag placement transaction as one undo step and clears redo on a new edit', () => {
    const project = createSampleProject();
    const placements = structuredClone(getPlacements(project));
    placements[project.tiers[0].id].push(placements[POOL_ID].shift()!);
    const changed = commit(startHistory(project), { type: 'place-items', placements });
    expect(changed.past).toHaveLength(1);
    const undone = undo(changed);
    expect(undone.future).toHaveLength(1);
    expect(commit(undone, { type: 'rename', title: 'Another opinion' }).future).toHaveLength(0);
  });

  it('rejects duplicate placements and keeps the input document untouched', () => {
    const project = createSampleProject();
    const placements = structuredClone(getPlacements(project));
    placements[POOL_ID].push(project.tiers[0].itemIds[0]);
    expect(() => applyCommand(project, { type: 'place-items', placements })).toThrow(
      /exactly once/,
    );
    expect(() => parseProject(project)).not.toThrow();
  });

  it('does not create history for an unchanged drag', () => {
    const history = startHistory(createSampleProject());
    expect(
      commit(history, { type: 'place-items', placements: getPlacements(history.document) }),
    ).toBe(history);
  });

  it('changes project-wide item shapes with undo/redo without changing placements', () => {
    const project = createSampleProject();
    const changed = commit(startHistory(project), { type: 'set-item-shape', shape: 'circle' });
    expect(changed.document.itemShape).toBe('circle');
    expect(getPlacements(changed.document)).toEqual(getPlacements(project));
    expect(undo(changed).document.itemShape).toBe('square');
    expect(redo(undo(changed)).document.itemShape).toBe('circle');
    expect(commit(changed, { type: 'set-item-shape', shape: 'circle' })).toBe(changed);
  });

  it('opens older projects without a shape and rejects unknown shapes', () => {
    const project = createSampleProject();
    delete project.itemShape;
    expect(parseProject(project).itemShape ?? 'square').toBe('square');
    expect(() => parseProject({ ...project, itemShape: 'triangle' })).toThrow(/itemShape/);
  });

  it('rejects unknown format versions, orphan items, and duplicate tier IDs', () => {
    const project = createSampleProject();
    expect(() => parseProject({ ...project, version: 2 })).toThrow(/version/);
    expect(() => parseProject({ ...project, unranked: [] })).toThrow(/exactly once/);
    expect(() => parseProject({ ...project, tiers: [project.tiers[0], project.tiers[0]] })).toThrow(
      /unique/,
    );
  });
});
