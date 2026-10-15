import { describe, expect, it } from 'vitest';
import { getPublicRepositoryLinks } from './distribution';

describe('public download links', () => {
  it('keeps downloads unavailable until a public repository is configured', () => {
    expect(getPublicRepositoryLinks(undefined)).toBeNull();
    expect(getPublicRepositoryLinks('  ')).toBeNull();
  });

  it('links to the repository and latest release without a fixed version or asset name', () => {
    expect(getPublicRepositoryLinks(' https://github.com/example/tier-studio/ ')).toEqual({
      repository: 'https://github.com/example/tier-studio',
      releases: 'https://github.com/example/tier-studio/releases/latest',
    });
  });

  it.each([
    'http://github.com/example/tier-studio',
    'https://github.com.evil.test/example/tier-studio',
    'https://example.test/example/tier-studio',
    'https://user:password@github.com/example/tier-studio',
    'https://github.com/example/tier-studio/releases',
    'https://github.com/example/tier-studio?redirect=elsewhere',
    'https://github.com/example/tier-studio#readme',
    'https://github.com/example/..',
    'javascript:alert(1)',
  ])('does not render external links for an invalid repository URL: %s', (value) => {
    expect(getPublicRepositoryLinks(value)).toBeNull();
  });
});
