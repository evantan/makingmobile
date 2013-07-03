/*global require, window, module*/
/*jslint bitwise: true*/

(function () {
    "use strict";

    var Gateway = require('../../lib/eventGateway/gateway.js'),
        util = require("util"),
        ajax = require("./ajax.js"),
        //Constants
        NAMESPACE = 'gateway',
        EVENT_OFFLINE = NAMESPACE + ':offline',
        EVENT_ONLINE = NAMESPACE + ':online',
        EVENT_LOSE = NAMESPACE + ':lose',
        META_FROM = 'from',
        META_TO = 'to',
        ZONE_ALL = '*',
        ZONE_LOCAL = '.',
        SEND_URL = '/uplink',
        RECV_URL = '/downlink',
        POLL_INTERVAL = 1000 * 60 * 1,
        HEARTBEAT_INTERVAL = 1000 * 5,
        AJAX_TIMEOUT = 1000 * 3,
        MAXERR = 3,
        _logerr = function (e) {
            if (this.console && this.console.error) {
                this.console.error(e);
            }
        };

    function cl(msg) {
        console.log('----- ' + msg);
    }

    function BidiLink(gw, config) {
        var self = this,
            p;

        this.config = {
            url: null,
            maxerr: MAXERR,
            heartbeat_interval: HEARTBEAT_INTERVAL,
            poll_interval: POLL_INTERVAL,
            ajax_timeout: AJAX_TIMEOUT
        };
        for (p in config) {
            if (config.hasOwnProperty(p)) {
                this.config[p] = config[p];
            }
        }

        this.remoteZone = null;
        this._offline = true;
        this._closed = false;
        this._suspended = true;
        this._buff = [];
        this._errCount = 0;
        this._sending = false;
        this._sendingEvent = null;
        this._recvingEvents = null;
        this._heartbeatTimer = null;
        this._downlinkAjaxTimer = null;
        this._downlinkAjax = ajax();
        this._uplinkAjax = ajax();
        this.gw = gw;
        this.resume();
    }

    BidiLink.prototype.pause = function () {
        if (this._suspended) {
            return;
        }
        this._suspended = true;
        this.disconnect();
    };
    
    BidiLink.prototype.resume = function () {
        var self = this;
        if (!this._suspended) {
            return;
        }
        this._suspended = false;
        this.downCallback("null");
        setTimeout(function() {
            self.sendHeartbeat();
        }, 100);
    };
    
    BidiLink.prototype.downCallback = function (txt) {
        var self = this,
            msg = null,
            eventId = null,
            jsonObj;

        if (self._closed) {
            return;
        }
        try {
            msg = JSON.parse(txt);
        } catch (e) {
            _logerr(e);
        }
        if (msg) {
            eventId = msg.eventId;
            if (eventId !== -1) {
                self.gw._remoteRecv(msg.type, msg.data, msg.meta);
            }
        }
        jsonObj = {
            eventId: -2,
            type: 'ack',
            data: eventId,
            meta: {}
        };
        jsonObj.meta[META_FROM] = this.gw.getZone();
        self._recvingEvents = JSON.stringify(jsonObj);
        window.clearTimeout(self._downlinkAjaxTimer);
        self._downlinkAjaxTimer = window.setTimeout(function () {
            if (!self._downlinkAjax) {
                return;
            }
            self._downlinkAjax.send(self.config.url + RECV_URL, self._recvingEvents, self.config.poll_interval, function(txt) {
                self.downCallback(txt);
                //cl('downlink connect success!');
            }, function() {
                self.ajaxError('recv');
            });
        }, 0);
    };

    BidiLink.prototype.markSuccess = function () {
        this._errCount = 0;
        if (this._offline) {
            this._offline = false;
            this.gw.emit(EVENT_ONLINE, this.remoteZone, {
                to: ZONE_LOCAL
            });
        }
    };

    BidiLink.prototype.markFailure = function () {
        var self = this;

        try {
            window.clearTimeout(this._downlinkAjaxTimer);
            this._downlinkAjax.abort();
        } catch (ignore) {}
        this.downCallback("null");

        this._errCount += 1;
        if (!this._closed && !this._offline && (this._errCount > this.config.maxerr)) {
            this._offline = true;
            this.gw.emit(EVENT_OFFLINE, this.remoteZone, {
                to: ZONE_LOCAL
            });
        }  
        if (this._offline) {
            if (this._heartbeatTimer) {
                window.clearTimeout(this._heartbeatTimer);
            }
            this._heartbeatTimer = window.setTimeout(function () {
                self.sendHeartbeat();
            }, this.config.heartbeat_interval);
        } else {
            this.sendHeartbeat();
        }
    };

    BidiLink.prototype.upCallback = function (txt) {
        var seObj = JSON.parse(this._sendingEvent),
            rspObj;
        this._sending = false;
        try {
            rspObj = JSON.parse(txt);
            if (!this.remoteZone) {
                this.remoteZone = rspObj.meta[META_FROM];
            }
            this.markSuccess();
            if (seObj.eventId !== -1 && rspObj.data !== seObj.eventId) {
                this.gw.emit(EVENT_LOSE, {
                    eventId: seObj.eventId,
                    type: seObj.type,
                    data: seObj.data,
                    meta: seObj.meta
                }, {
                    to: ZONE_LOCAL
                });
            } else {
                this._sendingEvent = JSON.stringify({eventId: -1});
            }
            this.sendBuff();
        } catch (e) {
            cl('not a jsonObj: ' + txt);
            this.markFailure();
        }
    };

    BidiLink.prototype.ajaxError = function (source) {
        var self = this,
            downlinkAjaxWait = 0,
            jsonObj;

        if (self._closed) {
            return;
        }
        if (source === 'recv') {
            if (self._suspended) {
                return;
            }
            this._errCount += 1;
            if (this._errCount > this.config.maxerr) {
                //Too many errors, wait a little bit
                downlinkAjaxWait = self.config.heartbeat_interval;
            }
            window.clearTimeout(self._downlinkAjaxTimer);
            self._downlinkAjaxTimer = window.setTimeout(function () {
                if (!self._downlinkAjax) {
                    return ;
                }
                self._downlinkAjax.send(self.config.url + RECV_URL, self._recvingEvents, self.config.poll_interval, function(txt) {
                    self.downCallback(txt);
                }, function() {
                    self.ajaxError('recv');
                });
            }, downlinkAjaxWait);
        } else if (source === 'send') {
            self._sending = false;
            self.markFailure();
            jsonObj = JSON.parse(self._sendingEvent);
            if (jsonObj.eventId !== -1) {
                self.gw.emit(EVENT_LOSE, {
                    eventId: jsonObj.eventId,
                    type: jsonObj.type,
                    data: jsonObj.data,
                    meta: jsonObj.meta
                }, {
                    to: ZONE_LOCAL
                });
            }
            if (self._suspended) {
                return;
            }
            self.sendBuff();
        }
    };

    BidiLink.prototype.sendBuff = function () {
        var self = this,
            item;

        if (self._closed) {
            return;
        }
        item = self._buff.shift();
        if (item) {
            self._sending = true;
            self._sendingEvent = item;
            self._uplinkAjax.send(self.config.url + SEND_URL, item, self.config.ajax_timeout, function(txt) {
                self.upCallback(txt);
            }, function() {
                self.ajaxError('send');
            });
        }
        if (self._heartbeatTimer) {
            window.clearTimeout(self._heartbeatTimer);
        }
        self._heartbeatTimer = window.setTimeout(function () {
            self.sendHeartbeat();
        }, self.config.heartbeat_interval);
    };

    BidiLink.prototype.send = function (eventId, type, data, meta) {
        var self = this,
            copy;

        try {
            copy = {
                eventId: eventId,
                type: type,
                data: data,
                meta: meta || {}
            };
            copy.meta[META_FROM] = this.gw.getZone();
            //buff always save a copy, not ref
            copy = JSON.stringify(copy);
        } catch (e) {
            _logerr(e);
            return;
        }
        self._buff.push(copy);
        if (!self._sending) {
            self.sendBuff();
        }
    };

    BidiLink.prototype.sendHeartbeat = function () {
        this.send(-1, 'heartbeat');
    };

    BidiLink.prototype.disconnect = function () {
        var jsonObj = this._sendingEvent ? JSON.parse(this._sendingEvent) : {eventId: -1},
            arr = [],
            i;

        if (jsonObj.eventId !== -1) {
            arr.push(jsonObj);
        }
        for (i = 0; i < this._buff.length; i += 1) {
            jsonObj = JSON.parse(this._buff[i]);
            if (jsonObj.eventId !== -1) {
                arr.push(jsonObj);
            }
        }
        for (i = 0; i < arr.length; i += 1) {
            this.gw.emit(EVENT_LOSE, {
                eventId: arr[i].eventId,
                type: arr[i].type,
                data: arr[i].data,
                meta: arr[i].meta
            }, {
                to: ZONE_LOCAL
            });
        }

        if (!this._offline) {
            this._offline = true;
            this.gw.emit(EVENT_OFFLINE, this.remoteZone, {
                to: ZONE_LOCAL
            });
        }
        window.clearTimeout(this._heartbeatTimer);
        window.clearTimeout(this._downlinkAjaxTimer);
        try {
            this._downlinkAjax.abort();
            this._uplinkAjax.abort();
        } catch (ignore) {}

        this._buff = [];
        this._errCount = 0;
        this._sending = false;
    };
    
    BidiLink.prototype.cleanup = function () {
        this.disconnect();
        this._closed = true;
        this.gw = null;
        this._downlinkAjax = null;
        this._uplinkAjax = null;
    };


    function AjaxGateway(zone) {
        if (!(this instanceof AjaxGateway)) {
            return new AjaxGateway(zone);
        }
        Gateway.call(this);

        this._zoneID = typeof zone === 'string' && zone.length > 1 ? zone : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0,
                v = c === 'x' ? r : r & 0x3 | 0x8;
            return v.toString(16);
        });

        this._zoneBidiLinks = {};
    }

    util.inherits(AjaxGateway, Gateway);

    AjaxGateway.prototype.isOnline = function (zoneORurl) {
        var key = this._zone2key(zoneORurl);
        return key && !this._zoneBidiLinks[key]._offline;
    };
    
    AjaxGateway.prototype.isPaused = function (zoneORurl) {
        var key = this._zone2key(zoneORurl);
        return !key || this._zoneBidiLinks[key]._suspended;
    };

    AjaxGateway.prototype._zone2key = function (zone) {
        var z;
        for (z in this._zoneBidiLinks) {
            if (this._zoneBidiLinks.hasOwnProperty(z) && (z === zone || this._zoneBidiLinks[z].remoteZone === zone)) {
                return z;
            }
        }
        return false;
    };

    AjaxGateway.prototype.open = function (urlORconfig) {
        var config, z, dzk;

        config = typeof urlORconfig === 'string' ? {url: urlORconfig} : urlORconfig;

        if (!config || !config.url) {
            throw 'Lack url';
        }
        if (this._zoneBidiLinks[config.url]) {
            return;
        }
        for (z in this._zoneBidiLinks) {
            if (this._zoneBidiLinks.hasOwnProperty(z) && this._zoneBidiLinks[z].config.defaultZone) {
                dzk = z;
            }
        }
        if (!dzk) {
            config.defaultZone = true;
        } else if (config.defaultZone) {
            this._zoneBidiLinks[dzk].config.defaultZone = false;
        }
        this._zoneBidiLinks[config.url] = new BidiLink(this, config);
    };
    
    /*
     * Get all remote zones. First zone is default zone.
     */
    AjaxGateway.prototype.getRemoteZones = function () {
        var arr = [],
            z, defaultZone;
        for (z in this._zoneBidiLinks) {
            if (this._zoneBidiLinks.hasOwnProperty(z)) {
                if (this._zoneBidiLinks[z].config.defaultZone) {
                    defaultZone = this._zoneBidiLinks[z].remoteZone;
                } else {
                    arr.push(this._zoneBidiLinks[z].remoteZone);
                }
            }
        }
        arr.unshift(defaultZone);
        return arr;
    };

    AjaxGateway.prototype.close = function (zoneORurl) {
        var key, z;

        if (zoneORurl === undefined) {
            //close all
            for (z in this._zoneBidiLinks) {
                if (this._zoneBidiLinks.hasOwnProperty(z)) {
                    this._zoneBidiLinks[z].cleanup();
                    delete this._zoneBidiLinks[z];
                }
            }
        } else {
            key = this._zone2key(zoneORurl);
            if (key) {
                this._zoneBidiLinks[key].cleanup();
                delete this._zoneBidiLinks[key];
            }
        }
    };
    
    AjaxGateway.prototype.pause = function (zoneORurl) {
        var key, z;

        if (zoneORurl === undefined) {
            //pause all
            for (z in this._zoneBidiLinks) {
                if (this._zoneBidiLinks.hasOwnProperty(z)) {
                    this._zoneBidiLinks[z].pause();
                }
            }
        } else {
            key = this._zone2key(zoneORurl);
            if (key) {
                this._zoneBidiLinks[key].pause();
            }
        }
    };
    
    AjaxGateway.prototype.resume = function (zoneORurl) {
        var key, z;

        if (zoneORurl === undefined) {
            //resume all
            for (z in this._zoneBidiLinks) {
                if (this._zoneBidiLinks.hasOwnProperty(z)) {
                    this._zoneBidiLinks[z].resume();
                }
            }
        } else {
            key = this._zone2key(zoneORurl);
            if (key) {
                this._zoneBidiLinks[key].resume();
            }
        }
    };

    //Overload emit to set default target zone
    AjaxGateway.prototype.emit = function (type, data, meta) {
        var m = meta || {},
            z;
        if (!m[META_TO]) {
            m[META_TO] = this.getZone();
            for (z in this._zoneBidiLinks) {
                if (this._zoneBidiLinks.hasOwnProperty(z) && this._zoneBidiLinks[z].config.defaultZone) {
                    m[META_TO] = this._zoneBidiLinks[z].remoteZone || m[META_TO];
                    break;
                }
            }
        }
        return Gateway.prototype.emit.call(this, type, data, m);
    };

    AjaxGateway.prototype._remoteSend = function (eventId, type, data, meta) {
        var targetZone = meta[META_TO],
            sent = false,
            z;

        if (targetZone === ZONE_ALL) {
            for (z in this._zoneBidiLinks) {
                if (this._zoneBidiLinks.hasOwnProperty(z) && !this._zoneBidiLinks[z]._offline) {
                    this._zoneBidiLinks[z].send(eventId, type, data, meta);
                }
            }
            sent = true;
        } else {
            for (z in this._zoneBidiLinks) {
                if (this._zoneBidiLinks.hasOwnProperty(z) && !this._zoneBidiLinks[z]._offline && this._zoneBidiLinks[z].remoteZone === meta[META_TO]) {
                    this._zoneBidiLinks[z].send(eventId, type, data, meta);
                    sent = true;
                    break;
                }
            }
        }
        if (!sent) {
            this.emit(EVENT_LOSE, {
                eventId: eventId,
                type: type,
                data: data,
                meta: meta
            }, {
                to: ZONE_LOCAL
            });
        }
    };

    module.exports = AjaxGateway;

}());
