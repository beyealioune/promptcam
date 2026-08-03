import { readFile, writeFile } from 'node:fs/promises';

// Capacitor CLI peut générer des antislashs Windows invalides dans Package.swift.
const packageFile = new URL('../ios/App/CapApp-SPM/Package.swift', import.meta.url);
const source = await readFile(packageFile, 'utf8');
await writeFile(packageFile, source.replaceAll('\\', '/'), 'utf8');
