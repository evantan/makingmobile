var RESERVED_WORDS = [/^_/, /^makingmobile$/i, /^mm$/i, /^core/i],
    CFG_SERVER_GATEWAY = 'gateway',
    PLUGIN_PREFIX = 'makingmobile-plugin-',
    GATEWAY_URLSPACE = '/gateway',
    express = require('express'),
    BusGateway = require('./eventGateway/busGateway'),
    path = require('path'),
    fs = require('fs');


/*
 * nodeSide makingMobile framework core class
 */
function MakingMobile(){
    this.config = null;
    this.util = require('./util');
}

MakingMobile.prototype._init = function (config, rootdir) {
    var url = null,
        user_main_entry = null,
        post_init = null,
        i, MongoStore, sessionOption;
    
    this.config = config;
    this.express = express;
    this.rootdir = rootdir;
    this.gateway = new BusGateway(config[CFG_SERVER_GATEWAY] || {});
    //so, default nameSpace is 'mm'
    this.gateway.delegate(this, 'mm');
    this.pluginManager = {};
    process.env.NODE_ENV = config.debug === true ? "development" : "production";
    this.app = express();
    this.app.use(this.util.slash_url(config.urlprefix || '') + GATEWAY_URLSPACE, this.gateway.dispatch());
    for (url in config.static) {
        if (config.static.hasOwnProperty(url)) {
            this.app.use(this.util.slash_url(config.urlprefix || '') + url, this.express.static(path.resolve(rootdir, config.static[url])));
        }
    }
    
    for (i = 0; i < config.plugins.length; i++) {
        require(PLUGIN_PREFIX + config.plugins[i].name).init(this);
    }
    if (config.session.enabled) {
        sessionOption = config.session.options;
        if (config.session['store-name'] === 'mongodb') {
            MongoStore = require('connect-mongo')(this.express);
            sessionOption.store = new MongoStore(config.session['db-options']);
        }
        this.app.use(this.express.cookieParser());
        this.app.use(this.express.session(sessionOption));
    }
    if (!fs.existsSync(path.resolve(rootdir, config.main || "server/app.js"))) {
        console.warn('Entry script no found. Check "main" field in mmconfig.json');
    } else {
        user_main_entry = require(path.resolve(rootdir, config.main || "server/app.js"));
    }
    for (i = 0; i < config.plugins.length; i++) {
        post_init = require(PLUGIN_PREFIX + config.plugins[i].name).post_init;
        if (typeof post_init === 'function') {
            post_init(this);
        }
    }
    
    if (user_main_entry && (typeof user_main_entry.createServer === 'function')) {
        user_main_entry.createServer(config);
    } else {
        this._createServer(config);
    }
};

MakingMobile.prototype._createServer = function (config) {
    //http only. https will be add before version 1.0
    var http = require('http');

    http.createServer(this.app).listen(config.port, function(){
        console.log('MakingMobile server listening on port ' + config.port);
    });
};

/*
 * Register a plugin into mm instance.
 *      plugin: plugin class instance
 *      mmPropName: a string name, use as a mm property: mm.plugin1, mm.plugin2..
 */
MakingMobile.prototype.register = function (plugin, mmPropName) {
    var i;
    for (i = 0; i < RESERVED_WORDS.length; i++) {
        if ((RESERVED_WORDS[i] instanceof RegExp && mmPropName.match(RESERVED_WORDS[i])) || 
                (RESERVED_WORDS[i] === mmPropName)) {
            throw 'MakingMobile.prototype.register: plugin name is a reserved word (' + mmPropName + ')';
        }
        if (this.hasOwnProperty(mmPropName)) {
            throw 'MakingMobile.prototype.register: plugin name has been occupied (' + mmPropName + ')';
        }
    }
    this[mmPropName] = this.pluginManager[mmPropName] = plugin;
};



//Singleton
module.exports = new MakingMobile();
