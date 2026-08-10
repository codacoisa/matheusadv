import init, { WasmDocument } from './office-oxide/office_oxide.js';

let initialized;

export async function create({ manifest, baseUrl }) {
  initialized ||= init(new URL(manifest.wasm, baseUrl));
  await initialized;

  return {
    inspect({ bytes, extension }) {
      const document = new WasmDocument(bytes, extension);
      try {
        return {
          format: document.formatName(),
          plainText: document.plainText(),
          markdown: document.toMarkdown(),
          html: document.toHtml(),
        };
      } finally {
        document.free();
      }
    },
  };
}
