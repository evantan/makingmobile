var RESERVED_WORDS = [/^_/, /^makingmobile$/i, /^mm$/i, /^core/i],
    CFG_SERVER_GATEWAY = 'gateway',
    PLUGIN_PREFIX = 'makingmobile-plugin-',
    GATEWAY_URLSPACE = '/gateway',
    express = require('express'),
    BusGateway = require('./eventGateway/busGateway');


/*
 * nodeSide makingMobile framework core class
 */
function MakingMobile(){
    this.config = null;
}

MakingMobile.prototype.slash_url = function (url) {
    if (url.length > 0 && url[0] !== '/') {
        url = '/' + url;
    }
    return url[url.length - 1] === '/' ? url.slice(0, url.length - 1) : url;
};

MakingMobile.prototype._init = function (config, rootdir) {
    var url = null,
        i, user_main_entry;
    
    this.config = config;
    this.express = express;
    this.gateway = new BusGateway(config[CFG_SERVER_GATEWAY] || {});
    //so, default nameSpace is 'mm'
    this.gateway.delegate(this, 'mm');
    this.pluginManager = {};
    for (i = 0; i < config.plugins.length; i++) {
        require(PLUGIN_PREFIX + plugins[i].name).init(this);
    }
    process.env.NODE_ENV = config.debug === true ? "development" : "production";
    this.app = express();
    this.app.use(this.slash_url(config.urlprefix || '') + GATEWAY_URLSPACE, this.gateway.dispatch());
    for (url in config.static) {
        if (config.static.hasOwnProperty(url)) {
            this.app.use(this.slash_url(config.urlprefix || '') + url, this.express.static(path.resolve(rootdir, config.static[url])));
        }
    }
    
    user_main_entry = require(path.resolve(rootdir, config.main || "server/app.js"));
    for (i = 0; i < config.plugins.length; i++) {
        require(PLUGIN_PREFIX + plugins[i].name).post_init(this);
    }
    
    if (typeof user_main_entry.createServer === 'function') {
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
