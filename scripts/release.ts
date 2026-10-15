import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { WINDOWS_INSTALLER_ASSET } from '../src/app/distribution';

const root = resolve(import.meta.dir, '..');
const command = process.argv[2];
const tag = process.env.RELEASE_TAG ?? process.argv[3];
if (!['validate', 'prepare'].includes(command) || !tag || !/^v\d+\.\d+\.\d+$/.test(tag)) {
  throw new Error('Usage: bun scripts/release.ts <validate|prepare> vX.Y.Z');
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
  await Bun.write(resolve(artifacts, WINDOWS_INSTALLER_ASSET), installer);
  const checksum = new Bun.CryptoHasher('sha256').update(installer).digest('hex');
  await Bun.write(
    resolve(artifacts, 'SHA256SUMS.txt'),
    `${checksum}  ${WINDOWS_INSTALLER_ASSET}\n`,
  );
  console.log(
    `Prepared ${WINDOWS_INSTALLER_ASSET} (${installer.length} bytes), SHA-256 ${checksum}`,
  );
}
