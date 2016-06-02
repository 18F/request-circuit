request-breaker
===============

This is a Node.js module, which follows the circuit breaker pattern, used for gracefully handling failures when communicating with distributed services. In order to ensure that a user has a consistent and error free experience, we need to insulate them from non-responding or overloaded service providers.

### Usage

```js
const breaker = new CircuitBreaker('recaptcha');

breaker.run({ url: 'https://gettheweather.io' })
  .then((response) => {
    res.json({status: 'success'});
  });
  .catch((err) => {
    // Request failed or circuit breaker has been tripped
    res.json({status: 'failed'})

  });
```

# Storage Interfaces

Out of the box, `request-breaker` uses an in-memory storage mechanism for keeping track of request failures and successes. However, there are use cases when a service needs to turned off globally from all processes and across all instances and we will need to keep track of a breakers state in a centralized place (ie, Redis). `request-breaker` offers the ability to override the in-memory store mechanism with your own interface.

**Example**
```js
const new CircuitBreaker({
  store: new CustomStore()
});
```

Your interface needs implement the following methods and must return a bluebird promise:

### store.get(name)

This method is used to fetch a specific circuit breaker from the storage mechanism.

### store.set(name, object)

This will be used by `request-breaker` to upsert a breaker with it's configuration and needed parameters.

### store.destroy(name)

Used to remove a record from storage. Should resolve successfully even if no record was found.
