import init, { WasmDocument } from './office-oxide/office_oxide.js';
import { strFromU8, strToU8, unzipSync, zipSync } from './fflate.js';

let initialized;

const textTargets = {
  docx: (files) => ['word/document.xml'].filter((path) => files[path]),
  xlsx: (files) => Object.keys(files).filter((path) => /^xl\/worksheets\/[^/]+\.xml$/.test(path)).sort(),
  pptx: (files) => Object.keys(files).filter((path) => /^ppt\/slides\/[^/]+\.xml$/.test(path)).sort(),
};

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);
}

function replaceFirstText(files, extension, search, replacement) {
  const candidates = textTargets[extension]?.(files) || [];
  const textTag = extension === 'docx' ? 'w:t' : extension === 'pptx' ? 'a:t' : 't';
  const pattern = new RegExp(`(<${textTag}(?:\\s[^>]*)?>)([\\s\\S]*?)(</${textTag}>)`);
  for (const path of candidates) {
    const source = strFromU8(files[path]);
    const match = source.match(pattern);
    if (!match || !match[2].includes(search)) continue;
    files[path] = strToU8(source.replace(pattern, (_, open, value, close) => `${open}${escapeXml(value.replace(search, replacement))}${close}`));
    return { path, count: 1 };
  }
  throw new Error(`Texto não encontrado no conteúdo estrutural ${extension.toUpperCase()}.`);
}

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
    replaceText({ bytes, extension, search, replacement }) {
      if (!search) throw new Error('Informe o texto que deve ser substituído.');
      if (typeof replacement !== 'string') throw new Error('Informe o novo texto.');
      const files = unzipSync(bytes);
      const replaced = replaceFirstText(files, extension, search, replacement);
      const output = zipSync(files);
      return {
        bytes: output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength),
        ...replaced,
      };
    },
  };
}
