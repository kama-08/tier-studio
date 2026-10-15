import { describe, expect, it } from 'vitest';
import { getPublicRepositoryLinks } from './distribution';

describe('public download links', () => {
  it('uses the official public downloads by default and allows forks to disable them', () => {
    expect(getPublicRepositoryLinks(undefined)?.windowsInstaller).toBe(
      'https://github.com/kama-08/tier-studio/releases/latest/download/Tier-Studio-windows-x64-setup.exe',
    );
    expect(getPublicRepositoryLinks('  ')).toBeNull();
  });

  it('links to a configured repository and stable installer without a fixed version', () => {
    expect(getPublicRepositoryLinks(' https://github.com/example/tier-studio/ ')).toEqual({
      repository: 'https://github.com/example/tier-studio',
      releases: 'https://github.com/example/tier-studio/releases/latest',
      windowsInstaller:
        'https://github.com/example/tier-studio/releases/latest/download/Tier-Studio-windows-x64-setup.exe',
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
