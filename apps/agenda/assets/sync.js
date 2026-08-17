((root, factory) => {
  const api = factory();
  root.OfficeJurAgendaSync = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  "use strict";

  const FINANCE_DOMAINS = ["people", "clients", "team"];

  function create(options = {}) {
    const {
      storage,
      financeStorage,
      financeDataStore,
      gistSettings,
      gistClient,
      access,
      getData,
      setData,
      getFinanceData,
      setFinanceData,
      setStatus,
      notify,
    } = options;
    if (!storage || !financeStorage || !gistSettings || !gistClient || !getData || !setData)
      throw new Error("A sincronização da agenda não foi configurada.");

    const client = access?.gatedClient(gistClient) || gistClient;
    let inFlight = null;
    const status = (message) => typeof setStatus === "function" && setStatus(message);
    const report = (message) => typeof notify === "function" && notify(message, true);

    function settings() {
      return gistSettings.load();
    }

    async function readFile(snapshot, file, message) {
      const descriptor = snapshot.gist.files?.[file];
      if (!descriptor) return null;
      try {
        return JSON.parse(await client.text(descriptor, { maxBytes: 10 * 1024 * 1024 }));
      } catch (error) {
        throw new Error(message || error.message);
      }
    }

    async function readRemoteFinance(snapshot) {
      const domains = {};
      for (const name of FINANCE_DOMAINS) {
        const definition = financeStorage.DOMAINS[name];
        const raw = await readFile(
          snapshot,
          definition.file,
          `Não foi possível ler ${definition.file}.`,
        );
        domains[name] = raw
          ? financeStorage.normalizeDomain(name, raw)
          : financeStorage.emptyDomain(name);
      }
      return domains;
    }

    function localFinanceDomains() {
      return financeStorage.split(getFinanceData?.() || {});
    }

    function mergeFinance(remoteDomains) {
      const localDomains = localFinanceDomains();
      const mergedDomains = { ...localDomains };
      FINANCE_DOMAINS.forEach((name) => {
        mergedDomains[name] = financeStorage.mergeDomain(
          name,
          localDomains[name],
          remoteDomains[name],
        );
      });
      return {
        localDomains,
        mergedDomains,
        data: financeStorage.assemble(mergedDomains),
      };
    }

    async function persistFinance(merged) {
      if (!financeDataStore || !setFinanceData) return;
      setFinanceData(merged.data);
      await financeDataStore.save(merged.mergedDomains, { financeStorage });
    }

    async function fromGist() {
      const current = settings();
      if (!current.gistId || !current.token) {
        status("Dados locais");
        return getData();
      }
      try {
        access?.canSync(current.gistId);
        status("Sincronizando…");
        const snapshot = await client.gistSnapshot(current.gistId, current.token);
        const remoteAgenda = await readFile(
          snapshot,
          storage.FILE,
          `Não foi possível ler ${storage.FILE}.`,
        );
        if (remoteAgenda) setData(storage.merge(getData(), remoteAgenda));
        const remoteFinance = await readRemoteFinance(snapshot);
        await persistFinance(mergeFinance(remoteFinance));
        status("Nuvem sincronizada");
      } catch (error) {
        status("Falha na sincronização");
        report(access?.warning?.() || error.message);
      }
      return getData();
    }

    async function toGist({ force = false } = {}) {
      const current = settings();
      if ((!current.autoSync && !force) || !current.gistId || !current.token)
        return getData();
      if (inFlight) return inFlight;

      inFlight = (async () => {
        try {
          access?.canSync(current.gistId);
          status("Sincronizando com a nuvem…");
          const snapshot = await client.gistSnapshot(current.gistId, current.token);
          const remoteAgendaRaw = await readFile(
            snapshot,
            storage.FILE,
            `Não foi possível ler ${storage.FILE}.`,
          );
          const remoteAgenda = remoteAgendaRaw
            ? storage.normalize(remoteAgendaRaw)
            : storage.normalize({});
          const mergedAgenda = storage.merge(getData(), remoteAgenda);
          const remoteFinance = await readRemoteFinance(snapshot);
          const mergedFinance = mergeFinance(remoteFinance);
          setData(storage.save(mergedAgenda, globalThis.localStorage, { touch: false }));
          await persistFinance(mergedFinance);

          const changedFiles = {};
          const agendaChanged = (!remoteAgendaRaw && mergedAgenda.records.length + mergedAgenda.deleted.length > 0) ||
            (remoteAgendaRaw && storage.signature(mergedAgenda) !== storage.signature(remoteAgenda));
          if (agendaChanged)
            changedFiles[storage.FILE] = { content: JSON.stringify(mergedAgenda, null, 2) };
          FINANCE_DOMAINS.forEach((name) => {
            const definition = financeStorage.DOMAINS[name];
            const remote = remoteFinance[name];
            const local = mergedFinance.mergedDomains[name];
            const hasLocalData = local.records.length + local.deleted.length > 0;
            const financeChanged = (!snapshot.gist.files?.[definition.file] && hasLocalData) ||
              (snapshot.gist.files?.[definition.file] && financeStorage.signature(name, local) !== financeStorage.signature(name, remote));
            if (financeChanged)
              changedFiles[definition.file] = { content: JSON.stringify(local, null, 2) };
          });
          if (Object.keys(changedFiles).length)
            await client.patch(current.gistId, current.token, changedFiles, { etag: snapshot.etag });
          status("Nuvem sincronizada");
        } catch (error) {
          status("Pendente de sincronização");
          report(access?.warning?.() || error.message);
        } finally {
          inFlight = null;
        }
        return getData();
      })();
      return inFlight;
    }

    return { fromGist, toGist };
  }

  return { create };
});
