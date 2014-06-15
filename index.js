'use strict';

var crypto = require('crypto');

//
// Export the exports as mirage so we can expose our plugin interface.
//
var mirage = module.exports;

/**
 * The code that runs on the Primus client.
 *
 * @param {Primus} primus The primus client instance.
 * @api private
 */
mirage.client = function client(primus) {
  var crypto = 'undefined' !== typeof window
    && window.crypto
    && 'function' === typeof window.crypto.getRandomValues;

  /**
   * Generate a new guid for a given user. This guid is used as session
   *
   * @returns {String}
   * @api public
   */
  primus.guid = primus.guid || crypto ? function guidstrong() {
    var bytes = new Uint16Array(8);
    window.crypto.getRandomValues(bytes);

    function section(index) {
      var value = bytes[index].toString(16);

      while (value.length < 4) value = '0'+ value;
      return value;
    }

    return [
      section(0) + section(1),
      section(2),
      section(3),
      section(4),
      section(5) + section(6) + section(7)
    ].join('-');
  } : function guid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (char) {
      var random = Math.random() * 16 | 0;
      return (char !== 'x' ? (random & 0x3 | 0x8) : random).toString(16);
    });
  };

  primus.on('outgoing::url', function url(options) {
    var querystring = primus.querystring(options.query || '');

    querystring._mirage = session;
    options.query = primus.querystringify(querystring);
  });
};

/**
 * The code that runs on the Primus server.
 *
 * @param {Primus} primus The primus server instance.
 * @api private
 */
mirage.server = function server(primus) {
  var Spark = primus.Spark;

  /**
   * Introduce a new property on the Spark's prototype so we can access our
   * persistent session.
   *
   * @returns {String}
   * @api public
   */
  Object.defineProperty(Spark.prototype, 'session', {
    get: function get() {
      return crypto.createHash('md5')
        .update(this.query._mirage + this.headers.useragent)
        .digest('hex');
    }
  });
};
