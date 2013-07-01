/*jslint sub:true*/
var Gateway = require('./gateway.js'),
    util = require("util"),
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
    AJAX_TIMEOUT = 1000 * 3,
    HEARTBEAT_INTERVAL = 1000 * 10 + AJAX_TIMEOUT,
    MAXERR = 3,
    _logerr = function (e) {
        if (console && console.error) {
            console.error(e);
        }
    };

//debug
function cl(msg) {
    var d = new Date();
    d = d.getMinutes() + ':' + d.getSeconds();
    console.log(d + ':----- ' + msg);
}

function BusGateway(config) {
    var p = null;

    if (!(this instanceof BusGateway)) {
        return new BusGateway(config);
    }
    Gateway.call(this);

    this.config = {
        ajax_timeout: AJAX_TIMEOUT,
        heartbeat_interval: HEARTBEAT_INTERVAL,
        maxerr: MAXERR,
        zoneID: 'MakingMobile Backend',
        whiteList: [new RegExp('^.*$')],
        blackList: []
    };
    config = config || {};
    for (p in config) {
        if (config.hasOwnProperty(p) && config[p] !== null && config[p] !== undefined) {
            this.config[p] = config[p];
        }
    }

    this._zoneID = this.config.zoneID;
    this._zones = {};
}

util.inherits(BusGateway, Gateway);

BusGateway.prototype._validGateway = function (zone) {
    var i, len, item;

    for (i = 0, len = this.config.blackList.length; i < len; i += 1) {
        item = this.config.blackList[i];
        if ((item instanceof RegExp && zone.match(item)) || item === zone) {
            return false;
        }
    }
    for (i = 0, len = this.config.whiteList.length; i < len; i += 1) {
        item = this.config.whiteList[i];
        if ((item instanceof RegExp && zone.match(item)) || item === zone) {
            return true;
        }
    }
    return false;
};

BusGateway.prototype.dispatch = function () {
    var self = this;

    return function (req, res, next) {
        var txt = '',
            jsonObj;
        if (req.url !== SEND_URL && req.url !== RECV_URL) {
            return next();
        }
        req.on('readable', function () {
            txt += req.read();
        });
        req.on('end', function () {
            try {
                jsonObj = JSON.parse(txt);
                if (!jsonObj.meta || !jsonObj.meta[META_FROM]) {
                    return res.send(400, 'Bad data');
                }
                //Check only new guys
                if (!self._zones[jsonObj.meta[META_FROM]]) {
                    if (!self._validGateway(jsonObj.meta[META_FROM])) {
                        return res.send(403, 'Access denied');
                    }
                }
                res.setHeader('Content-Type', 'text/plain');
                res.setHeader('Access-Control-Allow-Credentials', 'true');
                res.setHeader('Access-Control-Allow-Headers', req.headers['Access-Control-Request-Headers'] || 'origin, content-type');
                res.setHeader('Access-Control-Allow-Origin', req.headers['origin'] || '*');
                res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
                res.setHeader('Access-Control-Max-Age', '3628800');
                if (req.url === SEND_URL) {
                    self._uplinkRecv(jsonObj, req, res);
                } else {
                    self._downlinkRecv(jsonObj, req, res);
                }
            } catch (e) {
                cl('got e on dispatch: ' + e);
                res.send(400, 'Bad data');
            }
        });
    };
};

BusGateway.prototype._uplinkRecv = function (jsonObj, req, res) {
    var self = this,
        zone = self._zones[jsonObj.meta[META_FROM]];
    
    cl('got uplinkRecv' + JSON.stringify(jsonObj));
    if (!zone) {
        //uplink should send package AFTER downlink has established
        setTimeout(function () {
            var zone = self._zones[jsonObj.meta[META_FROM]];
            if (!zone) {
                cl('gateway not found');
                res.send(200, 'Gateway not found');
            } else {
                cl('retry _uplinkRecv');
                self._uplinkRecv(jsonObj, req, res);
            }
        }, AJAX_TIMEOUT / 10);
        return;
    }
    if (zone.timer) {
        clearTimeout(zone.timer);
    }
    zone.timer = setTimeout(function() {
        self.closeZone(jsonObj.meta[META_FROM]);
    }, self.config.heartbeat_interval);

    if (jsonObj.eventId === -1) {
        //this is heartbeat package
        //cl('got heartbeat!');
        res.send(200, {
            eventId: -2,
            type: 'ack',
            data: -1,
            meta: {
                from: this.getZone()
            }
        });
    } else {
        res.send(200, {
            eventId: -2,
            type: 'ack',
            data: jsonObj.eventId,
            meta: {
                from: this.getZone()
            }
        });
        this._remoteRecv(jsonObj.type, jsonObj.data, jsonObj.meta);
    }
};

BusGateway.prototype._downlinkRecv = function (jsonObj, req, res) {
    var self = this,
        zone = self._zones[jsonObj.meta[META_FROM]],
        se;
    
    cl('got downlinkRecv' + JSON.stringify(jsonObj));
    if (!zone) {
        self._zones[jsonObj.meta[META_FROM]] = {
            timer: null,
            buff: [],
            req: req,
            res: res,
            sendingEvent: '{"eventId": -1}',
            sending: false,
            errCount: 0
        };
        zone = self._zones[jsonObj.meta[META_FROM]];
        self.emit(EVENT_ONLINE, jsonObj.meta[META_FROM], {
            to: ZONE_LOCAL
        });
    } else {
        zone.req = req;
        zone.res = res;
        zone.sending = false;
        se = JSON.parse(zone.sendingEvent);
        if (se.eventId !== -1 && jsonObj.data !== se.eventId) {
            self.emit(EVENT_LOSE, {
                eventId: se.eventId,
                type: se.type,
                data: se.data,
                meta: se.meta
            }, {
                to: ZONE_LOCAL
            });
            zone.errCount += 1;
            cl('errCount++!');
            if (zone.errCount > self.config.maxerr) {
                self.closeZone(jsonObj.meta[META_FROM]);
            }
        } else {
            zone.errCount = 0;
        }
        zone.sendingEvent = '{"eventId": -1}';
    }

    self._sendBuff(jsonObj.meta[META_FROM]);

    if (zone.timer) {
        clearTimeout(zone.timer);
    }
    zone.timer = setTimeout(function() {
        self.closeZone(jsonObj.meta[META_FROM]);
    }, self.config.heartbeat_interval);

    /*
    req.on('close', function() {
        cl('on req close!');
        zone.req = null;
        zone.res = null;
        if (zone.timer) {
            clearTimeout(zone.timer);
        }
        zone.timer = setTimeout(function() {
            self.closeZone(jsonObj.meta[META_FROM]);
        }, self.config.heartbeat_interval);
    }); */
};

BusGateway.prototype._remoteSend = function (eventId, type, data, meta) {
    var targetZone = meta[META_TO], 
        z = null;

    if (targetZone === ZONE_ALL) {
        for (z in this._zones) {
            if (this._zones.hasOwnProperty(z)) {
                this._send(targetZone, eventId, type, data, meta);
            }
        }
    } else {
        z = this._zones[targetZone];
        if (!z) {
            this.emit(EVENT_LOSE, {
                eventId: eventId,
                type: type,
                data: data,
                meta: meta
            }, {
                to: ZONE_LOCAL
            });
        } else {
            this._send(targetZone, eventId, type, data, meta);
        }
    }
};

BusGateway.prototype._send = function (zone, eventId, type, data, meta) {
    var z = this._zones[zone],
        copy;

    try {
        copy = JSON.stringify({
            eventId: eventId,
            type: type,
            data: data,
            meta: meta
        });
    } catch (e) {
        _logerr(e);
        return;
    }
    z.buff.push(copy);
    if (!z.sending) {
        this._sendBuff(zone);
    }
};

BusGateway.prototype._sendBuff = function (zone) {
    var self = this,
        z = this._zones[zone],
        item;
    if (!z || !z.res) {
        return;
    }
    item = z.buff.shift();
    if (item) {
        z.sending = true;
        z.sendingEvent = item;
        z.res.send(200, item);
        if (z.timer) {
            clearTimeout(z.timer);
        }
        z.timer = setTimeout(function() {
            self.closeZone(zone);
        }, self.config.ajax_timeout);
    }
};

BusGateway.prototype.closeZone = function (zone) {
    var z = this._zones[zone],
        arr,
        i,
        jsonObj;

    cl('offline: ' + zone);
    if (z) {
        arr = z.buff;
        jsonObj = JSON.parse(z.sendingEvent);
        if (jsonObj.eventId !== -1) {
            arr.push(jsonObj);
        }
        for (i = 0; i < arr.length; i += 1) {
            this.emit(EVENT_LOSE, {
                eventId: arr[i].eventId,
                type: arr[i].type,
                data: arr[i].data,
                meta: arr[i].meta
            }, {
                to: ZONE_LOCAL
            });
        }
        this.emit(EVENT_OFFLINE, zone, {
            to: ZONE_LOCAL
        });
        if (z.timer) {
            clearTimeout(z.timer);
        }
        z.timer = null;
        z.buff = [];
        z.req = null;
        z.res = null;
        delete this._zones[zone];
    }
};

BusGateway.prototype.zoneOnline = function (zone) {
    return !!this._zones[zone];
};

BusGateway.prototype.getRemoteZones = function () {
    var arr = [],
        z = null;
    
    for (z in this._zones) {
        if (this._zones.hasOwnProperty(z)) {
            arr.push(z);
        }
    }
    return arr;
};

module.exports = BusGateway;