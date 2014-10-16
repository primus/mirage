'use strict';

var crypto = require('crypto')
  , mirage = module.exports;

mirage.client = function client(primus, options) {
  primus.mirage = primus.mirage || options.mirage || '';

  primus.on('mirage', function mirage(id) {
    primus.mirage = id;

    if (primus.buffer.length) {
      var data = primus.buffer.slice()
        , length = data.length
        , i = 0;

      primus.buffer.lenght = 0;

      for (; i < length; i++) {
        primus._write(data[i]);
      }
    }
  });

  /**
   * Add an extra _mirage key to the URL so we can figure out we have
   * a persistent session id or not.
   *
   * @param {Object} options The request options.
   * @api private
   */
  primus.on('outgoing::url', function url(options) {
    if (!primus.mirage) return;

    var querystring = primus.querystring(options.query || '');

    querystring._mirage = primus.mirage;
    options.query = primus.querystringify(querystring);
  });

  /**
   * The actual message writer.
   *
   * @NOTE: This function is an identical copy and paste from Primus's ._write
   * method. The only exception is that we added a check for `primus.mirage` to
   * determine if we are ready to write data to the server.
   *
   * @param {Mixed} data The message that needs to be written.
   * @returns {Boolean} Successful write to the underlaying transport.
   * @api private
   */
  primus._write = function write(data) {
    //
    // The connection is closed, normally this would already be done in the
    // `spark.write` method, but as `_write` is used internally, we should also
    // add the same check here to prevent potential crashes by writing to a dead
    // socket.
    //
    if (Primus.OPEN !== primus.readyState || !primus.mirage) {
      //
      // If the buffer is at capacity, remove the first item.
      //
      if (primus.buffer.length === primus.options.queueSize) {
        primus.buffer.splice(0, 1);
      }

      primus.buffer.push(data);
      return false;
    }

    primus.encoder(data, function encoded(err, packet) {
      //
      // Do a "save" emit('error') when we fail to parse a message. We don't
      // want to throw here as listening to errors should be optional.
      //
      if (err) return primus.listeners('error').length && primus.emit('error', err);
      primus.emit('outgoing::data', packet);
    });

    return true;
  };
};

/**
 * Server logic for generating session id's which the client is forced to use or
 * identify him self with.
 *
 * @param {Primus} primus Server side Primus instance.
 * @api private
 */
mirage.server = function server(primus) {
  var gen = function gen(spark, fn) {
    crypto.randomBytes(8, function generated(err, buff) {
      if (err) return fn(err);

      fn(undefined, buff.toString('hex'));
    });
  };

  var valid = function valid(id, fn) {
    return fn();
  };

  primus.id = {
    /**
     * Add a custom session id generator.
     *
     * @param {Function} fn Error first completion callback.
     * @api public
     */
    generator: function generator(fn) {
      if ('function' === typeof fn) gen = fn;

      return server;
    },

    /**
     * Add a custom session id validator.
     *
     * @param {Function} fn Error first completion callback.
     * @api public
     */
    validator: function validator(fn) {
      if ('function' === typeof fn) valid = fn;

      return server;
    }
  };

  /**
   * Intercept incoming connections and block the connection event until we've
   * gotten a valid session id.
   *
   * @param {Spark} spark Incoming connection.
   * @param {Function} fn Completion callback.
   * @api private
   */
  primus.on('connection', function connection(spark, fn) {
    spark.mirage = spark.query._mirage;
    if (spark.mirage) return valid(spark, spark.mirage, fn);

    gen(spark, function generator(err, id) {
      if (err) return fn(err);

      spark.emit('mirage', id);
      spark.mirage = id;
      fn();
    });
  });
};
