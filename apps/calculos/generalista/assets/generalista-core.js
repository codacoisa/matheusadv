((root, factory) => {
  const api = factory();
  root.OfficeJurGenericCalculations = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  "use strict";

  const DAY = 86_400_000;
  const VERSION = "generic-1.0.0";
  const round = (value, digits = 2) => {
    const factor = 10 ** digits;
    return Math.round((Number(value || 0) + Number.EPSILON) * factor) / factor;
  };
  const money = (value) => round(value, 2);
  const toDate = (value) => {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) throw new Error(`Data inválida: ${value || "vazia"}.`);
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  };
  const iso = (value) => value.toISOString().slice(0, 10);
  const monthKey = (value) => iso(value).slice(0, 7);
  const endOfMonth = (value) => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0));
  const firstOfNextMonth = (value) => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 1));
  const daysInMonth = (value) => endOfMonth(value).getUTCDate();
  const daysBetween = (start, end) => Math.max(0, Math.round((end - start) / DAY));
  const currency = (value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));

  function correctionFactor(startValue, endValue, rates = {}, prorata = true) {
    const start = toDate(startValue), end = toDate(endValue);
    if (end <= start) return { factor: 1, rate: 0, applied: [] };
    let cursor = new Date(start), factor = 1;
    const applied = [];
    while (cursor < end) {
      const monthEndExclusive = new Date(endOfMonth(cursor).getTime() + DAY);
      const segmentEnd = end < monthEndExclusive ? end : monthEndExclusive;
      const key = monthKey(cursor);
      if (!(key in rates)) throw new Error(`Índice de correção ausente para ${key}.`);
      const rate = Number(rates[key]);
      const days = daysBetween(cursor, segmentEnd);
      const eligible = prorata ? rate * days / daysInMonth(cursor) : (cursor.getUTCDate() === 1 && segmentEnd >= monthEndExclusive ? rate : 0);
      if (eligible) factor *= 1 + eligible / 100;
      if (eligible || rate) applied.push({ month: key, monthlyRate: rate, days, daysInMonth: daysInMonth(cursor), rate: round(eligible, 10), factor: round(factor, 10) });
      cursor = segmentEnd;
    }
    return { factor: round(factor, 10), rate: round((factor - 1) * 100, 10), applied };
  }

  function interestRate(startValue, endValue, rate, periodicity = "monthly", prorata = true) {
    const start = toDate(startValue), end = toDate(endValue);
    const days = daysBetween(start, end);
    if (days <= 0 || !Number(rate)) return { rate: 0, applied: [] };
    const value = Number(rate);
    if (prorata) {
      const result = periodicity === "annual" ? value * days / 365 : value * days / daysInMonth(start);
      return { rate: round(result, 10), applied: [{ days, periodicity, rate: round(result, 10) }] };
    }
    const periods = periodicity === "annual" ? Math.floor(days / 365) : Math.floor(days / daysInMonth(start));
    const result = value * periods;
    return { rate: round(result, 10), applied: [{ periods, periodicity, rate: round(result, 10) }] };
  }

  function legalInterestRate(startValue, endValue, monthlyRates = {}) {
    const start = toDate(startValue), end = toDate(endValue);
    const effectiveDate = toDate("2024-08-30");
    if (end <= effectiveDate || end <= start) return { rate: 0, applied: [] };
    let cursor = start < effectiveDate ? effectiveDate : start;
    let total = 0;
    const applied = [];
    while (cursor < end) {
      const monthEndExclusive = new Date(endOfMonth(cursor).getTime() + DAY);
      const segmentEnd = end < monthEndExclusive ? end : monthEndExclusive;
      const key = monthKey(cursor);
      if (!(key in monthlyRates)) throw new Error(`Taxa Legal ausente para ${key}.`);
      const monthly = Number(monthlyRates[key]);
      const days = daysBetween(cursor, segmentEnd);
      const rate = monthly * days / daysInMonth(cursor);
      total += rate;
      applied.push({ month: key, monthlyRate: monthly, days, daysInMonth: daysInMonth(cursor), rate: round(rate, 10) });
      cursor = segmentEnd;
    }
    return { rate: round(total, 10), applied };
  }

  function updateItem(item, input, calculationDate, sign) {
    const settings = input.settings || {};
    const correctionType = item.correctionType || settings.correctionType || "none";
    const correctionStart = item.correctionStart || input.periodStartDate || input.judgmentDate || item.date;
    const correctionEnd = item.correctionEnd || calculationDate;
    const correction = correctionType === "none" ? { factor: 1, rate: 0, applied: [] } : correctionFactor(
      correctionStart,
      correctionEnd,
      input.ratesByType?.[correctionType] || settings.correctionRates || {},
      item.correctionProrata ?? settings.correctionProrata ?? true,
    );
    const principal = money(Math.abs(Number(item.amount || 0)));
    const corrected = money(principal * correction.factor);
    const interestType = item.interestType || settings.interestType || (Number(item.interestRate ?? settings.interestRate) ? "fixed" : "none");
    const interestStart = item.interestStart || input.periodStartDate || input.judgmentDate || item.date;
    const interestEnd = item.interestEnd || calculationDate;
    const interest = interestType === "legal"
      ? legalInterestRate(interestStart, interestEnd, input.legalRates || settings.legalRates || {})
      : interestType === "none" ? { rate: 0, applied: [] } : interestRate(
        interestStart,
        interestEnd,
        item.interestRate ?? settings.interestRate ?? 0,
        item.interestPeriodicity || settings.interestPeriodicity || "monthly",
        item.interestProrata ?? settings.interestProrata ?? true,
      );
    const interestAmount = money(corrected * interest.rate / 100);
    return {
      id: item.id,
      kind: item.kind || "debit",
      sign,
      date: item.date,
      description: item.description || (sign < 0 ? "Abatimento / pagamento" : "Parcela"),
      original: money(principal * sign),
      corrected: money(corrected * sign),
      correction: money((corrected - principal) * sign),
      correctionRate: correction.rate,
      interest: money(interestAmount * sign),
      interestRate: interest.rate,
      interestType,
      total: money((corrected + interestAmount) * sign),
      correctionTrail: correction.applied,
      interestTrail: interest.applied,
    };
  }

  function calculateGeneric(input) {
    const calculationDate = iso(toDate(input.calculationDate));
    const items = Array.isArray(input.items) ? input.items : [];
    if (!items.length) throw new Error("Inclua ao menos um lançamento.");
    const ledger = items
      .filter((item) => item.date && item.date <= calculationDate && Number(item.amount) >= 0)
      .map((item) => updateItem(item, input, calculationDate, item.kind === "payment" ? -1 : 1));
    if (!ledger.length) throw new Error("Nenhum lançamento está dentro da data-base do cálculo.");
    const sum = (field, rows = ledger) => money(rows.reduce((total, item) => total + Number(item[field] || 0), 0));
    const positive = ledger.filter((item) => item.sign > 0);
    const positiveTotal = sum("total", positive);
    const settings = input.settings || {};
    const penaltyRows = (input.penalties || []).map((item, index) => {
      const rate = Number(item.rate || 0);
      const base = positiveTotal + (item.onInterest ? sum("interest", positive) : 0);
      return { id: item.id || `multa-${index + 1}`, description: item.description || "Multa", amount: money(Math.max(0, base) * rate / 100), rate };
    });
    if (settings.penaltyRate && !penaltyRows.length) penaltyRows.push({ id: "multa-padrao", description: "Multa", amount: money(Math.max(0, positiveTotal) * Number(settings.penaltyRate) / 100), rate: Number(settings.penaltyRate) });
    const penalty = money(penaltyRows.reduce((total, item) => total + item.amount, 0));
    const feeRows = (input.fees || []).map((item, index) => {
      const base = positiveTotal + penalty;
      const amount = item.type === "fixed" ? money(item.amount) : money(Math.max(0, base) * Number(item.rate || 0) / 100);
      return { id: item.id || `honorarios-${index + 1}`, description: item.description || "Honorários", amount, rate: Number(item.rate || 0), type: item.type || "percent" };
    });
    if (settings.feeRate && !feeRows.length) feeRows.push({ id: "honorarios-padrao", description: "Honorários", amount: money(Math.max(0, positiveTotal + penalty) * Number(settings.feeRate) / 100), rate: Number(settings.feeRate), type: "percent" });
    const fees = money(feeRows.reduce((total, item) => total + item.amount, 0));
    const costs = (input.costs || []).filter((item) => item.date && item.date <= calculationDate && Number(item.amount) >= 0).map((item, index) => ({
      ...updateItem({ ...item, kind: "debit", interestRate: 0 }, { ...input, settings: { ...settings, correctionType: item.correctionType || "none" } }, calculationDate, 1),
      id: item.id || `custa-${index + 1}`,
      description: item.description || "Custa processual",
      kind: "cost",
    }));
    const costTotal = sum("total", costs);
    return {
      calculationVersion: VERSION,
      calculationDate,
      ledger: [...ledger, ...costs],
      penaltyRows,
      feeRows,
      totals: {
        original: sum("original"),
        correction: sum("correction"),
        corrected: sum("corrected"),
        interest: sum("interest"),
        penalty,
        fees,
        costs: costTotal,
        total: money(sum("total") + penalty + fees + costTotal),
      },
      methodology: {
        correction: settings.correctionType || "none",
        interest: settings.interestType === "legal" || items.some((item) => item.interestType === "legal") ? "Taxa Legal (Lei 14.905/2024 e Resolução CMN 5.171/2024)" : `${settings.interestRate || 0}% ${settings.interestPeriodicity === "annual" ? "ao ano" : "ao mês"}`,
        correctionConvention: "Índices mensais aplicados no intervalo de cada lançamento, com pró-rata opcional.",
        interestConvention: "Juros simples, proporcionais aos dias ou períodos completos conforme a opção escolhida.",
        rounding: "Valores monetários arredondados para centavos em cada rubrica.",
      },
    };
  }

  return { VERSION, calculateGeneric, correctionFactor, currency, interestRate, legalInterestRate, money, round };
});
