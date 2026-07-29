(function initDocumentUtils(global) {
  'use strict';

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function clean(value) {
    return String(value || '').trim();
  }

  function joinParts(parts, separator = ', ') {
    return parts.map(clean).filter(Boolean).join(separator);
  }

  function formatCPF(value) {
    const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
    const groups = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 9)].filter(Boolean);
    let result = groups.join('.');
    if (digits.length > 9) result += `-${digits.slice(9, 11)}`;
    return result;
  }

  function formatCNPJ(value) {
    const digits = String(value || '').replace(/\D/g, '').slice(0, 14);
    return digits
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }

  function formatZip(value) {
    const digits = String(value || '').replace(/\D/g, '').slice(0, 8);
    return digits
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2-$3');
  }

  function formatPhone(value) {
    if (String(value || '').trim().startsWith('+')) {
      return String(value).replace(/[^\d+()\s-]/g, '').replace(/\s+/g, ' ').trim();
    }
    const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 10) {
      return digits.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
    }
    return digits.replace(/^(\d{2})(\d)(\d)/, '($1) $2 $3').replace(/(\d{4})(\d)/, '$1-$2');
  }

  function normalizeFilename(value, fallback = 'documento') {
    return (clean(value) || fallback)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || fallback;
  }

  function parseLocalDate(value) {
    if (!value) return null;
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatLongDate(value) {
    const date = parseLocalDate(value);
    if (!date) return '';
    return new Intl.DateTimeFormat('pt-BR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  }

  function formatShortDate(value) {
    const date = parseLocalDate(value);
    return date ? new Intl.DateTimeFormat('pt-BR').format(date) : '';
  }

  function formatTime(value) {
    return clean(value);
  }

  function bytesToBase64(bytes) {
    const chunkSize = 8192;
    let binary = '';
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return btoa(binary);
  }

  function encodePdfDraft(marker, draft) {
    const json = JSON.stringify(draft || {});
    return `${marker}${bytesToBase64(new TextEncoder().encode(json))}`;
  }

  function decodePdfDraft(value) {
    try {
      const binary = atob(String(value || ''));
      const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
      const draft = JSON.parse(new TextDecoder().decode(bytes));
      return draft && typeof draft === 'object' && !Array.isArray(draft) ? draft : null;
    } catch {
      return null;
    }
  }

  function extractDraftFromPdfText(text, marker, decoder = decodePdfDraft) {
    const markerIndex = String(text || '').indexOf(marker);
    if (markerIndex < 0) return null;
    const encoded = String(text).slice(markerIndex + marker.length).match(/^([A-Za-z0-9+/=]+)/)?.[1];
    return encoded ? decoder(encoded) : null;
  }

  function arrayBufferToBinaryString(buffer) {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 8192;
    let result = '';
    for (let index = 0; index < bytes.length; index += chunkSize) {
      result += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return result;
  }

  global.OfficeJurDocumentUtils = Object.freeze({
    arrayBufferToBinaryString,
    clean,
    decodePdfDraft,
    encodePdfDraft,
    extractDraftFromPdfText,
    formatCNPJ,
    formatCPF,
    formatLongDate,
    formatPhone,
    formatShortDate,
    formatTime,
    formatZip,
    joinParts,
    normalizeFilename,
    todayISO,
  });
})(window);
