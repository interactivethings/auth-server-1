const express = require('express');
const session = require('express-session');
const path = require('path');
const crypto = require('crypto');
const env = require('node-env-file');
const fetch = require('node-fetch');
const queryString = require('query-string');

env(path.join(__dirname, '.env'), {raise: false});

const app = express();

app.enable('trust proxy');
app.use(session({
  cookie: {
    path: '/',
    httpOnly: true,
    secure: process.env.SECURE_COOKIE === 'OFF' ? false : true,
    maxAge: null
  },
  secret: process.env.SESSION_SECRET || crypto.randomBytes(64).toString('hex'),
  resave: false,
  saveUninitialized: true
}));

const callbackBaseUrls = process.env.CALLBACK_BASE_URLS.split(',');
const verifyCallbackUrl = (url) => {
  return callbackBaseUrls.some((callbackBaseUrl) => url.startsWith(callbackBaseUrl));
};

app.get('/github/callback', (request, response, next) => {
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
    client_id: process.env.GITHUB_CLIENT_ID,
    client_secret: process.env.GITHUB_CLIENT_SECRET,
    code: request.query.code,
    state: request.session.githubState
  };
  fetch(
    'https://github.com/login/oauth/access_token?' + queryString.stringify(parameters),
    {method: 'POST', headers: {'Accept': 'application/json'}}
  )
    .then((response) => response.json().then(
      (data) => ({response, data}),
      (error) => {
        throw new Error('Failed to parse JSON, ' + error)
      }
    ))
    .then((result) => {
      if (result.response.ok) {
        const callbackUrl = request.session.callbackUrl;
        // reverify callback url in case of an untrustworthy session store
        if (verifyCallbackUrl(callbackUrl)) {
          response
            .status(302)
            .set('Location', `${callbackUrl}#${queryString.stringify({
              code: result.data.access_token,
              scope: result.data.scope,
              state: parameters.state
            })}`)
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
    client_id: process.env.GITHUB_CLIENT_ID,
    state: request.query.state,
    scope: request.query.scope,
    redirect_uri: process.env.BASE_URL + 'github/callback'
  };

  request.session.callbackUrl = request.query.callbackUrl;
  request.session.githubState = request.query.state;

  response
    .status(302)
    .set('Location', 'https://github.com/login/oauth/authorize?' + queryString.stringify(parameters))
    .end();
});

const port = process.env.PORT || 3000;
app.listen(port, function () {
  console.log(`Listening on ${port}`);
});
