((root, factory) => {
  const api = factory();
  root.OfficeJurCalculations = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  "use strict";

  const DAY = 86_400_000;
  const CALCULATION_VERSION = "pension-1.1.0";
  const LEGAL_RATE_START_DATE = "2024-08-30";
  const HISTORICAL_LEGAL_RATE_START_DATE = "2003-02-12";
  const LEGAL_RATE_SCHEDULE = "Juros legais: 6% ao ano até 11/02/2003 (CC/1916); 12% ao ano de 12/02/2003 a 29/08/2024 (CC/2002 e art. 161, § 1º, do CTN); Taxa Legal do art. 406 do CC, conforme Lei 14.905/2024, a partir de 30/08/2024.";
  const round = (value, digits = 2) => {
    const factor = 10 ** digits;
    return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
  };
  const money = (value) => round(value, 2);
  const date = (value) => {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) throw new Error(`Data inválida: ${value || "vazia"}.`);
    return new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));
  };
  const iso = (value) => value.toISOString().slice(0, 10);
  const monthKey = (value) => iso(value).slice(0, 7);
  const addMonths = (value, amount) => {
    const first = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + amount, 1));
    return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(value.getUTCDate(), daysInMonth(first))));
  };
  const firstOfMonth = (value) =>
    new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
  const endOfMonth = (value) =>
    new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0));
  const daysInMonth = (value) => endOfMonth(value).getUTCDate();
  const daysBetween = (start, end) => Math.max(0, Math.round((end - start) / DAY));
  const currency = (value) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));

  const MINIMUM_WAGES = Object.freeze([
    { from: "2020-01-01", to: "2020-01-31", value: 1039 },
    { from: "2020-02-01", to: "2020-12-31", value: 1045 },
    { from: "2021-01-01", to: "2021-12-31", value: 1100 },
    { from: "2022-01-01", to: "2022-12-31", value: 1212 },
    { from: "2023-01-01", to: "2023-04-30", value: 1302 },
    { from: "2023-05-01", to: "2023-12-31", value: 1320 },
    { from: "2024-01-01", to: "2024-12-31", value: 1412 },
    { from: "2025-01-01", to: "2025-12-31", value: 1518 },
    { from: "2026-01-01", to: "2026-12-31", value: 1621 },
  ]);

  function minimumWage(onDate) {
    const value = iso(date(onDate));
    const range = MINIMUM_WAGES.find((item) => item.from <= value && value <= item.to);
    if (!range)
      throw new Error(`Salário mínimo não cadastrado para ${value}. Use a forma “valor fixo mensal” e informe o valor previsto no título.`);
    return range.value;
  }

  function installmentAmount(input, dueDate) {
    if (Number(input.overrideAmount) >= 0) return money(input.overrideAmount);
    if (input.basisType === "minimum_wage")
      return money(minimumWage(dueDate) * Number(input.percentage || 0) / 100);
    if (input.basisType === "income")
      return money(Number(input.referenceIncome || 0) * Number(input.percentage || 0) / 100);
    return money(input.fixedAmount || 0);
  }

  function generateInstallments(input) {
    const start = date(input.startDate), end = date(input.endDate);
    if (end < start) throw new Error("A data final não pode anteceder a data inicial.");
    const rows = [];
    let current = start;
    while (current <= end) {
      const dueDate = iso(current);
      rows.push({
        id: `parcela-${dueDate}`,
        kind: "regular",
        dueDate,
        description: `Pensão alimentícia — ${monthKey(current)}`,
        originalAmount: installmentAmount(input, dueDate),
        payments: [],
      });
      if (input.includeThirteenth && current.getUTCMonth() === 11) {
        const thirteenthDate = iso(new Date(Date.UTC(current.getUTCFullYear(), 11, 20)));
        if (date(thirteenthDate) <= end)
          rows.push({
            id: `decimo-terceiro-${current.getUTCFullYear()}`,
            kind: "thirteenth",
            dueDate: thirteenthDate,
            description: `13º da pensão — ${current.getUTCFullYear()}`,
            originalAmount: installmentAmount(input, thirteenthDate),
            payments: [],
          });
      }
      const next = addMonths(current, 1);
      current = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth(), Math.min(start.getUTCDate(), daysInMonth(next))));
    }
    return rows.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }

  function correctionFactor(startDate, endDate, rates) {
    const start = date(startDate), end = date(endDate);
    let cursor = addMonths(firstOfMonth(start), 1), factor = 1;
    const applied = [];
    while (endOfMonth(cursor) <= end) {
      const key = monthKey(cursor);
      if (!(key in rates)) throw new Error(`Índice de correção ausente para ${key}.`);
      const rate = Number(rates[key]);
      factor *= 1 + rate / 100;
      applied.push({ month: key, rate, factor: round(factor, 10) });
      cursor = addMonths(cursor, 1);
    }
    return { factor: round(factor, 10), applied };
  }

  function monthlyProrata(startDate, endDate, monthlyRates, fixedRate) {
    const start = date(startDate), end = date(endDate);
    if (end <= start) return { rate: 0, applied: [] };
    let cursor = new Date(start), total = 0;
    const applied = [];
    while (cursor < end) {
      const monthEnd = endOfMonth(cursor);
      const segmentEnd = end < new Date(monthEnd.getTime() + DAY) ? end : new Date(monthEnd.getTime() + DAY);
      const days = daysBetween(cursor, segmentEnd);
      const key = monthKey(cursor);
      if (fixedRate === undefined && !(key in monthlyRates))
        throw new Error(`Taxa de juros ausente para ${key}.`);
      const monthly = fixedRate === undefined ? Number(monthlyRates[key]) : Number(fixedRate);
      const segmentRate = monthly * days / daysInMonth(cursor);
      total += segmentRate;
      applied.push({ month: key, monthlyRate: monthly, days, daysInMonth: daysInMonth(cursor), rate: round(segmentRate, 10) });
      cursor = segmentEnd;
    }
    return { rate: round(total, 10), applied };
  }

  function legalInterestRate(startValue, endValue, monthlyRates = {}) {
    const start = date(startValue), end = date(endValue);
    const legalStart = date(LEGAL_RATE_START_DATE);
    const historicalStart = date(HISTORICAL_LEGAL_RATE_START_DATE);
    if (end <= start) return { rate: 0, applied: [] };

    let total = 0;
    const applied = [];
    const addAnnual = (segmentStart, segmentEnd, annualRate, regime) => {
      if (segmentEnd <= segmentStart) return;
      const days = daysBetween(segmentStart, segmentEnd);
      const rate = annualRate * days / 365;
      total += rate;
      applied.push({ regime, annualRate, days, denominator: 365, rate: round(rate, 10) });
    };

    addAnnual(start, end < historicalStart ? end : historicalStart, 6, "CC/1916");
    const modernEnd = end < legalStart ? end : legalStart;
    addAnnual(start > historicalStart ? start : historicalStart, modernEnd, 12, "CC/2002 + CTN");
    if (end > legalStart) {
      let cursor = start > legalStart ? start : legalStart;
      while (cursor < end) {
        const monthEndExclusive = new Date(endOfMonth(cursor).getTime() + DAY);
        const segmentEnd = end < monthEndExclusive ? end : monthEndExclusive;
        const key = monthKey(cursor);
        if (!(key in monthlyRates)) throw new Error(`Taxa Legal ausente para ${key}.`);
        const monthly = Number(monthlyRates[key]);
        const days = daysBetween(cursor, segmentEnd);
        const rate = monthly * days / daysInMonth(cursor);
        total += rate;
        applied.push({ regime: "Taxa Legal — art. 406 do CC", month: key, monthlyRate: monthly, days, daysInMonth: daysInMonth(cursor), rate: round(rate, 10) });
        cursor = segmentEnd;
      }
    }
    return { rate: round(total, 10), applied };
  }

  function interestMethodology(settings = {}) {
    if (settings.interestType === "legal") return `${LEGAL_RATE_SCHEDULE} A faixa de 2024 em diante é mensal e proporcional aos dias corridos.`;
    if (settings.interestType === "fixed") return `Taxa fixa de ${Number(settings.fixedMonthlyRate || 0)}% ao mês, com juros simples e pró-rata por dias corridos.`;
    return "não aplicados";
  }

  function updateAmount(item, settings, calculationDate, sign = 1) {
    const startDate = item.date || item.dueDate;
    const principal = money(item.amount ?? item.originalAmount);
    const correction = settings.correctionType === "none"
      ? { factor: 1, applied: [] }
      : correctionFactor(startDate, calculationDate, settings.correctionRates || {});
    const corrected = money(principal * correction.factor);
    let interest = { rate: 0, applied: [] };
    if (settings.interestType === "fixed")
      interest = monthlyProrata(startDate, calculationDate, {}, Number(settings.fixedMonthlyRate || 0));
    if (settings.interestType === "legal")
      interest = legalInterestRate(startDate, calculationDate, settings.legalRates || {});
    const interestAmount = money(corrected * interest.rate / 100);
    return {
      id: item.id,
      sign,
      date: startDate,
      description: item.description || (sign < 0 ? "Abatimento" : "Parcela"),
      original: money(principal * sign),
      correctionFactor: correction.factor,
      correction: money((corrected - principal) * sign),
      corrected: money(corrected * sign),
      interestRate: interest.rate,
      interest: money(interestAmount * sign),
      total: money((corrected + interestAmount) * sign),
      correctionTrail: correction.applied,
      interestTrail: interest.applied,
    };
  }

  function calculatePension(input) {
    const calculationDate = iso(date(input.calculationDate));
    const installments = (input.installments || []).map((item) => ({ ...item }));
    if (!installments.length) throw new Error("Inclua ao menos uma parcela.");
    const ledger = [];
    installments.forEach((item) => {
      if (item.dueDate > calculationDate) return;
      ledger.push(updateAmount(item, input.settings, calculationDate, 1));
      (item.payments || []).forEach((payment, index) => {
        if (payment.date > calculationDate) return;
        ledger.push(updateAmount({
          id: payment.id || `${item.id}-abatimento-${index + 1}`,
          date: payment.date,
          amount: payment.amount,
          description: payment.description || `Abatimento de ${item.description}`,
        }, input.settings, calculationDate, -1));
      });
    });
    const sum = (field) => money(ledger.reduce((total, item) => total + item[field], 0));
    const base = sum("total");
    const penalty = money(Math.max(0, base) * Number(input.settings.penaltyRate || 0) / 100);
    const feeBase = input.settings.feeBase === "corrected" ? sum("corrected") : base + penalty;
    const fees = money(Math.max(0, feeBase) * Number(input.settings.feeRate || 0) / 100);
    return {
      calculationVersion: CALCULATION_VERSION,
      calculationDate,
      ledger,
      totals: {
        original: sum("original"),
        correction: sum("correction"),
        corrected: sum("corrected"),
        interest: sum("interest"),
        penalty,
        fees,
        total: money(base + penalty + fees),
      },
      methodology: {
        correction: input.settings.correctionType,
        interest: input.settings.interestType,
        correctionConvention: "Índices mensais completos posteriores ao mês do vencimento, capitalizados sucessivamente.",
        interestMethod: interestMethodology(input.settings),
        interestConvention: input.settings.interestType === "legal"
          ? "Juros simples; 2024 em diante é apurado por competência mensal e proporcional aos dias corridos."
          : "Juros simples, proporcionais aos dias corridos de cada mês, sem capitalização.",
        abatements: "Cada abatimento é atualizado, pela mesma regra da dívida, de sua data até a data-base e então deduzido.",
        rounding: "Valores monetários arredondados para centavos em cada rubrica; fatores mantidos com até 10 casas.",
      },
    };
  }

  function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === "object")
      return Object.keys(value).sort().reduce((result, key) => {
        if (!["dataHash", "fileHash"].includes(key)) result[key] = stable(value[key]);
        return result;
      }, {});
    return value;
  }

  async function hash(value) {
    const bytes = new TextEncoder().encode(JSON.stringify(stable(value)));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, "0")).join("");
  }

  return {
    CALCULATION_VERSION, HISTORICAL_LEGAL_RATE_START_DATE, LEGAL_RATE_SCHEDULE, LEGAL_RATE_START_DATE,
    MINIMUM_WAGES, calculatePension, correctionFactor, currency, generateInstallments, hash,
    legalInterestRate, minimumWage, monthlyProrata, round, stable,
  };
});
