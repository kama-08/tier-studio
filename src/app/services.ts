import { TierDatabase } from '@/services/storage/database';
import { ProjectRepository } from '@/services/storage/project-repository';
import type { FileService } from '@/platform/types';

export const projects = new ProjectRepository(new TierDatabase());
export const isDesktop = '__TAURI_INTERNALS__' in window;

export async function getFiles(): Promise<FileService> {
  if (isDesktop) return (await import('@/platform/tauri')).desktopFiles;
  return (await import('@/platform/web')).webFiles;
}
