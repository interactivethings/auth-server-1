const express = require('express');
const session = require('express-session');
const fetch = require('node-fetch');
const queryString = require('query-string');

const __DEV__ = process.env.NODE_ENV === 'development';
if (__DEV__) {
  require('node-env-file')(
    require('path').join(__dirname, '.env'),
    {raise: false}
  );
}
const DEFAULTS = {
  PORT: 3000
};
const PARSE = {
  CALLBACK_BASE_URLS: (value) => value.split(','),
  BASE_URL: (value) => {
    if (!__DEV__ && !value.startsWith('https://')) {
      throw new Error('BASE_URL should be https');
    }
    if(!value.endsWith('/')) {
      throw new Error('BASE_URL should include a tailing slash');
    }
    return value;
  }
};
const config = [
  'NODE_ENV', 'PORT', 'BASE_URL', 'SESSION_SECRET',
  'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'CALLBACK_BASE_URLS'
].reduce(
  (reduction, key) => {
    let value = process.env[key] || DEFAULTS[key];
    if (!value) {
      throw new Error(`Environment variable ${key} missing, see README.md#Configuration`);
    }
    if (PARSE[key]) {
      value = PARSE[key](value);
    }
    reduction[key] = value;
    return reduction;
  },
  {}
);

const app = express();
app.enable('trust proxy');
app.disable('x-powered-by');
app.use(session({
  cookie: {
    path: '/',
    httpOnly: true,
    secure: !(__DEV__ && !config.BASE_URL.startsWith('https://')),
    maxAge: null
  },
  secret: config.SESSION_SECRET,
  resave: false,
  saveUninitialized: true
}));

const verifyCallbackUrl = (url) => {
  return config.CALLBACK_BASE_URLS.some((callbackBaseUrl) => url.startsWith(callbackBaseUrl));
};

app.get('/github/callback', (request, response) => {
  if (request.query.state !== request.session.githubState) {
    response.status(404).send('Not found');
    return;
  }
  if (request.query.error) {
    response.status(500).json({
      error: request.query.error,
      error_description: request.query.error_description,
      error_uri: request.query.error_uri
    });
    return;
  }
  const parameters = {
    client_id: config.GITHUB_CLIENT_ID,
    client_secret: config.GITHUB_CLIENT_SECRET,
    code: request.query.code,
    state: request.session.githubState
  };
  fetch(
    `https://github.com/login/oauth/access_token?${queryString.stringify(parameters)}`,
    {method: 'POST', headers: {'Accept': 'application/json'}}
  )
    .then((response) => response.json().then(
      (data) => ({response, data}),
      (error) => {
        throw new Error(`Failed to parse JSON, ${error}`)
      }
    ))
    .then((result) => {
      if (result.response.ok) {
        const callbackUrl = request.session.callbackUrl;
        // reverify callback url in case of an untrustworthy session store
        if (verifyCallbackUrl(callbackUrl)) {
          response
            .status(302)
            .set(
              'Location',
              `${callbackUrl}#${queryString.stringify({
                code: result.data.access_token,
                scope: result.data.scope,
                state: parameters.state
              })}`
            )
            .end();
        } else {
          response.status(404).send('Not found');
        }
      } else {
        response.status(result.response.status).json(result.data);
      }
    })
    .catch((error) => {
      response.status(500).json({
        error: error.toString()
      })
    });
});

app.get('/github/login', (request, response) => {
  if (!verifyCallbackUrl(request.query.callbackUrl)) {
    response.status(404).send('Not found');
    return;
  }
  if (!request.query.state || request.query.state.length < 12) {
    // the client needs to generate a secret to ensure it only accepts real tokens
    response.status(400).send('A strong, user specific state parameter is required against CSRF attacks');
  }
  const parameters = {
    client_id: config.GITHUB_CLIENT_ID,
    state: request.query.state,
    scope: request.query.scope,
    redirect_uri: `${config.BASE_URL}github/callback`
  };

  request.session.callbackUrl = request.query.callbackUrl;
  request.session.githubState = request.query.state;

  response
    .status(302)
    .set('Location', `https://github.com/login/oauth/authorize?${queryString.stringify(parameters)}`)
    .end();
});

app.listen(config.PORT, () => console.info(`Listening on ${config.PORT}`)); // eslint-disable-line no-console
