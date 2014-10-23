/* istanbul ignore next */
describe('mirage', function () {
  'use strict';

  var assume = require('assume')
    , Primus = require('primus')
    , mirage = require('./')
    , portnumbers = 1024
    , primus;

  beforeEach(function each(next) {
    var port = portnumbers++;

    primus = Primus.createServer({
      iknowhttpsisbetter: true,
      listening: next,
      port: port
    });

    primus.port = port;
    primus.use('emit', require('primus-emit'));
  });

  describe('.id', function () {
    it('adds a .id to the server', function () {
      assume(primus.id).to.be.a('undefined');

      primus.use('mirage', mirage);

      assume(primus.id).to.be.a('object');
      assume(primus.id.generator).to.be.a('function');
      assume(primus.id.validator).to.be.a('function');
    });
  });

  describe('.id.generator', function () {
    it('calls the generator function & sends to client', function (next) {
      primus.use('mirage', mirage);

      primus.on('connection', function connection(spark) {
        assume(spark.mirage).to.equal('foo');
      });

      primus.id.generator(function generator(spark, fn) {
        fn(undefined, 'foo');
      });

      var client = new primus.Socket('http://localhost:'+ primus.port);

      client.on('mirage', function (id) {
        assume(client.mirage).to.equal(id);
        assume(id).to.equal('foo');

        client.end();
        next();
      });
    });

    it('generates things by default', function (next) {
      primus.use('mirage', mirage);

      var client = new primus.Socket('http://localhost:'+ primus.port);

      client.on('mirage', function (id) {
        assume(client.mirage).to.equal(id);
        assume(id.length).to.be.above(8);
        assume(id).to.be.a('string');

        client.end();
        next();
      });
    });
  });

  describe('.id.timeout', function () {
    it('is a number', function () {
      primus.use('mirage', mirage);

      assume(primus.id.timeout).is.a('number');
    });

    it('can be set by default through the constructor', function () {
      var p = new Primus(require('http').createServer(), {
        'mirage timeout': 12345678
      });

      p.use('emit', require('primus-emit'));
      p.use('mirage', mirage);

      assume(p.id.timeout).equals(12345678);
    });

    it('will timeout a validation request', function (next) {
      primus.use('mirage', mirage);

      primus.id.timeout = 100;
      primus.id.validator(function validator(spark, fn) {
        spark.on('error', function (err) {
          assume(err.message).to.include('timely manner');
          next();
        });
      });

      var client = new primus.Socket('http://localhost:'+ primus.port, {
        mirage: 'ohai'
      });
    });

    it('will timeout a generator request', function (next) {
      primus.use('mirage', mirage);

      primus.id.timeout = 100;
      primus.id.generator(function validator(spark, fn) {
        spark.on('error', function (err) {
          assume(err.message).to.include('timely manner');
          next();
        });
      });

      var client = new primus.Socket('http://localhost:'+ primus.port);
    });
  });

  describe('.id.validator', function () {
    it('accepts all the things by default', function (next) {
      primus.use('mirage', mirage);

      primus.on('connection', function (spark) {
        assume(spark.mirage).to.equal('lol');
        spark.end();
        next();
      });

      var client = new primus.Socket('http://localhost:'+ primus.port, {
        mirage: 'lol'
      });
    });

    it('allows pre-setting of mirage id through constructor', function (next) {
      primus.use('mirage', mirage);

      primus.id.validator(function validator(spark, fn) {
        assume(spark.query).to.be.a('object');
        assume(spark.mirage).to.equal('ohai');

        fn(new Error('I SHOULD BE OK'));
      });

      var client = new primus.Socket('http://localhost:'+ primus.port, {
        mirage: 'ohai'
      });

      client.on('end', next);
    });

    it('validates the client mirage if send', function (next) {
      primus.use('mirage', mirage);

      primus.id.validator(function validator(spark, fn) {
        assume(spark.query).to.be.a('object');
        assume(spark.mirage).to.equal('ohai');

        fn(new Error('I SHOULD BE OK'));
      });

      var client = new primus.Socket('http://localhost:'+ primus.port, {
        manual: false
      });

      client.mirage = 'ohai';
      client.on('end', next);
    });

    it('should queue written messages until id is received', function (next) {
      primus.use('mirage', mirage);

      primus.on('connection', function (spark) {
        assume(spark.mirage).to.equal('bar');

        spark.on('data', function (msg) {
          assume(spark.mirage).to.equal('bar');
          assume(msg).to.equal('foo');

          spark.end();
          next();
        });
      });

      primus.id.generator(function generator(spark, fn) {
        fn(undefined, 'bar');
      });

      var client = new primus.Socket('http://localhost:'+ primus.port);
      client.write('foo');
    });

    it('should queue messages until id is validated', function (next) {
      primus.use('mirage', mirage);

      primus.on('connection', function (spark) {
        assume(spark.mirage).to.equal('foo');

        spark.on('data', function (msg) {
          assume(spark.mirage).to.equal('foo');
          assume(spark.buffer).to.equal(null);
          assume(msg).to.equal('bar');

          spark.end();
          next();
        });
      });

      primus.id.validator(function (spark, fn) {
        assume(spark.mirage).equals('foo');

        setTimeout(function () {
          fn();
        }, 200);
      });

      var client = new primus.Socket('http://localhost:'+ primus.port, {
        mirage: 'foo'
      });

      client.write('bar');
    });

    it('can override the id', function (next) {
      primus.use('mirage', mirage);

      primus.on('connection', function (spark) {
        assume(spark.mirage).to.equal('new');
        spark.on('end', next);
      });

      primus.id.validator(function generator(spark, fn) {
        assume(spark.mirage).equals('old');

        setTimeout(function () {
          fn(undefined, 'new');
        }, 10);
      });

      var client = new primus.Socket('http://localhost:'+ primus.port, {
        mirage: 'old'
      });

      client.on('mirage', function (id) {
        assume(id).equals('new');
        client.end();
      });
    });
  });
});
