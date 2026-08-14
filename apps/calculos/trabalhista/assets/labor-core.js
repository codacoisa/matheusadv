((root, factory) => {
  const core = typeof module === "object" && module.exports
    ? require("../../assets/core.js")
    : root.OfficeJurCalculations;
  const api = factory(core);
  root.OfficeJurLaborCalculations = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window, (core) => {
  "use strict";

  if (!core) throw new Error("O núcleo de cálculos do OfficeJur não foi carregado.");

  const VERSION = "labor-1.1.0";
  const DAY = 86_400_000;
  const SOURCES = Object.freeze([
    "https://www.planalto.gov.br/ccivil_03/decreto-lei/del5452compilado.htm",
    "https://www.planalto.gov.br/ccivil_03/leis/l4090.htm",
    "https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2011/lei/l12506.htm",
    "https://www.planalto.gov.br/ccivil_03/leis/l8036compilada.htm",
    "https://www.planalto.gov.br/ccivil_03/leis/l0605.htm",
    "https://portal.stf.jus.br/noticias/verNoticiaDetalhe.asp?idConteudo=457520&ori=1",
    "https://www.gov.br/inss/pt-br/direitos-e-deveres/salario-familia/valor-limite-para-direito-ao-salario-familia",
    "https://portalfat.trabalho.gov.br/mte-reajusta-valores-do-beneficio-seguro-desemprego/",
  ]);
  const TYPES = Object.freeze({
    salary_balance: "Saldo salarial",
    thirteenth: "13º salário",
    vacation: "Férias + 1/3",
    notice: "Aviso prévio indenizado",
    fgts_40: "Multa de 40% do FGTS",
    art_467: "Multa do art. 467 da CLT",
    art_477: "Multa do art. 477 da CLT",
    dsr: "Descanso semanal remunerado",
    overtime: "Horas extras",
    intrajornada: "Intervalo intrajornada",
    interjornada: "Intervalo interjornada",
    on_call: "Sobreaviso",
    night_shift: "Adicional noturno",
    insalubrity: "Adicional de insalubridade",
    periculosidade: "Adicional de periculosidade",
    family_salary: "Salário-família",
    meal_voucher: "Vale-alimentação",
    transport_voucher: "Vale-transporte",
    unemployment_insurance: "Seguro-desemprego",
    commissions: "Comissões",
    miscellaneous: "Diversos",
    reflexes: "Reflexos",
  });

  const money = (value) => core.round(Number(value || 0), 2);
  const number = (value, label) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error(`${label} deve ser numérico.`);
    return parsed;
  };
  const positive = (value, label) => {
    const parsed = number(value, label);
    if (parsed < 0) throw new Error(`${label} não pode ser negativo.`);
    return parsed;
  };
  const utcDate = (value, label = "Data") => {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) throw new Error(`${label} inválida: ${value || "vazia"}.`);
    const result = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));
    if (result.getUTCFullYear() !== +match[1] || result.getUTCMonth() !== +match[2] - 1 || result.getUTCDate() !== +match[3])
      throw new Error(`${label} inválida: ${value}.`);
    return result;
  };
  const iso = (value) => value.toISOString().slice(0, 10);
  const competence = (value) => String(value || "").slice(0, 7);
  const monthDate = (value) => {
    if (!/^\d{4}-\d{2}$/.test(String(value || ""))) throw new Error(`Competência inválida: ${value || "vazia"}.`);
    return utcDate(`${value}-01`, "Competência");
  };
  const endOfMonth = (value) => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0));
  const daysInMonth = (value) => endOfMonth(value).getUTCDate();
  const addMonths = (value, amount) => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + amount, 1));
  const daysInclusive = (start, end) => Math.max(0, Math.floor((end - start) / DAY) + 1);
  const defaultSettings = () => ({
    correctionType: "none", correctionRates: {}, interestType: "none", legalRates: {},
    fixedMonthlyRate: 0, preLegalMonthlyRate: 0, penaltyRate: 0, feeRate: 0, feeBase: "total",
  });

  function generateCompetences(startDate, endDate) {
    const start = utcDate(startDate, "Data inicial"), end = utcDate(endDate, "Data final");
    if (end < start) throw new Error("A data final não pode anteceder a data inicial.");
    const values = [];
    for (let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)); cursor <= end; cursor = addMonths(cursor, 1))
      values.push(competence(cursor.toISOString()));
    return values;
  }

  function salaryRange(input) {
    const start = input.startDate || input.admissionDate || input.employment?.admissionDate;
    const end = input.endDate || input.terminationDate || input.dismissalDate || input.employment?.terminationDate;
    if (!start || !end) throw new Error("Informe as datas inicial e final do vínculo para gerar os salários.");
    return { start, end };
  }

  function createSalaryRows(input = {}) {
    const { start, end } = salaryRange(input);
    const supplied = new Map((input.salaryRows || []).map((row) => [competence(row.competence || row.date), row]));
    const defaultSalary = positive(input.baseSalary ?? 0, "Salário-base");
    const defaultDivisor = positive(input.divisor ?? 220, "Divisor") || 220;
    return generateCompetences(start, end).map((key) => {
      const row = supplied.get(key) || {};
      const baseSalary = positive(row.baseSalary ?? row.salary ?? defaultSalary, `Salário-base de ${key}`);
      const divisor = positive(row.divisor ?? defaultDivisor, `Divisor de ${key}`);
      const status = row.status || "unpaid";
      if (!["paid", "unpaid", "partial"].includes(status)) throw new Error(`Status de pagamento inválido em ${key}.`);
      return {
        id: row.id || `salario-${key}`,
        competence: key,
        baseSalary,
        divisor,
        description: String(row.description || "Salário"),
        status,
        paidAmount: money(row.paidAmount ?? row.paymentAmount ?? 0),
        paymentDate: row.paymentDate || row.paidDate || `${key}-${String(daysInMonth(monthDate(key))).padStart(2, "0")}`,
      };
    });
  }

  function salaryForDate(rows, onDate) {
    const key = competence(onDate);
    const exact = rows.find((row) => row.competence === key);
    if (exact) return exact;
    const previous = rows.filter((row) => row.competence <= key).at(-1);
    if (previous) return previous;
    throw new Error(`Não há salário informado para ${key}.`);
  }

  function thirteenthMonths(rows, year, employmentStart, employmentEnd) {
    const start = employmentStart ? utcDate(employmentStart, "Data de admissão") : null;
    const end = employmentEnd ? utcDate(employmentEnd, "Data de demissão") : null;
    let months = 0;
    for (let month = 0; month < 12; month += 1) {
      const first = new Date(Date.UTC(year, month, 1));
      const last = endOfMonth(first);
      const activeStart = start && start > first ? start : first;
      const activeEnd = end && end < last ? end : last;
      if (activeEnd >= activeStart && daysInclusive(activeStart, activeEnd) >= 15) months += 1;
    }
    return months;
  }

  function valueBase(claim, salaryRows, onDate, input) {
    if (claim.baseAmount !== undefined) return positive(claim.baseAmount, "Base de cálculo");
    if (claim.base === "minimum_wage") return core.minimumWage(onDate);
    if (claim.base === "salary" || claim.base === undefined) return salaryForDate(salaryRows, onDate).baseSalary;
    if (claim.base === "hourly") {
      const row = salaryForDate(salaryRows, onDate);
      return row.baseSalary / row.divisor;
    }
    if (claim.base === "input") return positive(input.baseAmount ?? 0, "Base de cálculo");
    throw new Error(`Base de cálculo desconhecida: ${claim.base}.`);
  }

  function claimDate(claim, fallback) {
    return claim.dueDate || claim.date || fallback;
  }
  function claimStatus(claim) {
    const status = claim.status || "unpaid";
    if (!["paid", "unpaid", "partial"].includes(status)) throw new Error(`Status inválido para ${claim.type}.`);
    return status;
  }
  function paymentFor(claim, amount, dueDate) {
    const status = claimStatus(claim);
    if (status === "unpaid") return [];
    const paid = status === "paid" ? amount : positive(claim.paidAmount ?? claim.paymentAmount ?? 0, "Valor pago parcialmente");
    if (paid > amount) throw new Error(`O abatimento de ${claim.type} não pode superar a verba devida.`);
    return [{
      id: `${claim.id || claim.type}-pagamento`, date: claim.paymentDate || claim.paidDate || dueDate,
      amount: money(paid), description: claim.paymentDescription || `Pagamento de ${TYPES[claim.type] || claim.type}`,
    }];
  }

  function hoursAmount(claim, salaryRows, dueDate, defaultPercentage) {
    const hours = positive(claim.hours ?? 0, "Quantidade de horas");
    const percentage = number(claim.percentage ?? defaultPercentage, "Percentual");
    const hourly = valueBase({ ...claim, base: "hourly" }, salaryRows, dueDate, {});
    return money(hourly * hours * (1 + percentage / 100));
  }

  function rawAmount(claim, salaryRows, dueDate, input, amountsByType) {
    const type = claim.type;
    if (!TYPES[type]) throw new Error(`Rubrica trabalhista desconhecida: ${type}.`);
    if (claim.amount !== undefined) return money(positive(claim.amount, `Valor de ${TYPES[type]}`));
    const salary = () => valueBase(claim, salaryRows, dueDate, input);
    if (type === "salary_balance") {
      const days = positive(claim.days ?? 0, "Dias de saldo salarial");
      return money(salary() * days / 30);
    }
    if (type === "thirteenth") {
      const year = Number(claim.year || dueDate.slice(0, 4));
      const months = claim.months ?? thirteenthMonths(salaryRows, year, input.admissionDate || input.startDate, input.terminationDate || input.endDate);
      return money(salary() * positive(months, "Avos de 13º") / 12);
    }
    if (type === "vacation") {
      const fraction = positive(claim.days ?? 30, "Dias de férias") / 30;
      const multiplier = claim.double ? 2 : positive(claim.multiplier ?? 1, "Multiplicador das férias");
      const vacationBase = salary() * fraction;
      return money(vacationBase * multiplier * (4 / 3));
    }
    if (type === "notice") return money(salary() * positive(claim.days ?? 30, "Dias de aviso prévio") / 30);
    if (type === "fgts_40") return money(salary() * number(claim.percentage ?? 40, "Percentual da multa FGTS") / 100);
    if (type === "art_467") return money(salary() * number(claim.percentage ?? 50, "Percentual do art. 467") / 100);
    if (type === "art_477") return money(salary() * number(claim.multiplier ?? 1, "Multiplicador do art. 477"));
    if (type === "dsr") {
      if (claim.days !== undefined)
        return money(salary() / 30 * positive(claim.days, "Dias de DSR") * (claim.double ? 2 : 1));
      return money(salary() * number(claim.percentage ?? 0, "Percentual de DSR") / 100);
    }
    if (type === "overtime") return hoursAmount(claim, salaryRows, dueDate, 50);
    if (type === "intrajornada" || type === "interjornada") return hoursAmount(claim, salaryRows, dueDate, 50);
    if (type === "on_call") {
      const hours = positive(claim.hours ?? 0, "Horas de sobreaviso");
      return money(valueBase({ ...claim, base: "hourly" }, salaryRows, dueDate, input) * hours * number(claim.percentage ?? (100 / 3), "Percentual de sobreaviso") / 100);
    }
    if (type === "night_shift") {
      const hours = positive(claim.hours ?? 0, "Horas noturnas");
      return money(valueBase({ ...claim, base: "hourly" }, salaryRows, dueDate, input) * hours * number(claim.percentage ?? 20, "Percentual noturno") / 100);
    }
    if (type === "insalubrity" || type === "periculosidade")
      return money(salary() * number(claim.percentage ?? (type === "insalubrity" ? 20 : 30), "Percentual do adicional") / 100);
    if (type === "family_salary" || type === "meal_voucher" || type === "transport_voucher")
      return money(positive(claim.quantity ?? claim.children ?? 0, "Quantidade") *
        positive(claim.unitValue ?? claim.value ?? 0, `Valor unitário de ${TYPES[type]}`));
    if (type === "unemployment_insurance")
      return money(positive(claim.installments ?? 0, "Quantidade de parcelas") *
        positive(claim.installmentValue ?? claim.value ?? 0, "Valor da parcela do seguro-desemprego"));
    if (type === "commissions")
      return money(positive(claim.dueAmount ?? claim.value ?? 0, "Comissões devidas"));
    if (type === "miscellaneous")
      return money(positive(claim.value ?? 0, "Valor da rubrica diversa"));
    if (type === "reflexes") {
      const base = claim.baseAmount !== undefined
        ? positive(claim.baseAmount, "Base de reflexos")
        : (claim.baseTypes || []).reduce((sum, item) => sum + Number(amountsByType[item] || 0), 0);
      return money(base * number(claim.percentage ?? 0, "Percentual de reflexos") / 100);
    }
    throw new Error(`Não há fórmula para ${type}.`);
  }

  function normalizeClaim(claim, index, salaryRows, input, amountsByType) {
    const type = String(claim?.type || "");
    const fallback = input.terminationDate || input.endDate || input.calculationDate;
    const dueDate = claimDate(claim, fallback);
    utcDate(dueDate, "Vencimento da rubrica");
    const amount = rawAmount({ ...claim, type }, salaryRows, dueDate, input, amountsByType);
    const label = TYPES[type];
    return {
      id: claim.id || `${type}-${index + 1}-${dueDate}`,
      type,
      dueDate,
      description: claim.description || label,
      originalAmount: amount,
      payments: paymentFor({ ...claim, type }, amount, dueDate),
      status: claimStatus({ ...claim, type }),
    };
  }

  function calculateLabor(input = {}) {
    const calculationDate = input.calculationDate;
    utcDate(calculationDate, "Data-base do cálculo");
    const salaryRows = input.salaryRows?.length ? createSalaryRows(input) : createSalaryRows(input);
    const claims = Array.isArray(input.claims) ? input.claims : (Array.isArray(input.verbas) ? input.verbas : []);
    if (!claims.length) throw new Error("Inclua ao menos uma rubrica trabalhista.");
    const amountsByType = {};
    const claimItems = claims.map((claim, index) => {
      const item = normalizeClaim(claim, index, salaryRows, input, amountsByType);
      amountsByType[item.type] = money((amountsByType[item.type] || 0) + item.originalAmount);
      return item;
    });
    const settings = { ...defaultSettings(), ...(input.settings || {}) };
    const eligible = claimItems.filter((item) => item.dueDate <= calculationDate);
    if (!eligible.length) throw new Error("Nenhuma rubrica venceu até a data-base informada.");
    const pensionResult = core.calculatePension({ calculationDate, installments: eligible, settings });
    const metadata = new Map(claimItems.flatMap((item) => [
      [item.id, item],
      ...item.payments.map((payment) => [payment.id, item]),
    ]));
    const ledger = pensionResult.ledger.map((entry) => {
      const baseId = entry.id.replace(/-abatimento-\d+$/, "");
      const claim = metadata.get(entry.id) || metadata.get(baseId);
      return { ...entry, claimType: claim?.type || "payment", claimStatus: claim?.status || "partial" };
    });
    const eligibleAmounts = eligible.reduce((result, item) => {
      result[item.type] = money((result[item.type] || 0) + item.originalAmount);
      return result;
    }, {});
    const claimTotals = Object.entries(eligibleAmounts).sort(([left], [right]) => left.localeCompare(right)).map(([type, original]) => {
      const items = eligible.filter((item) => item.type === type);
      const paid = money(items.reduce((sum, item) => sum + item.payments.reduce((paidSum, payment) => paidSum + payment.amount, 0), 0));
      const updated = money(ledger.filter((entry) => entry.claimType === type).reduce((sum, entry) => sum + entry.total, 0));
      return { type, label: TYPES[type], original: money(original), paid, outstanding: money(original - paid), updated };
    });
    return {
      calculationVersion: VERSION,
      calculationDate,
      ledger,
      claimTotals,
      totals: pensionResult.totals,
      methodology: {
        ...pensionResult.methodology,
        labor: "Cada rubrica é apurada por sua base declarada, convertida em lançamento na data de vencimento e atualizada pelo mesmo motor econômico do OfficeJur.",
        status: "Rubricas pagas geram abatimento integral; rubricas parciais exigem o valor efetivamente pago; rubricas não pagas não recebem abatimento.",
        thirteenth: "O 13º corresponde aos meses do ano com pelo menos 15 dias de vínculo, salvo quantidade de avos informada manualmente.",
        vacation: "Férias = remuneração proporcional aos dias acrescida de 1/3; quando marcadas em dobro, a remuneração constitucional completa é duplicada.",
        hourly: "Horas extras e intervalos usam salário-base/divisor × horas × (1 + adicional). Sobreaviso usa o percentual informado (padrão 1/3); adicional noturno usa apenas o adicional percentual sobre a hora-base.",
        legalReview: "Percentuais, incidências, bases de FGTS, reflexos, multas e critérios do título devem ser conferidos pelo profissional responsável antes do uso judicial.",
      },
      sources: [...SOURCES],
    };
  }

  return { SOURCES, TYPES, VERSION, calculateLabor, createSalaryRows, generateCompetences, thirteenthMonths };
});
