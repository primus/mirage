# Mirage

[![Version npm](https://img.shields.io/npm/v/mirage.svg?style=flat-square)](http://browsenpm.org/package/mirage)[![Build Status](https://img.shields.io/github/workflow/status/primus/mirage/CI/master?label=CI&style=flat-square)](https://github.com/primus/mirage/actions?query=workflow%3ACI+branch%3Amaster)[![Dependencies](https://img.shields.io/david/primus/mirage.svg?style=flat-square)](https://david-dm.org/primus/mirage)[![Coverage Status](https://img.shields.io/coveralls/primus/mirage/master.svg?style=flat-square)](https://coveralls.io/r/primus/mirage?branch=master)[![IRC channel](https://img.shields.io/badge/IRC-irc.freenode.net%23primus-00a8ff.svg?style=flat-square)](https://webchat.freenode.net/?channels=primus)

Some might say that Mirage was created with a silver sparkplug in his mouth. On
Cybertron, he was one of the planet's elite upper class, preferring to spend his
days hunting turbo-foxes instead of involving himself in conflict. He is armed
with a rifle which fires explosive, armor-piercing darts, but the most important
piece of his arsenal in his function as a spy is his shoulder-mounted
electro-disruptor, which can bend photons to make Mirage invisible, or appear to
be where he is not, or even alter his physical appearance, hence his name.

His invisibility is invaluable for Primus. He now spends his time validating and
generating session ids without the user even know it's there. It's a fully
transparent process, it's invisible, it's Mirage. The generated session ids can
be persisted if needed.

## Installation

This is a plugin for the Primus framework and can be installed using `npm`:

```
npm install --save mirage
```

The `--save` tells `npm` to automatically add the installed version to your
package.json.

This module assumes that you're using either the [`primus-emit`](https://github.com/primus/emit)
or the [`primus-emitter`](https://github.com/cayasso/primus-emitter) module,
for emitting events. Please see their sites to get detailed installation
instructions.

## Table of Contents

- [Usage server](#usage-server)
  - [primus.id.timeout](#primusidtimeout)
  - [primus.id.generator](#primusidgenerator)
  - [primus.id.validator](#primusidvalidator)
- [Usage client](#usage-client)

## Usage server

The `mirage` plugin should be the first plugin you load in Primus. This is
because it will buffer incoming messages while it's validating or generating
an id. If you don't do this, **you will experience loss of data/messages!**.
Even the [`fortess-maximus`](https://github.com/primus/fortress-maximus) plugin,
that is generally added as the first plugin, should be loaded after `mirage`.

To add this plugin to your Primus server simply call the `.plugin` method on the
Primus instance:

```js
primus.plugin('mirage', require('mirage'));
```

Now that you've added the plugin, a new object, `.id` is available on your Primus
instance. This object allows you to interact with the `mirage` plugin.

### primus.id.timeout

The maximum time it should take to validate or generate a session id. If
a timeout occurs all messages will be flushed and the callback will be called
with an error. You can assign the timeout directly using:

```js
primus.id.timeout = 2000;
```

It's also possible to configure this value using the `mirage timeout` option
in the Primus constructor:

```js
var primus = new Primus(httpsserver, {
  'transformer': 'engine.io',
  'mirage timeout': 5000
});
```

### primus.id.generator

The generator method allows you to assign a custom id generator. By default we
generate 8 random bytes using the `crypto` module. To set your own generator
simply call the `primus.id.generator` with the function that you want to use.

The supplied function will receive 2 arguments:

1. `spark` A reference to the spark instance that is attempting to connect to
   your server.
2. `function` An error first callback which assumes to receive an error as first
   argument if generation failed and the generated id as second argument.

```js
primus.id.generator(function generate(spark, fn) {
  asyncLookup(spark.query.customquerystring, function (err, account) {
    if (err) return fn(err);

    fn(undefined, account._id);
  });
});
```

### primus.id.validator

The validator method is called when we receive a pre-defined id. By default
we just allow all the things, but this can be overridden by supplying the
`primus.id.validator` with a custom validator function.

The supplied function will receive 2 arguments:

1. `spark` A reference to the spark instance that is attempting to connect to
  your server.
2. `function` An error first callback. If you fail to validate the id, we assume
  that you pass this function an `Error` instance as first argument.

```js
primus.id.validator(function validator(spark, fn) {
  accountdb.exists(spark.mirage, function (err, exists) {
    if (!err && !exists) err = new Error('Invalid id');

    fn(err);
  });
});
```

As you can see in the example above, the mirage `id` is introduced on the spark
as `spark.mirage`. You can use this id to validate the connection. Now there are
cases where you don't want to end the connection by supplying the callback with
an error but you actually want to re-set a new session id. Well that's also
possible with the validator as it can also act as a generator. To generate a
new session id you can call the callback with the new id as the second argument:

```js
primus.id.validator(function validate(spark, fn) {
  if (spark.mirage === 'old') return fn(undefined, 'new');
  if (spark.mirage === 'new') return fn(undefined, 'old');

  fn(new Error('The id is neither new or old'));
});
```

## Usage client

The plugin also ships with a client API. This client API can be used for
persisting the sessions across reconnects, refreshes and more. To re-use an id
simply add the `mirage` option in the client when connecting.

```js
var socket = new Primus('https://example.org', {
  mirage: readcookie('sessionid')
});
```

When you receive a new session id from the server we emit a `mirage` event:

```js
socket.on('mirage', function (id) {
  savecookie('sessionid', id);
});
```

The id is also always available at: `socket.mirage`, but this is only after the
connection has generated an id or if you've manually supplied it.

## License

[MIT](LICENSE)
