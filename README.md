# Auth Server

This express app allows the implicit grant of a GitHub oauth token to whitelisted base urls.

## Configuration

The app need following environment variables.

- `BASE_URL`, the base url (including tailing slash) where the app is running – e.g. https://my-auth.herokuapp.com/ or http://localhost:3000/
- `SESSION_SECRET`, the secret used to sign the session ID cookie
- `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`, [register a new app on GitHub](https://github.com/settings/developers) – Authorization callback URL need to be `${BASE_URL}github/callback`
- `CALLBACK_BASE_URLS`, comma separted base url allow to obtain tokens

For development you can use an `.env` file:

```
BASE_URL=
SESSION_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
CALLBACK_BASE_URLS=http://localhost:,http://localhost/
```

### Session Store

Currently it uses the default express session memory store. [Pick one suited to your backend](https://github.com/expressjs/session#compatible-session-stores) to persist the session and scale beyond one server.

## How To Use

**Send your user to the login endpoint:**

```js
const state = uuid.v4();
localStorage.setItem('state', state);
window.location = `${BASE_URL}github/login?callbackUrl=${window.href}&scope=repo&state=${state}`
```

See a [complete list of scopes](https://developer.github.com/v3/oauth/#scopes).

The auth server will lead the user through the authentication process and if they accept redirect them back to your `callbackUrl`.

**Recieve them at your callback url:**
```js
let authHash = queryString.parse(window.location.hash);
// Verification of state is a absolute must for CSRF prevention
if (authHash.state && authHash.state === localStorage.getItem('state')) {
  localStorage.setItem('auth', JSON.stringify(authHash));
  // prevent accidental auth leak and get your beatiful url again
  window.history.replaceState({}, document.title, location.href.substr(0, location.href.length - location.hash.length));
}
```

Now you have a GitHub token which you can play with.
