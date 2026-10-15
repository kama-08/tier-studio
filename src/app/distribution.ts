export const DEFAULT_PUBLIC_REPOSITORY_URL = 'https://github.com/kama-08/tier-studio';
export const WINDOWS_INSTALLER_ASSET = 'Tier-Studio-windows-x64-setup.exe';

export function getPublicRepositoryLinks(value: string = DEFAULT_PUBLIC_REPOSITORY_URL) {
  const match = value?.trim().match(/^https:\/\/github\.com\/([a-z\d-]+)\/([a-z\d_.-]+)\/?$/i);
  if (!match || ['.', '..'].includes(match[2])) return null;
  const repository = `https://github.com/${match[1]}/${match[2]}`;
  return {
    repository,
    releases: `${repository}/releases/latest`,
    windowsInstaller: `${repository}/releases/latest/download/${WINDOWS_INSTALLER_ASSET}`,
  };
}

export const publicRepository = getPublicRepositoryLinks(
  import.meta.env?.VITE_PUBLIC_REPOSITORY_URL,
);
