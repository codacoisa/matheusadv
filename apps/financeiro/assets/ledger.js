(() => {
  "use strict";

  const finiteAmount = (value) => {
    const amount = Number(value || 0);
    return Number.isFinite(amount) ? Math.max(0, amount) : 0;
  };
  const roundMoney = (value) => Number(finiteAmount(value).toFixed(2));

  function normalizeDocumentIdentifier(value) {
    return String(value || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
  }

  function normalizeCaseReference(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR")
      .replace(/[^a-z0-9]/g, "");
  }

  function hasDuplicate(items, value, excludedId, normalizer) {
    const normalized = normalizer(value);
    return Boolean(
      normalized &&
        (Array.isArray(items) ? items : []).some(
          (item) =>
            item?.id !== excludedId && normalizer(item?.value) === normalized,
        ),
    );
  }

  function hasDuplicateDocument(items, value, excludedId = "") {
    return hasDuplicate(
      (Array.isArray(items) ? items : []).map((item) => ({
        id: item?.id,
        value: item?.document,
      })),
      value,
      excludedId,
      normalizeDocumentIdentifier,
    );
  }

  function hasDuplicateCaseReference(items, value, excludedId = "") {
    return hasDuplicate(
      (Array.isArray(items) ? items : []).map((item) => ({
        id: item?.id,
        value: item?.number,
      })),
      value,
      excludedId,
      normalizeCaseReference,
    );
  }

  function realizedAmountOf(entry = {}) {
    const total = roundMoney(entry.amount);
    return Math.min(total, roundMoney(entry.paidAmount));
  }

  function remainingAmountOf(entry = {}) {
    return roundMoney(finiteAmount(entry.amount) - realizedAmountOf(entry));
  }

  function statusOf(entry = {}, today = new Date().toISOString().slice(0, 10)) {
    const total = roundMoney(entry.amount);
    const realized = realizedAmountOf(entry);
    if (total > 0 && realized >= total) return "paid";
    if (realized > 0) return "partial";
    return String(entry.dueDate || "") < today ? "overdue" : "pending";
  }

  function planPaymentAllocation(
    entries,
    currentId,
    requestedAmount,
    currentAmountOverride,
  ) {
    const list = Array.isArray(entries) ? entries : [];
    const current = list.find((entry) => entry?.id === currentId);
    const requested = roundMoney(requestedAmount);
    if (!current) {
      return {
        requested,
        currentPaidAmount: 0,
        excess: 0,
        availableFuture: 0,
        updates: [],
        unallocated: requested,
      };
    }

    const currentTotal = roundMoney(
      currentAmountOverride === undefined
        ? current.amount
        : currentAmountOverride,
    );
    const excess = roundMoney(requested - currentTotal);
    if (
      !excess ||
      !current.contractSource ||
      !current.contractId
    ) {
      return {
        requested,
        currentPaidAmount: Math.min(requested, currentTotal),
        excess,
        availableFuture: 0,
        updates: [],
        unallocated: excess,
      };
    }

    const contractEntries = list
      .filter(
        (entry) =>
          entry?.contractSource === current.contractSource &&
          entry?.contractId === current.contractId,
      )
      .slice()
      .sort(
        (left, right) =>
          String(left.dueDate || "").localeCompare(String(right.dueDate || "")) ||
          String(left.scheduleItemId || "").localeCompare(
            String(right.scheduleItemId || ""),
          ),
      );
    const currentIndex = contractEntries.findIndex(
      (entry) => entry.id === currentId,
    );
    const future = contractEntries.slice(currentIndex + 1);
    const availableFuture = roundMoney(
      future.reduce((sum, entry) => sum + remainingAmountOf(entry), 0),
    );
    let remaining = excess;
    const updates = [];
    for (const entry of future) {
      const balance = remainingAmountOf(entry);
      if (!balance || !remaining) continue;
      const appliedAmount = Math.min(balance, remaining);
      const paidAmount = roundMoney(realizedAmountOf(entry) + appliedAmount);
      updates.push({
        id: entry.id,
        description: String(entry.description || "Parcela seguinte"),
        appliedAmount,
        paidAmount,
        status:
          paidAmount >= roundMoney(entry.amount) ? "paid" : "partial",
      });
      remaining = roundMoney(remaining - appliedAmount);
    }

    return {
      requested,
      currentPaidAmount: currentTotal,
      excess,
      availableFuture,
      updates,
      unallocated: remaining,
    };
  }

  const api = {
    hasDuplicateCaseReference,
    hasDuplicateDocument,
    normalizeCaseReference,
    normalizeDocumentIdentifier,
    planPaymentAllocation,
    realizedAmountOf,
    remainingAmountOf,
    statusOf,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  globalThis.FinanceLedger = api;
})();
