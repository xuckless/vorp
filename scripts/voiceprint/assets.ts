// Puts the voiceprint runtime where the web build serves it from (`public/voiceprint/`, which
// Expo copies into dist/): the worker built from src/services/voice-worker.ts, transformers.js's
// self-contained browser build, and ONNX Runtime Web's plain SIMD WASM with its loader, plus
// their licences. Copied from node_modules so the versions always match the installed packages,
// and not committed (see .gitignore). The model files themselves are committed under
// `public/models/`.
//
//   bun run voiceprint:assets      (also run by `bun run web` and `bun run export:web`)

import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { VOICEPRINT_ASSETS } from '@/config/voiceprint';

const root = join(import.meta.dir, '..', '..');
const out = join(root, 'public', VOICEPRINT_ASSETS.runtimeRoot);
mkdirSync(out, { recursive: true });

const require = createRequire(join(root, 'package.json'));
const transformers = dirname(require.resolve('@huggingface/transformers/package.json'));
// onnxruntime-web as transformers.js resolves it: the version its browser build was made for.
const ort = dirname(createRequire(join(transformers, 'package.json')).resolve('onnxruntime-web/package.json'));

const wanted = JSON.parse(readFileSync(join(transformers, 'package.json'), 'utf8')).dependencies['onnxruntime-web'];
const found = JSON.parse(readFileSync(join(ort, 'package.json'), 'utf8')).version;
if (wanted !== found) throw new Error(`transformers.js wants onnxruntime-web ${wanted}, found ${found}`);

const copies: [from: string, to: string][] = [
  [join(transformers, 'dist', VOICEPRINT_ASSETS.library), VOICEPRINT_ASSETS.library],
  [join(transformers, 'LICENSE'), 'transformers.LICENSE.txt'],
  [join(ort, 'dist', VOICEPRINT_ASSETS.wasm.mjs), VOICEPRINT_ASSETS.wasm.mjs],
  [join(ort, 'dist', VOICEPRINT_ASSETS.wasm.wasm), VOICEPRINT_ASSETS.wasm.wasm],
];
for (const [from, to] of copies) {
  if (!existsSync(from)) throw new Error(`missing ${from}`);
  copyFileSync(from, join(out, to));
}

// onnxruntime-web's package carries no licence file; its licence is MIT (package.json).
await Bun.write(
  join(out, 'onnxruntime-web.LICENSE.txt'),
  `onnxruntime-web ${found}: MIT License, Copyright (c) Microsoft Corporation.\nhttps://github.com/microsoft/onnxruntime/blob/main/LICENSE\n`,
);

const built = await Bun.build({
  entrypoints: [join(root, 'src', 'services', 'voice-worker.ts')],
  target: 'browser',
  format: 'esm',
  minify: true,
});
if (!built.success) throw new AggregateError(built.logs, 'worker build failed');
await Bun.write(join(out, VOICEPRINT_ASSETS.worker), built.outputs[0]);

console.log(`voiceprint runtime in ${out} (transformers.js, onnxruntime-web ${found}, worker)`);
