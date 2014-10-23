# Mirage

Some might say that Mirage was created with a silver sparkplug in his mouth. On
Cybertron, he was one of the planet's elite upper class, preferring to spend his
days hunting turbo-foxes instead of involving himself in conflict. He is armed
with a rifle which fires explosive, armor-piercing darts, but the most important
piece of his arsenal in his function as a spy is his shoulder-mounted
electro-disruptor, which can bend photons to make Mirage invisible, or appear to
be where he is not, or even alter his physical appearance, hence his name.

His invisibility is invaluable for Primus. He now spends his time validating and
generating session ids without the user even know it's there. It's a fully
transparent process, it's invisible, it's Mirage. The generated session id's can
be persisted if needed.

## Installation

This is a plugin for the Primus framework and can be installed using `npm`:

```
npm install --save mirage
```

The `--save` tells `npm` to automatically add the installed version to your
package.json.

This module assumes that you're also using the `primus-emit` module plugin for
emitting events. If you don't have it added a plugin please see the [relevant
installation instructions](https://github.com/primus/emit) on how to do so.

## Usage

The `mirage` plugin should be the first plugin you load in Primus. This is
because it will buffer incoming messages while it's validating or generating
messages. If this is done last, **you will experiance loss of data/messages!**
Event if you're using the `fortess-maximus` plugin, this should be loaded before
that.

To add this plugin to your Primus server simply call the `.use` method on the
Primus instance:

```js
primus.use('mirage', require('mirage'));
```

Now that you've added the plugin, a new object, `.id` is available on your Primus
instance. This object allows you to interact with the `mirage` plugin.

### primus.id.timeout

The maximum time it should take to validate or generate a session id. If
a timeout occurs all messages will be flushed and the callback with be called
with an error. You can assign the timeout directly using:

```js
primus.id.timeout = 2000;
```

It's also possible to configure this value directly through the `new Primus`
options by setting the `mirage timeout` option:

```js
var primus = new Primus(httpsserver, {
  'transformer': 'engine.io',
  'mirage timeout': 5000
});
```

### primus.id.generator

The generator method allows you to assign a custom id generator. By default we
generate 8 random bytes using the `crypto` module. To set your own id generator
simply call the `primus.id.generator` with the function you want to use instead.

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

The validator method will be called when we've received a pre-defined id. By
default we just allow all the things, but this can be overridden by supplying
the `primus.id.validator` with a custom validator function.

The supplied function will receive 2 arguments:

1. `session` The session id that we've received and that needs to be validated.
2. `function` An error first callback. If you fail to validate the id, we assume
   that you pass this function an `Error` instance as first argument.

```js
primus.id.validator(function validator(id, fn) {
  accountdb.exists(id, function (err, exists) {
    if (!err && !exists) err = new Error('Invalid id');

    fn(err);
  });
});
```

## License

MIT
