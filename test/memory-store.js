'use strict';
/* jshint expr: true */

const expect      = require('chai').expect;
const MemoryStore = require('../lib/memory-store');

describe('memory-store', () => {
  let testStore;

  beforeEach(() => {
    testStore = new MemoryStore();
  });

  describe('object properties', () => {
    it('should have a store object', () => {
      expect(testStore.store).to.be.a('object');
    });

    it('should have a get() method', () => {
      expect(testStore.get).to.be.a('function');
    });

    it('should have a set() method', () => {
      expect(testStore.set).to.be.a('function');
    });

    it('should have a destroy() method', () => {
      expect(testStore.destroy).to.be.a('function');
    });
  });

  describe('#set()', () => {
    it('should return a promise', (done) => {
      expect(testStore.set('promiseTest').constructor.name).to.be.equal('Promise');
      done();
    });

    it('should return create a record if it does not exist', (done) => {
      testStore.set('createsRow', { exists: true})
      .then((row) => {
        expect(row).to.be.a('object');
        expect(testStore.store.createsRow).to.exist;
        expect(row.exists).to.be.true;
        done();
      });
    });

    it('should update a record if it already exists', (done) => {
      testStore.set('updatesRow', {})
      .then(() => { return testStore.set('updatesRow', { updated: true });
      })
      .then((updatedRow) => {
        expect(updatedRow.updated).to.exist;
        expect(updatedRow.updated).to.be.true;
        done();
      });
    });
  });

  describe('#get()', () => {
    beforeEach((done) => {
      testStore.set('getRow', { iAmAlive: true })
      .then(() => done());
    });

    it('should return a promise', (done) => {
      expect(testStore.get('getRow').constructor.name).to.be.equal('Promise');
      done();
    });

    it('should return null if no row exists', (done) => {
      testStore.get('spoon')
      .then((result) => {
        expect(result).to.be.null;
        done();
      });
    });

    it('should return the record of the existent named row', (done) => {
      testStore.get('getRow')
      .then((row) => {
        expect(row).to.exist;
        expect(row.iAmAlive).to.exist;
        expect(row.iAmAlive).to.equal.true;
        done();
      });
    });
  });

  describe('#destroy()', () => {
    beforeEach((done) => {
      testStore.set('destroyRow', { iAmAlive: true })
      .then(() => done());
    });

    it('should return a promise', (done) => {
      expect(testStore.destroy('allthethings').constructor.name).to.be.equal('Promise');
      done();
    });

    it('should resolve a promise and remove the row from store', (done) => {
      testStore.destroy('destroyRow')
      .then(() => {
        expect(testStore.store).to.be.empty;
        done();
      });
    });
  });
});
