/*jslint sub:true */
var RESERVED_WORDS = [/^_/, /^makingmobile$/i, /^mm$/i, /^core/i],
    CFG_GATEWAY = 'gateway',
    SERVER_GATEWAY_URLSPACE = '/gateway',
    Ajax = require('./ajax'),
    AjaxGateway = require('./ajaxGateway'),
    Localstore = require('./localstore');

function slash_url(url) {
    if (url.length > 0 && url[0] !== '/') {
        url = '/' + url;
    }
    return url[url.length - 1] === '/' ? url.slice(0, url.length - 1) : url;
}

/*
 * clientSide makingMobile core class
 */
function MakingMobile(config){
    this.config = config;
    this.hasPhoneGap = document.location.protocol === 'file:' && window.device;
}

MakingMobile.prototype._envReady = function (plugins) {
    var zoneID = null,
        i, surl;
    
    this.localstore = Localstore();
    zoneID = this.localstore.get('zoneID');
    if (!zoneID && this.hasPhoneGap) {
        zoneID = device.uuid;
        this.localstore.set('zoneID', zoneID);
    }
    this.gateway = new AjaxGateway(zoneID);
    this.Ajax = Ajax;
    //so, default nameSpace is 'mm'
    this.gateway.delegate(this, 'mm');
    this.pluginManager = {};
    for (i = 0; i < plugins.length; i++) {
        plugins[i]['p']._init(this, plugins[i]['config']);
    }
    this.go('envReady', null, {to: '.'});
    if (this.config.autopen) {
        surl = (this.config.url[this.config.url.length -1] === '/' ? this.config.url.slice(0, this.config.url.length -1) : this.config.url) + slash_url(this.config.urlprefix || '');
        this.gateway.open(surl + SERVER_GATEWAY_URLSPACE);
        if (this.hasPhoneGap && navigator.connection.type === Connection.NONE) {
            this.gateway.pause();
        }
    }
};

MakingMobile.prototype._init = function(plugins) {
    var self = this;
    
    if(this.hasPhoneGap) {
        document.addEventListener("deviceready", function() {
            self._envReady(plugins);
        }, false);
        document.addEventListener("online", function() {
            self.gateway.resume();
        }, false);
        document.addEventListener("offline", function() {
            self.gateway.pause();
        }, false);
    } else {
        self._envReady(plugins);
    }
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

module.exports = MakingMobile;
