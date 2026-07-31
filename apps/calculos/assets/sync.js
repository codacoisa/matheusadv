((root, factory) => {
  const api = factory();
  root.OfficeJurCalculationSync = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  "use strict";

  function create(options = {}) {
    const {
      storage, gistSettings, gistClient, getData, setData, setStatus, notify,
    } = options;
    if (!storage || !gistSettings || !gistClient || !getData || !setData)
      throw new Error("A sincronização dos cálculos não foi configurada.");

    const status = (message) => {
      if (typeof setStatus === "function") setStatus(message);
    };
    const report = (message) => {
      if (typeof notify === "function") notify(message, true);
    };

    async function fromGist() {
      const settings = gistSettings.load();
      if (!settings.gistId || !settings.token) {
        status("Dados locais");
        return getData();
      }
      status("Sincronizando…");
      try {
        const snapshot = await gistClient.gistSnapshot(settings.gistId, settings.token);
        const file = snapshot.gist.files?.[storage.FILE];
        if (file) setData(storage.save(storage.merge(getData(), JSON.parse(await gistClient.text(file)))));
        status(settings.autoSync ? "Gist sincronizado" : "Gist conectado");
      } catch (error) {
        status("Falha na sincronização");
        report(error.message);
      }
      return getData();
    }

    async function toGist() {
      const settings = gistSettings.load();
      if (!settings.autoSync || !settings.gistId || !settings.token) return getData();
      status("Salvando no Gist…");
      try {
        const snapshot = await gistClient.gistSnapshot(settings.gistId, settings.token);
        const remoteFile = snapshot.gist.files?.[storage.FILE];
        let merged = getData();
        if (remoteFile) merged = storage.merge(merged, JSON.parse(await gistClient.text(remoteFile)));
        setData(storage.save(merged));
        await gistClient.patch(
          settings.gistId,
          settings.token,
          { [storage.FILE]: { content: JSON.stringify(getData(), null, 2) } },
          { etag: snapshot.etag },
        );
        status("Gist sincronizado");
      } catch (error) {
        status("Pendente de sincronização");
        report(error.message);
      }
      return getData();
    }

    return { fromGist, toGist };
  }

  return { create };
});
