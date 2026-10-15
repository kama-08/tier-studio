export type OpenedFile = { name: string; bytes: Uint8Array };
export interface FileService {
  openProject(): Promise<OpenedFile | null>;
  saveFile(name: string, bytes: Uint8Array, kind: 'project' | 'image'): Promise<boolean>;
}
