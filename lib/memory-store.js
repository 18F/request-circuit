'use strict';

const Promise = require('bluebird');

class MemoryStore {
  constructor() {
    this.store = {};
  }

  get(name) {
    return new Promise((resolve) => {
      resolve(this.store[name] || null);
    });
  }

  set(name, attributes) {
    return new Promise((resolve) => {
      resolve(this.store[name] = attributes);
    });
  }

  destroy(name) {
    return new Promise((resolve) => {
      delete this.store[name];
      resolve();
    });
  }
}

module.exports = MemoryStore;
