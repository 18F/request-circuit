'use strict';
/* jshint -W003 */

const assert   = require('assert');
const http     = require('http');
const _        = require('lodash');

const PromiseBreaker  = require('../lib/promise-breaker');

describe('PromiseBreaker', function() {
  let breaker, attributes;
  let mockServer, timeout, port, status, message;

  before(function() {
    port = 3034;
    mockServer = http.createServer(function (req, res) {
      setTimeout((function writeResponse() {
        res.writeHead(status, {'Content-Type': 'text/plain'});
        res.end(message);
      }), timeout);
    });

    mockServer.listen(port);
    attributes = {
      url: 'http://127.0.0.1:' + port
    };
  });

  after(function() {
    mockServer.close();
  });

  beforeEach(function() {
    status = 200;
    timeout = 0;
    message = 'Oh yeah! it worked';
  });

  // NOTE: this is really a private class. I tested it in order to know it worked easier
  // than the integration tests below.
  describe('PromiseBreaker.TimeTripper (private class)', function() {
    var tripper;

    it('should emit an error when request exceeds time limit', function(done) {
      timeout = 50;
      tripper = new PromiseBreaker.TimeTripper(attributes, timeout / 2);
      tripper.on('timeout', assertError);
      function assertError(response) {
        assert.equal(response.statusCode, 500);
        assert.equal(response.body, 'Request timed out');
        done();
      }
      tripper.run();
    });

    it('should emit the success response when within time', function(done) {
      timeout = 50;
      tripper = new PromiseBreaker.TimeTripper(attributes, timeout * 2);
      tripper.on('success', assertBody);
      tripper.run();

      function assertBody(response) {
        assert.equal(response.statusCode, 200);
        assert.equal(response.body, 'Oh yeah! it worked');
        done();
      }
    });

    it('should emit a failure response when within time', function(done) {
      timeout = 50;
      status = 400;
      tripper = new PromiseBreaker.TimeTripper(attributes, timeout * 2);
      tripper.on('failure', assertBody);
      tripper.run();

      function assertBody(response) {
        assert.equal(response.statusCode, 400);
        done();
      }
    });
  });

  describe('when the breaker is below failure threshold', function() {
    beforeEach(function(done) {
      breaker  = new PromiseBreaker('geo');
      breaker.setup().then(() => done());
    });

    it('allows requests to go through and responds with promiseness', function(done) {
      breaker
        .run(attributes)
        .then((response) => {
          assert.equal(response.statusCode, 200);
          assert.equal(response.body, 'Oh yeah! it worked');
          done();
        })
        .catch(done);
    });

    it('failed requests reject the promise', function(done) {
      status = 403;
      message = 'It all went wrong';

      breaker
        .run(attributes)
        .catch(function(err) {
          assert.equal(err.message, '403: It all went wrong');
          done();
        });
    });

    it('timed out requests reject the promise after the timeout', function(done) {
      timeout = 100;
      breaker.timeout = 50;

      breaker
        .run(attributes)
        .catch(function(err) {
          assert.equal(err.message, 'Request timed out');
          done();
        });
    });

    it('failed requests increment faults on the record', function(done) {
      status = 403;
      message = 'It all went wrong';

      breaker
        .run(attributes)
        .catch(assertFailures);

      function assertFailures() {
        breaker.store
          .get(breaker.name)
          .then(function(record) {
            assert.equal(record.consec_faults, 1);
            assert.equal(record.fault_ct, 1);
            assert(record.fault_ts);
            assert(!record.tripped);
            assert(!record.trip_ts);
            done();
          });
      }
    });
  });

  describe('when the breaker is tripped because of too many consecutive faults', function() {
    beforeEach(function(done) {
      breaker = new PromiseBreaker('geo', { consecFaults: 2 });
      breaker.setup()
        .then(() => breaker.store.get('geo'))
        .then((record) => breaker.incrementFaults(record))
        .then(() => done());
    });

    it('attributes are stored on the record', function(done) {
      status = 403;
      message = 'It all went wrong';

      breaker
        .run(attributes)
        .catch(assertBreakerTripped);

      function assertBreakerTripped(response) {
        breaker.store
          .get(breaker.name)
          .then(function(record) {
            assert.equal(record.fault_ct, 2);
            assert.equal(record.consec_faults, 2);
            assert(record.tripped);
            assert(record.trip_ts);
            done();
          });
      }
    });
  });

  describe('when the breaker is tripped because of too many faults within the window', function() {
    beforeEach(function(done) {
      breaker = new PromiseBreaker('geo');
      breaker.setup()
        .then((record) => {
          return breaker.store.set(this.name, _.extend(record, {
            fault_ct: breaker.config.windowFaults - 1,
            fault_ts: Date.now() - breaker.config.faultWindow + 75
          }));
        })
        .then(() => done());
    });

    it('attributes are stored on the record', function(done) {
      status = 403;
      message = 'It all went wrong';

      breaker
        .run(attributes)
        .catch(assertBreakerTripped);

      function assertBreakerTripped() {
        breaker.store
          .get(breaker.name)
          .then(function(record) {
            assert.equal(record.fault_ct, breaker.config.windowFaults);
            assert(record.tripped);
            assert(record.trip_ts);
            done();
          });
      }
    });
  });

  describe('when the breaker has tripped', function() {
    beforeEach(function(done) {
      breaker = new PromiseBreaker('geo');
      breaker.setup()
        .then((record) => breaker.trip(record))
        .then(() => { done(); });
    });

    it('will fail fast', function(done) {
      status = 403;
      message = 'It all went wrong';

      breaker
        .run(attributes)
        .catch(assertFailFast);

      function assertFailFast(err) {
        assert(err.message, 'Circuit: geo is tripped');
        done();
      }
    });
  });

  describe('when the breaker is tripped, but the window has expired', function() {
    beforeEach(function(done) {
      breaker = new PromiseBreaker('geo');
      breaker.setup()
        .then(() => breaker.store.set(breaker.name, {
          fault_ct: 5,
          consec_faults: 3,
          tripped: true,
          trip_ts: Date.now() - breaker.config.faultWindow - 100,
          fault_ts: Date.now() - breaker.config.faultWindow - 100 }))
        .then(() => { done(); });
    });

    it('restores values on the record', function(done) {
      breaker
        .run(attributes)
        .then(() => {
          breaker.store
            .get(breaker.name)
            .then((record) => {
              assert.equal(record.fault_ct, 0);
              assert.equal(record.consec_faults, 0);
              assert.equal(record.tripped, false);
              done();
            });
        })
        .catch(done);
    });

    it('allows the request through', function(done) {
      breaker
        .run(attributes)
        .then((response) => {
          assert.equal(response.statusCode, 200);
          assert.equal(response.body, 'Oh yeah! it worked');
          done();
        })
        .catch(done);
    });
  });
});
