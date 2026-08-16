(() => {
  "use strict";

  const TITLE = "Acesso local bloqueado";
  const DESCRIPTION = "Os dados sincronizados deste navegador foram removidos porque a autorização expirou ou foi revogada. Atualize a credencial nas Configurações e sincronize novamente.";
  const PENDING_DESCRIPTION = "Os dados sincronizados estão protegidos e aguardam a revalidação autenticada da nuvem. Eles não serão exibidos até a confirmação do acesso.";

  function descriptionForLease() {
    try {
      const lease = JSON.parse(localStorage.getItem("officejur-gist-access-lease") || "{}");
      return ["stale", "unverified"].includes(lease.phase) ? PENDING_DESCRIPTION : DESCRIPTION;
    } catch (_) { return DESCRIPTION; }
  }

  function setStatus(statusElement) {
    if (!statusElement) return;
    statusElement.setAttribute("role", "status");
    statusElement.setAttribute("aria-live", "polite");
    statusElement.classList.add("local-access-status");
    if (typeof statusElement.setState === "function") {
      statusElement.setState("blocked", TITLE);
      return;
    }
    statusElement.textContent = TITLE;
  }

  function prepareRetry(retryButton) {
    const retry = retryButton?.cloneNode(true) || document.createElement("button");
    retry.type = "button";
    retry.id = "local-access-retry";
    retry.className = "local-access-retry";
    retry.hidden = false;
    retry.disabled = false;
    retry.textContent = "Tentar novamente";
    retry.setAttribute("aria-label", "Tentar novamente");
    retry.addEventListener("click", () => window.location.reload());
    if (retryButton?.parentNode) retryButton.replaceWith(retry);
    return retry;
  }

  function render({ container, settingsHref, statusElement, retryButton, syncButton, footer, mobileMenuButton } = {}) {
    if (!container) return null;

    const alreadyBlocked = container.classList.contains("local-access-page") || container.classList.contains("local-access-container");
    document.body.classList.add("local-access-blocked");
    container.classList.remove("workspace", "shell", "content", "grid-2", "detail-pane", "people-pane");
    container.classList.add(container.tagName === "MAIN" ? "local-access-page" : "local-access-container");
    container.removeAttribute("aria-label");
    let activeStatus = statusElement || document.querySelector(".local-access-status");
    if (!activeStatus || container.contains(activeStatus)) {
      activeStatus = document.createElement("span");
      activeStatus.id = "local-access-status";
      const actions = document.querySelector(".topbar .top-actions");
      actions?.insertBefore(activeStatus, actions.querySelector("office-app-switcher") || null);
    }
    setStatus(activeStatus);

    if (syncButton) {
      syncButton.hidden = true;
      syncButton.disabled = true;
      syncButton.setAttribute("aria-hidden", "true");
    }
    if (mobileMenuButton) {
      mobileMenuButton.hidden = true;
      mobileMenuButton.disabled = true;
      mobileMenuButton.setAttribute("aria-hidden", "true");
    }
    footer?.removeAttribute("sidebar");

    const existingCard = container.querySelector(".local-access-card");
    if (alreadyBlocked && existingCard) return existingCard;

    const retry = prepareRetry(retryButton || document.querySelector("#local-access-retry"));
    if (!retry.parentNode) {
      const actions = document.querySelector(".topbar .top-actions");
      actions?.insertBefore(retry, actions.querySelector("office-app-switcher") || null);
    }

    const section = document.createElement("section");
    section.className = "local-access-card";
    section.setAttribute("role", "alert");
    section.setAttribute("aria-labelledby", "local-access-title");
    section.setAttribute("aria-describedby", "local-access-description");

    const title = document.createElement("h1");
    title.id = "local-access-title";
    title.tabIndex = -1;
    title.textContent = TITLE;
    const description = document.createElement("p");
    description.id = "local-access-description";
    description.textContent = descriptionForLease();
    const settings = document.createElement("a");
    settings.className = "local-access-primary";
    settings.href = settingsHref;
    settings.textContent = "Abrir Configurações";
    section.append(title, description, settings);

    if (container.tagName === "MAIN") container.replaceChildren(section);
    else {
      const page = document.createElement("main");
      page.className = "local-access-page";
      page.append(section);
      container.replaceChildren(page);
    }
    if (!alreadyBlocked) title.focus({ preventScroll: true });
    return section;
  }

  window.OfficeJurLocalAccessBlocked = { render, TITLE, DESCRIPTION, PENDING_DESCRIPTION };
})();
