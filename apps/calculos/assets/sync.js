((root, factory) => {
  const api = factory();
  root.OfficeJurCalculationSync = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  "use strict";

  function create(options = {}) {
    const {
      storage, gistSettings, gistClient, getData, setData, setStatus, notify, access,
    } = options;
    if (!storage || !gistSettings || !gistClient || !getData || !setData)
      throw new Error("A sincronização dos cálculos não foi configurada.");

    const status = (message) => {
      if (typeof setStatus === "function") setStatus(message);
    };
    const report = (message) => {
      if (typeof notify === "function") notify(message, true);
    };
    const lease = access || globalThis.OfficeJurGistAccessLease?.create();
    const client = lease?.gatedClient(gistClient) || gistClient;
    const clearLocal = async () => {
      if (typeof storage.clear === "function") storage.clear();
      setData(storage.load());
    };

    async function fromGist() {
      const settings = gistSettings.load();
      if (lease && !(await lease.guard("calculos", clearLocal))) {
        status("Acesso local bloqueado");
        report(lease.warning() || "O acesso local aos dados sincronizados está bloqueado.");
        return getData();
      }
      if (!settings.gistId || !settings.token) {
        status("Dados locais");
        return getData();
      }
      status("Sincronizando…");
      try {
        const snapshot = await client.gistSnapshot(settings.gistId, settings.token);
        const file = snapshot.gist.files?.[storage.FILE];
        if (file) setData(storage.save(storage.merge(getData(), JSON.parse(await client.text(file)))));
        status(settings.autoSync ? "Gist sincronizado" : "Gist conectado");
      } catch (error) {
        status("Falha na sincronização");
        report(lease?.warning?.() || error.message);
      }
      return getData();
    }

    async function toGist() {
      const settings = gistSettings.load();
      if (!settings.autoSync || !settings.gistId || !settings.token) return getData();
      status("Salvando no Gist…");
      try {
        if (lease && !lease.canSync(settings.gistId)) return getData();
        const snapshot = await client.gistSnapshot(settings.gistId, settings.token);
        const remoteFile = snapshot.gist.files?.[storage.FILE];
        let merged = getData();
        if (remoteFile) merged = storage.merge(merged, JSON.parse(await client.text(remoteFile)));
        setData(storage.save(merged));
        await client.patch(
          settings.gistId,
          settings.token,
          { [storage.FILE]: { content: JSON.stringify(getData(), null, 2) } },
          { etag: snapshot.etag },
        );
        status("Gist sincronizado");
      } catch (error) {
        status("Pendente de sincronização");
        report(lease?.warning?.() || error.message);
      }
      return getData();
    }

    return { fromGist, toGist };
  }

  return { create };
});
