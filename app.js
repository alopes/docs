/**
 * Module dependencies.
 */

var redirect = require("express-redirect");
var prerender = require('prerender-node');
var passport = require('passport');
var markdocs = require('markdocs');
var express = require('express');
var nconf = require('nconf');
var https = require('https');
var http = require('http');
var path = require('path');
var fs = require('fs');
var default_callback = require('./lib/default_callback');

var app = redirect(express());

nconf
  .use("memory")
  .argv()
  .env()
  .file({ file: process.env.CONFIG_FILE || path.join(__dirname, "config.json")})
  .defaults({
    'db' :               'mongodb://localhost:27017/auth11',
    'sessionSecret':     'auth11 secret string',
    'COOKIE_SCOPE':      process.env.NODE_ENV === 'production' ? '.auth0.com' : null,
    'DOMAIN_URL_SERVER': '{tenant}.auth0.com:3000',
    'DOMAIN_URL_APP':    'localhost:8989',
    'DOMAIN_URL_SDK':    'login-dev.auth0.com:3000',
    'PACKAGER_URL':      'http://localhost:3001',
    'DOMAIN_URL_DOCS':   'https://localhost:5050',
    'WIDGET_FALLBACK_CLIENTID': 'aCbTAJNi5HbsjPJtRpSP6BIoLPOrSj2C',
    'LOGIN_WIDGET_URL':  'https://cdn.auth0.com/w2/auth0-widget-2.6.min.js',
    'AUTH0JS_URL':       'https://cdn.auth0.com/w2/auth0-1.6.4.min.js',
    'AUTH0_ANGULAR_URL': 'http://cdn.auth0.com/w2/auth0-angular-1.1.js',
    'SENSITIVE_DATA_ENCRYPTION_KEY': '0123456789',
    'HMAC_ENCRYPTION_KEY': 'abcdefghij',
    'PUBLIC_ALLOWED_TUTORIALS': '/adldap-auth?,/adldap-x?,/adfs?',
    'AUTH0_TENANT': 'auth0-dev',
    'AUTH0_CLIENT_ID':   'aCbTAJNi5HbsjPJtRpSP6BIoLPOrSj2C',
    'PRERENDER_ENABLED': false
  });


if (nconf.get('db')) {
  console.log('db is ' + nconf.get('db'));
}

if (nconf.get('NEWRELIC_KEY')) {
  require('newrelic');
}

if (!nconf.get('LOGIN_WIDGET_URL')) {
  nconf.set('LOGIN_WIDGET_URL', 'https://' + nconf.get('DOMAIN_URL_SDK') + '/w2/auth0-widget.min.js');
}

if (!nconf.get('AUTH0JS_URL')) {
  nconf.set('AUTH0JS_URL', 'https://' + nconf.get('DOMAIN_URL_SDK') + '/w2/auth0.min.js');
}

if (!nconf.get('AUTH0_DOMAIN') && nconf.get('AUTH0_TENANT') && nconf.get('DOMAIN_URL_SERVER')) {
  nconf.set('AUTH0_DOMAIN', nconf.get('DOMAIN_URL_SERVER').replace('{tenant}', nconf.get('AUTH0_TENANT')));
}

if (nconf.get('PRERENDER_SERVICE_URL')) {
  prerender.set('prerenderServiceUrl', nconf.get('PRERENDER_SERVICE_URL'));
};

if (nconf.get('PRERENDER_TOKEN')) {
  prerender.set('prerenderToken', nconf.get('PREPRENDER_TOKEN'));
};

if (nconf.get('PRERENDER_PROTOCOL')) {
  prerender.set('protocol', nconf.get('PRERENDER_PROTOCOL'));
};

var connections = require('./lib/connections');
var clients     = require('./lib/clients');

require('./lib/setupLogger');
var winston = require('winston');

passport.serializeUser(function(user, done) {
  if (!nconf.get('db')) {
    return done(null, user);
  }
  done(null, user.id);
});

passport.deserializeUser(function(id, done) {
  if (!nconf.get('db')) {
    return done(null, id);
  }

  var getDb = require('./lib/data');
  getDb(function(db){
    var userColl = db.collection("tenantUsers");
    userColl.findOne({id: id}, done);
  });
});

//force https
app.configure('production', function(){

  this.use(function(req, res, next){
    if (nconf.get('dontForceHttps') || req.originalUrl === '/test') return next();

    if(req.headers['x-forwarded-proto'] !== 'https')
      return res.redirect(nconf.get('DOMAIN_URL_DOCS') + req.url);

    next();
  });
});

app.configure(function(){
  this.set("view engine", "jade");

  if (nconf.get('PRERENDER_ENABLED')) {
    // Add swiftype UserAgent bot
    prerender.crawlerUserAgents.push('Swiftbot');
    prerender.crawlerUserAgents.push('Slackbot-LinkExpanding');
    // add prerender middleware
    this.use(prerender);
  };

  this.use('/test', require('./lib/test-ping'));

  this.use(express.logger('dev'));

  this.use(function (req, res, next) {
    res.set({
      'Access-Control-Allow-Origin': (process.env.NODE_ENV === 'production' ? 'https' : 'http') + '://' + nconf.get('DOMAIN_URL_APP')
    });
    next();
  });

  this.use(express.cookieParser());

  this.use(express.session({
    secret: nconf.get("sessionSecret"),
    store: require('./lib/sessionStore'),
    key: "auth0l", cookie: {
      domain:   nconf.get('COOKIE_SCOPE'),
      path:     '/',
      httpOnly: true,
      maxAge:   null,
      secure:   !nconf.get('dontForceHttps') && nconf.get('NODE_ENV') === 'production'
    }
  }));

  this.use(express.favicon());
  this.use(express.logger('dev'));
  this.use(express.bodyParser());
  this.use(express.methodOverride());
  this.use(passport.initialize());
  this.use(passport.session());
  this.use(require('./lib/set_current_tenant'));
  this.use(require('./lib/set_user_is_owner'));
  this.use(this.router);
});

app.get('/widget', function (req, res) {
  res.redirect('/login-widget2');
});

app.get('/ticket/step', function (req, res) {
  if (!req.query.ticket) return res.send(404);
  connections.getCurrentStep(req.query.ticket, function (err, currentStep) {
    if (err) return res.send(500);
    if (!currentStep) return res.send(404);
    res.send(currentStep);
  });
});

app.get('/switch', function (req, res) {
  req.session.current_tenant = req.query.tenant;
  res.redirect('/');
});

var defaultValues = function (req, res, next) {
  res.locals.account = {};
  res.locals.account.clientParam = '';
  res.locals.account.userName     = '';
  res.locals.account.appName      = 'YOUR_APP_NAME';
  res.locals.account.tenant       = 'YOUR_TENANT';
  res.locals.account.namespace    = 'YOUR_NAMESPACE';
  res.locals.account.clientId     = 'YOUR_CLIENT_ID';
  res.locals.account.clientSecret = 'YOUR_CLIENT_SECRET';
  res.locals.account.callback     = default_callback.get(req) || 'http://YOUR_APP/callback';

  next();
};

var embedded = function (req, res, next) {
  res.locals.embedded = false;
  if (req.query.e || req.query.callback) {
    res.locals.base_url = nconf.get('DOMAIN_URL_DOCS');
    res.locals.embedded = true;
  }

  if (req.query.callback) {
    res.locals.jsonp = true;
  }

  next();
};

var overrideIfAuthenticated = function (req, res, next) {
  winston.debug('user', req.user);

  if (!req.user || !req.user.tenant) {
    return next();
  }

  res.locals.user = {
    tenant: req.user.tenant,
    tenants: req.user.tenants
  };

  var queryDoc = {
    tenant: req.user.tenant
  };

  if (req.session.selectedClient) {
    queryDoc.clientID = req.session.selectedClient;
  }

  clients.find(queryDoc, function (err, clients) {
    if (err) {
      winston.error("error: " + err);
      return next(err);
    }

    // filter user's clients
    if (!req.user.is_owner) {
      clients = clients.filter(function (c) {
        return c.owners && ~c.owners.indexOf(req.user.id);
      });
    }

    var globalClient = {}, nonGlobalClients = [];

    clients.forEach(function (client) {
      if (client.global) {
        globalClient = client;
        return;
      }

      nonGlobalClients.push(client);
    });

    res.locals.account = res.locals.account || {};
    res.locals.account.loggedIn = true;
    res.locals.account.userName = req.user.name;

    res.locals.account.namespace = nconf.get('DOMAIN_URL_SERVER').replace('{tenant}', req.user.tenant);
    res.locals.account.tenant = req.user.tenant;

    res.locals.account.globalClientId = globalClient.clientID || 'YOUR_GLOBAL_CLIENT_ID';
    res.locals.account.globalClientSecret = globalClient.clientSecret;

    if (nonGlobalClients.length === 0) {
      return next();
    }

    res.locals.account.clients = nonGlobalClients;

    var client = nonGlobalClients[0];
    res.locals.account.appName = client.name && client.name.trim !== '' ? client.name : 'Your App';
    res.locals.account.clientId = client.clientID;
    res.locals.account.clientParam = '&clientId=' + client.clientID;
    res.locals.account.clientSecret = client.clientSecret;
    res.locals.account.callback = client.callback;

    next();
  });
};

var overrideIfClientInQsForPublicAllowedUrls = function (req, res, next) {

  var allowed = nconf.get('PUBLIC_ALLOWED_TUTORIALS').split(',').some(function (allowedUrl) {
    return req.originalUrl.indexOf(allowedUrl) === 0;
  });

  if (!allowed) return next();
  if (!req.query || !req.query.a) return next();

  clients.findByClientId(req.query.a, { signingKey: 0 }, function (err, client) {
    if (err) { return next(err); }
    if (!client) {
      return res.send(404, 'client not found');
    }

    res.locals.account.appName      = client.name && client.name.trim !== '' ? client.name : 'Your App';
    res.locals.account.namespace    = nconf.get('DOMAIN_URL_SERVER').replace('{tenant}', client.tenant);
    res.locals.account.tenant       = client.tenant;
    res.locals.account.clientId     = client.clientID;
    res.locals.account.clientParam = '&clientId=' + client.clientID;
    res.locals.account.clientSecret = 'YOUR_CLIENT_SECRET'; // it's a public url (don't share client secret)
    res.locals.account.callback     = client.callback;
    res.locals.connectionName       = req.query.conn;

    next();
  });
};

var overrideIfClientInQs = function (req, res, next) {
  if (!req.query || !req.query.a) { return next(); }
  if (!req.user || !req.user.tenant) { return next(); }

  clients.findByTenantAndClientId(req.user.tenant, req.query.a, function (err, client) {
    if (err) { return next(err); }
    if (!client) { return res.send(404, 'client not found'); }
    if (!req.user.is_owner && (!client.owners || client.owners.indexOf(req.user.id) < 0)) {
      return res.send(401);
    }

    res.locals.account.appName      = client.name && client.name.trim !== '' ? client.name : 'Your App';
    res.locals.account.namespace    = nconf.get('DOMAIN_URL_SERVER').replace('{tenant}', client.tenant);
    res.locals.account.tenant       = client.tenant;
    res.locals.account.clientId     = client.clientID;
    res.locals.account.clientParam = '&clientId=' + client.clientID;
    res.locals.account.clientSecret = client.clientSecret;
    res.locals.account.callback     = client.callback;
    res.locals.connectionName       = req.query.conn;

    next();
  });
};

var appendTicket = function (req, res, next) {
  res.locals.ticket = 'YOUR_TICKET';
  res.locals.connectionDomain = 'YOUR_CONNECTION_NAME';
  res.locals.connectionName = res.locals.connectionName || 'YOUR_CONNECTION_NAME';
  if (!req.query.ticket) return next();
  connections.findByTicket(req.query.ticket, function (err, connection) {
    if (err) return res.send(500);
    if (!connection) return res.send(404);
    res.locals.ticket = req.query.ticket;
    res.locals.connectionDomain = connection.options.tenant_domain;
    res.locals.connectionName = connection.name;
    next();
  });
};

/**
 * Add quickstart collections for initialization
 * with server matching versioning for SEO and sitemap.xml
 */

var collections = require('./lib/quickstart-collections');

var quickstartCollections = function (req, res, next) {
  if (res.locals.quickstart != null) return next();
  res.locals.quickstart = {};
  res.locals.quickstart.apptypes = collections.apptypes;
  res.locals.quickstart.clientPlatforms = collections.clientPlatforms;
  res.locals.quickstart.nativePlatforms = collections.nativePlatforms;
  res.locals.quickstart.hybridPlatforms = collections.hybridPlatforms;
  res.locals.quickstart.serverPlatforms = collections.serverPlatforms;
  res.locals.quickstart.serverApis = collections.serverApis;
  next();
}

/**
 * Manage redirect 301 for deprecated links
 * to point to new links or documents
 */

require('./lib/redirects')(app);

/**
 * Register quickstart routes as an alias to index `/`
 * So that the tutorial navigator gets to load
 * quickstart collections and render
 */

var quickstartRoutes = require('./lib/quickstart-routes');

quickstartRoutes.forEach(function(route) {
  app.get('/quickstart' + route, alias('/'));
});

app.get('/quickstart', alias('/'));

function alias(route) {
  return function(req, res, next) {
    req.url = route;
    next();
  }
}

var includes = require('./lib/includes/includes');
includes.init(path.join(__dirname, '/docs/includes'));

/**
 * Create and boot DocsApp as `Markdocs` app
 */

var docsapp = new markdocs.App(__dirname, '', app);
docsapp.addPreRender(defaultValues);
docsapp.addPreRender(includes.add);
docsapp.addPreRender(overrideIfAuthenticated);
docsapp.addPreRender(overrideIfClientInQs);
docsapp.addPreRender(overrideIfClientInQsForPublicAllowedUrls);
docsapp.addPreRender(appendTicket);
docsapp.addPreRender(quickstartCollections);
docsapp.addPreRender(embedded);
docsapp.addPreRender(function(req,res,next){
  var scheme = process.env.NODE_ENV === 'production' ? 'https' : 'http';

  res.locals.uiURL              = scheme + '://' + nconf.get('DOMAIN_URL_APP');
  res.locals.uiURLLoginCallback = res.locals.uiURL + '/callback';
  res.locals.sdkURL             = scheme + '://' + nconf.get('DOMAIN_URL_SDK');

  if (res.locals.account && res.locals.account.clientId) {
    res.locals.uiAppSettingsURL = res.locals.uiURL + '/#/applications/' + res.locals.account.clientId + '/settings';
    res.locals.uiAppAddonsURL = res.locals.uiURL + '/#/applications/' + res.locals.account.clientId + '/addons';
  }

  function removeScheme(url) {
    return url.slice(url.indexOf(':') + 1);
  }

  // Auth0 client side Javascript URLs to use
  res.locals.auth0js_url                  = nconf.get('AUTH0JS_URL');
  res.locals.auth0js_url_no_scheme        = removeScheme(nconf.get('AUTH0JS_URL'));

  res.locals.auth0_angular_url            = nconf.get('AUTH0_ANGULAR_URL');
  res.locals.auth0_angular_url_no_scheme  = removeScheme(nconf.get('AUTH0_ANGULAR_URL'));

  res.locals.widget_url                   = nconf.get('LOGIN_WIDGET_URL');
  res.locals.widget_url_no_scheme         = removeScheme(nconf.get('LOGIN_WIDGET_URL'));

  res.locals.hasCallback = res.locals.account && !!res.locals.account.callback;

  // defualt values
  if (res.locals.account) {
    res.locals.account.callback = res.locals.account.callback ||
                                  default_callback.get(req) ||
                                  'http://YOUR_APP/callback';
  }

  next();
});

docsapp.addPreRender(require('./lib/external/middleware'));
docsapp.addPreRender(require('./lib/sdk/middleware'));
docsapp.addPreRender(require('./lib/sdk2/middleware'));
docsapp.addPreRender(require('./lib/sdk2/middleware-browser'));
docsapp.addPreRender(require('./lib/middlewares').configuration);
docsapp.addExtension(require('./lib/extensions').lodash);
require('./lib/sdk/demos-routes')(app);
require('./lib/sdk2/demos-routes')(app);
require('./lib/sdk2/snippets-routes')(app);
require('./lib/packager')(app, overrideIfAuthenticated);
require('./lib/sitemap')(app);


/**
 * Export `docsapp` or boot a new https server
 * with it
 */

if (!module.parent) {
  var server;
  if (process.env.NODE_ENV === 'production') {
    server = http.createServer(app);
  } else {
    var options = {
      key:  fs.readFileSync('./localhost.key'),
      cert: fs.readFileSync('./localhost.pem')
    };

    server = https.createServer(options, app)
                  .on('error', function (err) {
                    if(err.errno === 'EADDRINUSE'){
                      console.log('error when running http server on port ', port, '\n', err.message);
                      process.exit(1);
                    }
                  });
  }

  var port = nconf.get('PORT') || 5050;
  server.listen(port, function () {
    console.log('Server listening on https://localhost:'  + port);
  });
} else {
  module.exports = docsapp;
}
