export function getPublicRepositoryLinks(value: string | undefined) {
  const match = value?.trim().match(/^https:\/\/github\.com\/([a-z\d-]+)\/([a-z\d_.-]+)\/?$/i);
  if (!match || ['.', '..'].includes(match[2])) return null;
  const repository = `https://github.com/${match[1]}/${match[2]}`;
  return { repository, releases: `${repository}/releases/latest` };
}

// Set this only after the public repository exists. Do not link to the private
// development repository or guess the name of a future release asset.
export const publicRepository = getPublicRepositoryLinks(
  import.meta.env.VITE_PUBLIC_REPOSITORY_URL,
);
