/*jslint sub:true */
var RESERVED_WORDS = [/^_/, /^makingmobile$/i, /^mm$/i, /^core/i],
    CFG_GATEWAY = 'gateway',
    SERVER_GATEWAY_URLSPACE = '/gateway',
    Ajaxlib = require('./ajax'),
    AjaxGateway = require('./ajaxGateway'),
    Localstore = require('./localstore');

/*
 * clientSide makingMobile core class
 */
function MakingMobile(config){
    var zoneID = null;
    
    this.config = config;
    this.hasPhoneGap = window.cordova !== undefined;
    this.util = require('./util');
    this.localstore = Localstore();
    zoneID = this.localstore.get('zoneID');
    this.gateway = new AjaxGateway(zoneID);
    this.Ajax = Ajaxlib;
    //so, default nameSpace is 'mm'
    this.gateway.delegate(this, 'mm');
    this.pluginManager = {};
}

MakingMobile.prototype._envReady = function () {
    var zoneID = null,
        surl;
    
    zoneID = this.localstore.get('zoneID');
    if (!zoneID && this.hasPhoneGap) {
        zoneID = device.uuid;
        this.localstore.set('zoneID', zoneID);
        this.gateway._zoneID = zoneID;
    }
    this.go('envReady', null, {to: '.'});
    if (this.config.autopen) {
        surl = this.config.url.replace(/\/$/, '') + this.util.slash_url(this.config.urlprefix || '');
        this.gateway.open(surl + SERVER_GATEWAY_URLSPACE);
        if (this.hasPhoneGap && navigator.connection.type === Connection.NONE) {
            this.gateway.pause();
        }
    }
};

MakingMobile.prototype._init = function(plugins) {
    var self = this,
        i;
    
    for (i = 0; i < plugins.length; i++) {
        plugins[i]['p']._init(this, plugins[i]['config']);
    }
    if(this.hasPhoneGap) {
        document.addEventListener("deviceready", function() {
            self._envReady();
        }, false);
        document.addEventListener("online", function() {
            self.gateway.resume();
        }, false);
        document.addEventListener("offline", function() {
            self.gateway.pause();
        }, false);
    } else {
        self._envReady();
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

/*
 * bind patch -- we just need it
 */
if (!Function.prototype.bind) {
    Function.prototype.bind = function (oThis) {
        if (typeof this !== "function") {
            // closest thing possible to the ECMAScript 5 internal IsCallable function
            throw new TypeError("Function.prototype.bind - what is trying to be bound is not callable");
        }

        var aArgs = Array.prototype.slice.call(arguments, 1), 
            fToBind = this, 
            fNOP = function () {},
            fBound = function () {
                return fToBind.apply(this instanceof fNOP && oThis ? this : oThis || window,
                        aArgs.concat(Array.prototype.slice.call(arguments)));
            };

        fNOP.prototype = this.prototype;
        fBound.prototype = new fNOP();

        return fBound;
    };
}

module.exports = MakingMobile;
