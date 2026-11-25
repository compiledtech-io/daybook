'use strict';

(() => {
  const bridge = window.DaybookAndroid;
  if (!bridge) return;

  const pending = new Map();
  let sequence = 0;

  window.daybookAndroidResult = (request, status, payload) => {
    const operation = pending.get(request);
    if (!operation) return;
    pending.delete(request);
    if (status === 'ok') operation.resolve(payload);
    else if (status === 'cancel') operation.reject(new DOMException('File picker canceled.', 'AbortError'));
    else operation.reject(new Error(payload));
  };

  function request(method, ...args) {
    return new Promise((resolve, reject) => {
      const id = String(++sequence);
      pending.set(id, { resolve, reject });
      try {
        bridge[method](id, ...args);
      } catch (error) {
        pending.delete(id);
        reject(error);
      }
    });
  }

  class DocumentHandle {
    constructor({ id, name }) {
      this.id = id;
      this.name = name;
    }

    async getFile() {
      const encoded = await request('read', this.id);
      const bytes = Uint8Array.from(atob(encoded), value => value.charCodeAt(0));
      return new File([bytes], this.name, { type: 'text/csv' });
    }

    async isSameEntry(other) {
      return bridge.sameDocument(this.id, other.id);
    }

    async createWritable() {
      let contents;
      return {
        write: async value => { contents = value; },
        close: async () => { await request('write', this.id, contents); },
        abort: async () => { contents = undefined; }
      };
    }
  }

  async function pick(mode, name = '') {
    return new DocumentHandle(await request('pick', mode, name));
  }

  window.showOpenFilePicker = async () => [await pick('open')];
  window.showSaveFilePicker = ({ suggestedName }) => pick('create', suggestedName);
  window.DaybookFiles = {
    async saveCopy(contents, name) {
      await request('saveCopy', name, contents);
    }
  };
})();
