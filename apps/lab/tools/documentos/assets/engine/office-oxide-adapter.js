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

function decodeXml(value) {
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#([0-9]+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, entity) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[entity]);
}

function replaceFirstText(files, extension, search, replacement) {
  const candidates = textTargets[extension]?.(files) || [];
  const textTag = extension === 'docx' ? 'w:t' : extension === 'pptx' ? 'a:t' : 't';
  const pattern = new RegExp(`(<${textTag}(?:\\s[^>]*)?>)([\\s\\S]*?)(</${textTag}>)`, 'g');
  for (const path of candidates) {
    const source = strFromU8(files[path]);
    const nodes = [];
    let match;
    let textOffset = 0;
    while ((match = pattern.exec(source))) {
      const value = decodeXml(match[2]);
      const innerStart = match.index + match[1].length;
      nodes.push({
        end: textOffset + value.length,
        innerEnd: innerStart + match[2].length,
        innerStart,
        start: textOffset,
        value,
      });
      textOffset += value.length;
    }

    const fullText = nodes.map((node) => node.value).join('');
    if (!search && fullText) continue;
    const exactMatchStart = search ? fullText.indexOf(search) : 0;
    const fullDocumentMatch = search && exactMatchStart < 0 && fullText.replace(/\s/g, '') === search.replace(/\s/g, '');
    const matchStart = fullDocumentMatch ? 0 : exactMatchStart;
    if (matchStart < 0) continue;
    const matchEnd = matchStart + search.length;
    const affected = !search
      ? nodes.filter((node) => node.value.length === 0).slice(0, 1)
      : fullDocumentMatch
        ? nodes.filter((node) => node.value.length > 0)
        : nodes.filter((node) => node.end > matchStart && node.start < matchEnd);
    if (!affected.length) continue;
    let edited = source;
    for (let index = affected.length - 1; index >= 0; index -= 1) {
      const node = affected[index];
      const localStart = fullDocumentMatch ? 0 : Math.max(0, matchStart - node.start);
      const localEnd = fullDocumentMatch ? node.value.length : Math.min(node.value.length, matchEnd - node.start);
      let value = node.value.slice(0, localStart);
      if (index === 0) value += replacement;
      if (index === affected.length - 1) value += node.value.slice(localEnd);
      edited = `${edited.slice(0, node.innerStart)}${escapeXml(value)}${edited.slice(node.innerEnd)}`;
    }
    files[path] = strToU8(edited);
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
      if (typeof search !== 'string') throw new Error('Informe o texto que deve ser substituído.');
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
