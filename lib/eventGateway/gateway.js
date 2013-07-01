/*global module*/

(function () {
    "use strict";

    var META_TIMESTAMP = 'timeStamp',
        META_FROM = 'from',
        META_TO = 'to',
        //ZONE_ALL = '*',
        ZONE_LOCAL = '.',
        META_DROP = 'drop',
        META_RESULT = 'resultEvent',
        DEFAULT_PRIORITY = 1000,
        NAMESPACE = 'gateway',
        EVENT_ADDLISTENER = NAMESPACE + ':addListener',
        EVENT_REMOVELISTENER = NAMESPACE + ':removeListener',
        EVENT_EMIT = NAMESPACE + ':emit',
        EVENT_REMOVE_RECV = NAMESPACE + ':remoteEvent',
        _logerr = function (e) {
            if (console && console.error) {
                console.error(e);
            }
        };

    function Gateway() {
        this._registeredEvents = this._registeredEvents || {};
        this._eventId = 0;
    }

    Gateway.prototype.DEFAULT_PRIORITY = DEFAULT_PRIORITY;

    Gateway.prototype.getZone = function () {
        //implementor should populate this
        return this._zoneID;
    };
    
    /*
     * Add all the event-related interface to obj, and prefix namespace to event names.
     */
    Gateway.prototype.delegate = function (obj, namespace) {
        var self = this;

        if (typeof namespace !== 'string' || namespace.indexOf(':') !== -1) {
            throw 'delegate: lack or bad namespace';
        }
        //following codes is ugly, yet copy-and-paste sometimes just feel so good...
        obj.go = obj.emit = function (type, data, meta) {
            type = type.indexOf(':') === -1 ? namespace + ':' + type : type;
            return self.emit(type,  data, meta);
        };
        obj.addListener = function (type, handler, scope, extra, priority) {
            type = type.indexOf(':') === -1 ? namespace + ':' + type : type;
            return self.addListener(type, handler, scope, extra, priority);
        };
        obj.off = obj.removeListener = function (type, handler, scope, extra, priority) {
            type = type.indexOf(':') === -1 ? namespace + ':' + type : type;
            return self.removeListener(type, handler, scope, extra, priority);
        };
        obj.once = function (type, handler, scope, extra, priority) {
            type = type.indexOf(':') === -1 ? namespace + ':' + type : type;
            return self.once(type, handler, scope, extra, priority);
        };
        obj.on = function() {
            var params = Array.prototype.slice.call(arguments, 0);
            params.unshift(namespace);
            return self._on.apply(self, params);
        };   
        obj.cmd = function() {
            var params = Array.prototype.slice.call(arguments, 0);
            params.unshift(namespace);
            return self._cmd.apply(self, params);
        };
    };

    Gateway.prototype._localDistribute = function (type, data, meta) {
        var listenerArr = this._registeredEvents[type],
            result = null,
            i;

        if (listenerArr) {
            for (i = 0; i < listenerArr.length; i += 1) {
                if (meta[META_DROP]) {
                    break;
                }
                //Simply ignore the error in handler and go next
                try {
                    result = listenerArr[i].handler.call(listenerArr[i].scope || this, data, meta, listenerArr[i].extra);
                } catch (e) {
                    _logerr(e);
                }
                //If handler return a value, replace the data with it
                if (result !== undefined) {
                    data = result;
                }
            }
        }
    };

    Gateway.prototype._remoteSend = function (eventId, type, data, meta) {
        //Leave to transport layer
        throw "Not implemented: " + eventId + type + data + meta;
    };

    Gateway.prototype._remoteRecv = function (type, data, meta) {
        //**Note**
        //if one listener of this event set meta.drop to true, then the original event will be dropped
        //So this is a hack point for middleware
        this._localDistribute(EVENT_REMOVE_RECV, {
            type: type,
            data: data
        }, meta);
        //Now the original event
        this._localDistribute(type, data, meta);
    };

    Gateway.prototype.emit = function (type, data, meta) {
        if (typeof type !== 'string') {
            throw 'emit: Bad event type';
        }
        if (type.indexOf(':') === -1) {
            //All event type should has a namespace
            type = NAMESPACE + ':' + type;
        }
        if (meta === null || typeof meta !== 'object') {
            meta = {};
        }
        if (!this._registeredEvents) {
            this._registeredEvents = {};
        }
        //Set time stamp in meta
        meta[META_TIMESTAMP] = meta[META_TIMESTAMP] || new Date().toISOString();
        //Set target zone
        if (!meta[META_TO] || meta[META_TO] === ZONE_LOCAL) {
            meta[META_TO] = this.getZone();
        }
        //Set source zone
        meta[META_FROM] = this.getZone();

        //Emit "emit" event
        if (type !== EVENT_EMIT && this._registeredEvents[EVENT_EMIT]) {
            //**Note**
            //if one listener of "emit" event set meta.drop to true, then the original event will be dropped
            //So this is a hack point for middleware
            this._localDistribute(EVENT_EMIT, {
                type: type,
                data: data
            }, meta);
        }

        this._eventId += 1;
        //Local first
        this._localDistribute(type, data, meta);
        //Then remote
        if (meta[META_TO] !== this.getZone() && !meta[META_DROP]) {
            this._remoteSend(this._eventId, type, data, meta);
        }

        return this._eventId;
    };

    Gateway.prototype.addListener = function (type, handler, scope, extra, priority) {
        var listenerArr,
            insertAt,
            hd,
            i;

        if (typeof type !== 'string' || type.length < 1 || typeof handler !== 'function') {
            throw 'addListener: Bad event listener params';
        }
        if (type.indexOf(':') === -1) {
            //All event type should has a namespace
            type = NAMESPACE + ':' + type;
        }
        if (typeof priority !== 'number') {
            priority = DEFAULT_PRIORITY;
        }
        listenerArr = this._registeredEvents[type];
        if (!listenerArr) {
            listenerArr = this._registeredEvents[type] = [];
        }

        //Same signature(type, handler, scope, extra, priority) allow regist only once
        for (i = 0; i < listenerArr.length; i += 1) {
            if (listenerArr[i].handler === handler &&
                    listenerArr[i].scope === scope &&
                    listenerArr[i].extra === extra &&
                    listenerArr[i].priority === priority) {
                return false;
            }
        }

        for (insertAt = 0; insertAt < listenerArr.length; insertAt += 1) {
            if (listenerArr[insertAt].priority > priority) {
                break;
            }
        }
        hd = {
            handler: handler,
            scope: scope,
            extra: extra,
            priority: priority
        };
        listenerArr.splice(insertAt, 0, hd);

        //Emit "add listener" event
        this.emit(EVENT_ADDLISTENER, {
            type: type,
            handler: handler,
            scope: scope,
            extra: extra,
            priority: priority,
            index: insertAt
        }, null);

        return true;
    };

    Gateway.prototype.removeListener = function (type, handler, scope, extra, priority) {
        var listenerArr = this._registeredEvents[type],
            removed = false,
            i;
        
        if (type.indexOf(':') === -1) {
            //All event type should has a namespace
            type = NAMESPACE + ':' + type;
        }
        if (!listenerArr || listenerArr.length < 1) {
            return false;
        }
        for (i = 0; i < listenerArr.length; i += 1) {
            if (!handler) {
                listenerArr[i].del = true;
                removed = true;
            } else if (handler === listenerArr[i].handler) {
                if ((!scope || scope === listenerArr[i].scope) &&
                        (!extra || extra === listenerArr[i].extra) &&
                        (!priority || priority === listenerArr[i].priority)) {
                    listenerArr[i].del = true;
                    removed = true;
                }
            }
        }
        i = listenerArr.length;
        while (i) {
            i -= 1;
            if (listenerArr[i].del) {
                listenerArr.splice(i, 1);
            }
        }
        if (removed) {
            //Emit "remove listener" event
            this.emit(EVENT_REMOVELISTENER, {
                type: type,
                handler: handler,
                scope: scope,
                extra: extra,
                priority: priority
            }, null);
        }
        return removed;
    };

    //shortcut methods:
    
    /*
     * Add listeners. Two forms, use position params just like addLitener, and use keyword params:
     *  {
     *     event-type1: {
     *          handler: fn,
     *          scope: any,
     *          extra: obj,
     *          priority: number
     *     },
     *     event-type2: {}, ...
     *  }
     */
    Gateway.prototype.on = function (type, handler, scope, extra, priority) {
        var params = Array.prototype.slice.call(arguments, 0);
        params.unshift('');
        this._on.apply(this, params);
    };
    
    Gateway.prototype._on = function (namespace, type, handler, scope, extra, priority) {
        var eventname = '',
            fullEventname = '',
            en_param = type;
        if (typeof en_param === 'object') {
            for (eventname in en_param) {
                if (en_param.hasOwnProperty(eventname) && (typeof en_param[eventname].handler === 'function')) {
                    fullEventname = namespace.length > 0 && eventname.indexOf(':') === -1 ? namespace + ':' + eventname : eventname;
                    this.addListener(fullEventname, en_param[eventname].handler, en_param[eventname].scope, en_param[eventname].extra, en_param[eventname].priority);
                }
            }
        } else {
            type = namespace.length > 0 && type.indexOf(':') === -1 ? namespace + ':' + type : type;
            this.addListener(type, handler, scope, extra, priority);
        }
    };
    
    /*
     * Add a listener and remove it after the first call.
     */
    Gateway.prototype.once = function (type, handler, scope, extra, priority) {
        var self = this;
        
        if (type.indexOf(':') === -1) {
            //All event type should has a namespace
            type = NAMESPACE + ':' + type;
        }
        function wrapper () {
            self.removeListener(type, wrapper);
            return handler.apply(scope || self, arguments);
        }
        this.addListener(type, wrapper, null, extra, priority);
    };
    
    /*
     * Remove a listener.
     */
    Gateway.prototype.off = Gateway.prototype.removeListener;
    
    /*
     * Fire a event.
     */
    Gateway.prototype.go = Gateway.prototype.emit;
    
    /*
     * Fire a 'cmd' event and asynchronously wait for result in callback until
     * timeout(millisecond).
     * Underneath this method set a 'resultEvent' field in meta, and expects the cmd
     * handler use it as event name to fire when job done.
     * 
     * Two forms, position and keyword:
     *     {
     *          cmd/event/type: string,
     *          data: json-like or null,
     *          meta: json or null,
     *          scope: any or null,
     *          whenReturn/return/result: callback(data, meta),
     *          [whenTimeout/error: callback(), ]
     *          [timeout: number(in millisecond)]
     *     }
     */
    Gateway.prototype.cmd = function (cmd, data, meta, scope, whenReturn, whenTimeout, timeout) {
        var params = Array.prototype.slice.call(arguments, 0);
        params.unshift('');
        this._cmd.apply(this, params);
    };
    
    Gateway.prototype._cmd = function (namespace, cmd, data, meta, scope, whenReturn, whenTimeout, timeout) {
        var self = this,
            timer = null,
            cmd_param = cmd,
            resultid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                var r = Math.random() * 16 | 0,
                    v = c === 'x' ? r : r & 0x3 | 0x8;
                return v.toString(16);
            }),
            key = null,
            lckey , resultEvent;
        
        if (typeof cmd_param === 'object') {
            for (key in cmd_param) {
                if (cmd_param.hasOwnProperty(key)) {
                    lckey = key.toLowerCase();
                    if (lckey === 'cmd' || lckey === 'event' || lckey === 'type') {
                        cmd = cmd_param[key];
                    } else if (lckey === 'data') {
                        data = cmd_param[key];
                    } else if (lckey === 'meta') {
                        meta = cmd_param[key];
                    } else if (lckey === 'scope') {
                        scope = cmd_param[key];
                    } else if (lckey === 'whenreturn' || lckey === 'return' || lckey === 'result') {
                        whenReturn = cmd_param[key];
                    } else if (lckey === 'whentimeout' || lckey === 'error') {
                        whenTimeout = cmd_param[key];
                    } else if (lckey === 'timeout') {
                        timeout = cmd_param[key];
                    }
                }
            }
        }
        
        if (typeof cmd !== 'string' || cmd.length < 1) {
            throw 'cmd: lack cmd name';
        }
        if (namespace.length > 0 && cmd.indexOf(':') === -1) {
            cmd = namespace + ':' + cmd;
        }
        meta = meta || {};
        resultEvent = meta[META_RESULT] = cmd + '_RESULT_' + resultid;
        
        function wrapper (d, m, e) {
            self.removeListener(resultEvent, wrapper);
            if (timer) {
                clearTimeout(timer);
            }
            return whenReturn.call(scope || self, d, m);
        }
        
        if (typeof whenReturn === 'function') {
            this.addListener(resultEvent, wrapper);
            if ((typeof whenTimeout === 'function') && (Number(timeout) > 0)) {
                timer = setTimeout(function() {
                    self.removeListener(resultEvent, wrapper);
                    whenTimeout.call(scope || self);
                }, Number(timeout));
            }
        }
        
        this.emit(cmd, data, meta);
    };
    
    module.exports = Gateway;

}());