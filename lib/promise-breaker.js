'use strict';

const util          = require('util');
const EventEmitter  = require('events').EventEmitter;

const Promise = require('Bluebird');
const _       = require('lodash');
const request = require('request');

const recordAdapter = require('./persistence/sequelize/circuit-breaker-2');

const TIMEOUT_LIMIT       = 30 * 1000;      // 30 secords
const TRIP_DURATION       = 5  * 60 * 1000; // 5 minutes
const FAULT_WINDOW        = 10 * 60 * 1000; // 10 minutes
const WINDOW_FAULT_LIMIT  = 5;
const FAULT_LIMIT         = 3;

class PromiseBreaker {
  constructor(name, opts) {
    this.config   =  _.extend(this.defaultConfig(), opts || {});
    this.name     = name;
    this.timeout  = this.config.timoutLimit || TIMEOUT_LIMIT;
  }

  defaultConfig() {
    return {
      faultWindow:  FAULT_WINDOW,
      tripDuration: TRIP_DURATION,
      consecFaults: FAULT_LIMIT,
      windowFaults: WINDOW_FAULT_LIMIT
    };
  }

  run(attributes) {
    return Promise
      .try(() => { return this.ensureCircuitOpen(); })
      .then(() => { return this.makeRequest(attributes); });
  }

  ensureCircuitOpen() {
    return recordAdapter
      .findOrCreate(this.name, this.config)
      .then((records) => {
        var record = records[0];
        if (record.tripped && this.shouldRestore(record)) {
          return this.restore(record);
        } else if (record.tripped) {
          throw new Error('Circuit: ' + this.name + ' is tripped');
        }
      });
  }

  makeRequest(attributes) {
    return new Promise((resolve, reject) => {
      var tripper = new TimeTripper(attributes, this.timeout);

      tripper.on('timeout', (response) => {
        this.fault(new Error(response.body), reject);
      });

      tripper.on('failure', (response) => {
        this.fault(new Error(response.statusCode + ': ' + response.body), reject);
      });

      tripper.on('success', (response) => {
        resolve(response);
      });

      tripper.run();
    });
  }

  fault(err, reject) {
    recordAdapter
      .findByName(this.name)
      .then((record) => {
        if (this.shouldTrip(record)) {
          return recordAdapter.trip(record);
        } else {
          return recordAdapter.incrementFaults(record);
        }
      })
      .then(function() {
        reject(err);
      });
  }

  restore(record) {
    return recordAdapter.restore(record);
  }

  shouldTrip(record) {
    return record.consec_faults + 1 >= this.config.consecFaults ||
      Date.now() - record.fault_ts <= this.config.faultWindow;
  }

  shouldRestore(record) {
    return Date.now() - record.fault_ts > this.config.faultWindow;
  }
}

class TimeTripper {
  constructor(attributes, timeoutLimit) {
    this.attributes = attributes;
    this.timeoutLimit = timeoutLimit;
  }

  run() {
    this.timeoutId = setTimeout(this.checkResponse.bind(this), this.timeoutLimit);
    this.runAction();
  }

  runAction() {
    request(this.attributes, (err, response, body) => {
      this.timeoutId = null;
      if (response.statusCode === 200) {
        this.emit('success', response);
      } else {
        this.emit('failure', response);
      }
    });
  }

  checkResponse() {
    if (this.timeoutId) {
      this.emit('timeout', {statusCode: 500, body: 'Request timed out'});
    }
  }
}

util.inherits(TimeTripper, EventEmitter);
PromiseBreaker.TimeTripper = TimeTripper;

module.exports = PromiseBreaker;
