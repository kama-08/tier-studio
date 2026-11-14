import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { DEFAULT_PUBLIC_REPOSITORY_URL, WINDOWS_INSTALLER_ASSET } from '../src/app/distribution';

const root = resolve(import.meta.dir, '..');
const command = process.argv[2];
const args = process.argv.slice(3);
const signed = args.includes('--signed');
const tag = process.env.RELEASE_TAG ?? args.find((arg) => arg !== '--signed');
if (!['validate', 'prepare'].includes(command) || !tag || !/^v\d+\.\d+\.\d+$/.test(tag)) {
  throw new Error('Usage: bun scripts/release.ts <validate|prepare> vX.Y.Z [--signed]');
}
const version = tag.slice(1);
const versionSchema = z.object({ version: z.string() });
const manifests = [
  ['package.json', await Bun.file(resolve(root, 'package.json')).json()],
  ['src-tauri/tauri.conf.json', await Bun.file(resolve(root, 'src-tauri/tauri.conf.json')).json()],
  [
    'src-tauri/Cargo.toml',
    z
      .object({ package: versionSchema })
      .parse(Bun.TOML.parse(await Bun.file(resolve(root, 'src-tauri/Cargo.toml')).text())).package,
  ],
] as const;
for (const [name, manifest] of manifests) {
  const actual = versionSchema.parse(manifest).version;
  if (actual !== version) throw new Error(`${name} version ${actual} does not match ${tag}`);
}
const notes = Bun.file(resolve(root, `docs/releases/${version}.md`));
if (!(await notes.exists()) || !(await notes.text()).trim()) {
  throw new Error(`Missing release notes: docs/releases/${version}.md`);
}
console.log(`Validated ${tag} against all three manifests and release notes.`);

if (command === 'prepare') {
  const buildRoot = resolve(root, 'src-tauri/target/x86_64-pc-windows-msvc/release');
  const executable = new DataView(
    await Bun.file(resolve(buildRoot, 'tier-studio.exe')).arrayBuffer(),
  );
  if (executable.byteLength < 64 || executable.getUint16(0, true) !== 0x5a4d) {
    throw new Error('The app executable is not a Windows PE binary.');
  }
  const pe = executable.getUint32(0x3c, true);
  if (
    pe + 6 > executable.byteLength ||
    executable.getUint32(pe, true) !== 0x4550 ||
    executable.getUint16(pe + 4, true) !== 0x8664
  ) {
    throw new Error('The app executable must target Windows x64.');
  }
  const bundleRoot = resolve(buildRoot, 'bundle/nsis');
  const installers = Array.from(new Bun.Glob(`*_${version}_x64-setup.exe`).scanSync(bundleRoot));
  if (installers.length !== 1) {
    throw new Error(`Expected one Windows ${version} installer, found ${installers.length}.`);
  }
  const installer = await Bun.file(resolve(bundleRoot, installers[0])).bytes();
  if (installer.length < 64 || installer[0] !== 0x4d || installer[1] !== 0x5a) {
    throw new Error('The installer is not a Windows executable.');
  }
  const artifacts = resolve(root, 'release-artifacts');
  await mkdir(artifacts, { recursive: true });
  const versionedInstaller = `Tier-Studio-${version}-windows-x64-setup.exe`;
  const versionedPath = resolve(artifacts, versionedInstaller);
  await Bun.write(versionedPath, installer);
  // The web download button and README use this stable filename.
  await Bun.write(resolve(artifacts, WINDOWS_INSTALLER_ASSET), installer);
  const checksum = new Bun.CryptoHasher('sha256').update(installer).digest('hex');
  await Bun.write(
    resolve(artifacts, 'SHA256SUMS.txt'),
    `${checksum}  ${versionedInstaller}\n${checksum}  ${WINDOWS_INSTALLER_ASSET}\n`,
  );
  console.log(`Prepared ${versionedInstaller} (${installer.length} bytes), SHA-256 ${checksum}`);

  if (signed) {
    const privateKey = process.env.TAURI_SIGNING_PRIVATE_KEY;
    const publicKey = process.env.TAURI_UPDATE_PUBLIC_KEY?.trim();
    if (!privateKey || !publicKey) {
      throw new Error(
        'Signed releases require TAURI_SIGNING_PRIVATE_KEY and TAURI_UPDATE_PUBLIC_KEY.',
      );
    }
    const result = Bun.spawnSync({
      cmd: [
        'bun',
        './node_modules/@tauri-apps/cli/tauri.js',
        'signer',
        'sign',
        '--app-version',
        version,
        versionedPath,
      ],
      cwd: root,
      stdin: 'ignore',
      stdout: 'ignore',
      stderr: 'ignore',
    });
    if (!result.success)
      throw new Error('Tauri could not sign the installer. Check the signing key and password.');
    const signature = (await Bun.file(`${versionedPath}.sig`).text()).trim();
    const signatureLines = Buffer.from(signature, 'base64').toString('utf8').split(/\r?\n/);
    const publicKeyLines = Buffer.from(publicKey, 'base64').toString('utf8').split(/\r?\n/);
    const key = Buffer.from(publicKeyLines[1] ?? '', 'base64');
    const signedKey = Buffer.from(signatureLines[1] ?? '', 'base64');
    if (
      key.length !== 42 ||
      signedKey.length !== 74 ||
      !key.subarray(2, 10).equals(signedKey.subarray(2, 10))
    ) {
      throw new Error(
        'The configured updater public key does not match the installer signing key.',
      );
    }
    if (!signatureLines[2]?.split('\t').includes(`version:${version}`)) {
      throw new Error('The installer signature is missing the release version.');
    }
    const repo = process.env.GITHUB_REPOSITORY
      ? `https://github.com/${process.env.GITHUB_REPOSITORY}`
      : DEFAULT_PUBLIC_REPOSITORY_URL;
    await Bun.write(
      resolve(artifacts, 'latest.json'),
      JSON.stringify(
        {
          version,
          notes: (await notes.text()).trim(),
          platforms: {
            'windows-x86_64': {
              url: `${repo}/releases/download/${tag}/${versionedInstaller}`,
              signature,
            },
          },
        },
        null,
        2,
      ) + '\n',
    );
    console.log('Prepared the signed Windows update manifest.');
  }
}
