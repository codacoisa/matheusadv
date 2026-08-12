(() => {
  "use strict";

  const STATES = Object.freeze({
    local: { label: "Somente neste navegador", icon: "drive" },
    configured: { label: "Nuvem configurada", icon: "cloud" },
    syncing: { label: "Sincronizando com a nuvem…", icon: "sync" },
    synced: { label: "Nuvem sincronizada", icon: "check" },
    pending: { label: "Sincronização pendente", icon: "pending" },
    error: { label: "Falha na sincronização", icon: "error" },
    blocked: { label: "Acesso à nuvem bloqueado", icon: "error" },
  });

  const ICONS = Object.freeze({
    drive: '<path d="M4 7.5h16v10H4z"/><path d="M7 11h10M16.5 14.5h.01"/>',
    cloud: '<path d="M7 18h10a4 4 0 0 0 .8-7.9A6 6 0 0 0 6.4 8.7 4.5 4.5 0 0 0 7 18Z"/>',
    sync: '<path d="M20 7h-5V2"/><path d="M4 17h5v5"/><path d="M19 12a7 7 0 0 0-12-5l-2 2M5 12a7 7 0 0 0 12 5l2-2"/>',
    check: '<path d="M7 18h10a4 4 0 0 0 .8-7.9A6 6 0 0 0 6.4 8.7 4.5 4.5 0 0 0 7 18Z"/><path d="m9 13 2 2 4-4"/>',
    pending: '<path d="M7 18h10a4 4 0 0 0 .8-7.9A6 6 0 0 0 6.4 8.7 4.5 4.5 0 0 0 7 18Z"/><path d="M12 10v3l2 1"/>',
    error: '<path d="M7 18h10a4 4 0 0 0 .8-7.9A6 6 0 0 0 6.4 8.7 4.5 4.5 0 0 0 7 18Z"/><path d="M12 10v3M12 15.5h.01"/>',
  });

  function configured() {
    try {
      const settings = globalThis.OfficeJurGistSettings?.load?.() || {};
      return Boolean(settings.gistId && settings.token);
    } catch {
      return false;
    }
  }

  class OfficeCloudStatus extends HTMLElement {
    static observedAttributes = ["state", "detail"];

    connectedCallback() {
      if (!this.hasAttribute("state"))
        this.setAttribute("state", configured() ? "configured" : "local");
      this.setAttribute("role", "status");
      this.setAttribute("aria-live", "polite");
      this.render();
    }

    attributeChangedCallback() {
      if (this.isConnected) this.render();
    }

    setState(state, detail = "") {
      this.setAttribute("state", STATES[state] ? state : "configured");
      if (detail) this.setAttribute("detail", detail);
      else this.removeAttribute("detail");
    }

    refresh() {
      this.setState(configured() ? "configured" : "local");
    }

    render() {
      const state = STATES[this.getAttribute("state")] || STATES.configured,
        detail = this.getAttribute("detail") || state.label;
      this.title = detail;
      this.setAttribute("aria-label", detail);
      this.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[state.icon]}</svg><span>${state.label}</span>`;
    }
  }

  function set(target, state, detail = "") {
    const element = typeof target === "string" ? document.querySelector(target) : target;
    element?.setState?.(state, detail);
  }

  function fromMessage(target, message = "") {
    const value = String(message).toLocaleLowerCase("pt-BR");
    if (/bloquead|removid/.test(value)) return set(target, "blocked", message);
    if (/falha|erro|não foi possível/.test(value)) return set(target, "error", message);
    if (/pendente/.test(value)) return set(target, "pending", message);
    if (/sincronizando|salvando/.test(value)) return set(target, "syncing", message);
    if (/sincronizad|conectad|atualizad/.test(value)) return set(target, "synced", message);
    if (/local|navegador/.test(value)) return set(target, "local", message);
    set(target, configured() ? "configured" : "local", message);
  }

  customElements.define("office-cloud-status", OfficeCloudStatus);
  globalThis.OfficeJurCloudStatus = Object.freeze({ set, fromMessage });
})();
