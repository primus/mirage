'use strict';

var debug = require('diagnostics')('primus:mirage')
  , crypto = require('crypto')
  , one = require('one-time')
  , mirage = module.exports;

/**
 * The client interface of the mirage client.
 *
 * @param {Primus} primus The Primus connection.
 * @param {Object} options The supplied options from the new Primus constructor
 * @api public
 */
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
 * @param {Object} options The supplied options to the Primus constructor.
 * @api private
 */
mirage.server = function server(primus, options) {
  /**
   * Generator of session ids. It should call the callback with a string that
   * should be used as session id. If a generation failed you should set an
   * error as first argument in the callback.
   *
   * This function will only be called if there is no id sent with the request.
   *
   * @param {Spark} spark The incoming connection.
   * @param {Function} fn Completion callback.
   * @api public
   */
  var gen = function gen(spark, fn) {
    crypto.randomBytes(8, function generated(err, buff) {
      if (err) return fn(err);

      fn(undefined, buff.toString('hex'));
    });
  };

  /**
   * Simple validator function for when a user connects with an existing id.
   *
   * @param {String} id The id that we've received from the client.
   * @param {Function} fn Completion callback.
   * @api public
   */
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
     * The maximum time it should take to validate or generate a session id. If
     * a timeout occurs all messages will be flushed and the callback with be
     * called with an error.
     *
     * @type {Number}
     * @api public
     */
    timeout: options['mirage timeout'] || 5000,

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
    debug('validating new incoming connection');

    spark.mirage = spark.query._mirage;
    spark.buffer = [];

    /**
     * A simple callback wrapping that ensures that we flush the messages that
     * we've buffered while we were generating or validating and id. If we
     * receive an error, we just ignore all received messages and assume they
     * are evil.
     *
     * @param {Error} err An error that we've received.
     * @api public
     */
    var next = one(function processed(err) {
      var buffer = spark.buffer;
      spark.buffer = null;

      if (err) {
        debug('failed to process request due to %s', err.message);
        return fn(err);
      } else fn();

      //
      // We need to send the buffer after we've called the `fn` callback so we
      // no longer block the `connection` event. After this we've given the user
      // time enough to assign a `data` listener to their `spark` instance and
      // we can safely re-transform the data.
      //
      debug('writing %d queued messages to spark', buffer.length);
      buffer.forEach(function each(packet) {
        spark.transforms(primus, spark, 'incoming', packet.data, packet.raw);
      });
    });

    //
    // Prevent the validation or generation from taking to much time. Add
    // a timeout.
    //
    var timeout = setTimeout(function timeout() {
      next(new Error('Failed to '+ (spark.mirrage ? 'validate' : 'generate') +' id in a timely manner'));
    }, primus.id.timeout);

    if (spark.mirage) {
      debug('found existing mirage id (%s) in query, validating', spark.mirage);
      return valid.call(primus, spark, next);
    }

    debug('generating new id as none was supplied');
    gen.call(primus, spark, function generator(err, id) {
      if (err) return next(err);

      spark.emit('mirage', id);
      spark.mirage = id;

      next();
    });
  });

  /**
   * Add a incoming message transformer so we can buffer messages that arrive
   * while we are generating or validating an id.
   *
   * @param {Object} packet The incoming data message.
   * @returns {Boolean|Undefined}
   * @api public
   */
  primus.transform('incoming', function incoming(packet) {
    if (this.buffer) {
      this.buffer.push(packet);
      return false;
    }
  });
};
