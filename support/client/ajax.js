/*global module, window*/

(function () {
    "use strict";

    /*
     * Ajax interface has two method:
     *    1. send(url, bodyString, timeout, success, error)
     *  
     *          success:    funuction(responseText)
     *          error:      function(code, [info])
     *                  code 0 -- status code is 0 or responseText is null
     *                  code 1 -- Server return non-200 status code(contained in info)
     *                  code 2 -- timeout
     *                  code 3 -- other error
     *    2. abort()
     *    
     *    2. isCompleted() 
     *    
     * send() is serial, call another send before preceding one complete lead to error.
     */

    function Xhr2() {
        if (!(this instanceof Xhr2)) {
            return new Xhr2();
        }
        this._timer = null;
        this._xhr = null;
        this._success = null;
        this._error = null;
    }

    Xhr2.prototype.isCompleted = function () {
        return this._xhr === null;
    };
    
    Xhr2.prototype.send = function (url, bodyString, timeout, success, error) {
        var self = this,
            xhr = new window.XMLHttpRequest();
        
        if (self._xhr !== null) {
            return self._error(3, 'Preceding send() uncompleted');
        }
        self._xhr = xhr;
        self._success = success;
        self._error = error;
        //XDomainRequest does not support withCredentials, and we don't need cookie
        //xhr.withCredentials = false;
        self._timer = window.setTimeout(function () {
            self._cleanup(true);
        }, timeout);
        xhr.onreadystatechange = function () {
            self._onreadystatechange();
        };
        try {
            xhr.open('POST', url, true);
            //Try not to send a preflight
            xhr.setRequestHeader('Content-Type', 'text/plain');
            xhr.send(bodyString);
        } catch (e) {
            self._error(3, e);
        }
        return self;
    };

    Xhr2.prototype._onreadystatechange = function () {
        var xhr = this._xhr,
            rsp,
            status;

        if (!xhr) {
            return;
        }
        if (xhr.readyState === 4) {
            status = xhr.status;
            rsp = xhr.responseText;
            this._cleanup();
            if (status === 0 || rsp === null) {
                this._error(0, 'transport error');
            } else if (status !== 200) {
                this._error(1, status);
            } else {
                this._success(rsp);
            }
        }
    };

    Xhr2.prototype._cleanup = function (abort) {
        var xhr = this._xhr;

        if (xhr !== null) {
            this._xhr = null;
            window.clearTimeout(this._timer);
            xhr.onreadystatechange = function() {};
            if (abort) {
                xhr.abort();
                this._error(2, 'timeout');
            }
            xhr = null;
        }
    };

    Xhr2.prototype.abort = function () {
        this._cleanup(true);
    };

    function Xdr() {
        if (!(this instanceof Xdr)) {
            return new Xdr();
        }
        this._xdr = null;
        this._success = null;
        this._error = null;
    }

    Xdr.prototype.isCompleted = function () {
        return this._xdr === null;
    };
    
    Xdr.prototype.send = function (url, bodyString, timeout, success, error) {
        var self = this,
            xdr = new window.XDomainRequest();
        
        if (self._xdr !== null) {
            return self._error(3, 'Preceding send() uncompleted');
        }
        self._xdr = xdr;
        self._success = success;
        self._error = error;
        xdr.timeout = timeout;
        xdr.contentType = "text/plain";
        xdr.onerror = function () {
            self._onerror();
        };
        xdr.onload = function () {
            self._onload();
        };
        xdr.ontimeout = function () {
            self._ontimeout();
        };
        try {
            xdr.open('POST', url);
            xdr.send(bodyString);
        } catch (e) {
            self._error(3, e);
        }
        return self;
    };

    Xdr.prototype._onerror = function () {
        this._cleanup();
        this._error(3);
    };

    Xdr.prototype._onload = function () {
        var rsp = this._xdr.responseText;
        this._cleanup();
        if (rsp === null) {
            this._error(3);
        } else {
            this._success(rsp);
        }
    };

    Xdr.prototype._ontimeout = function () {
        this._cleanup();
        this._error(2, 'timeout');
    };

    Xdr.prototype._cleanup = function () {
        if (this._xdr !== null) {
            this._xdr.onerror = this._xdr.onload = this._xdr.ontimeout = null;
            this._xdr = null;
        }
    };

    Xdr.prototype.abort = function () {
        if (this._xdr !== null) {
            try {
                this._xdr.abort();
            } catch (ignore) {}
            this._cleanup();
        }
    };

    
    //XMLHttpRequest level 1 supports, for android 2.x
    //We just use the same function, because 'withCredentials' actually not in use.
    var Xhr = Xhr2;
    
    if (window.XMLHttpRequest && 'withCredentials' in new window.XMLHttpRequest()) {
        module.exports = Xhr2;
    } else if (window.XDomainRequest) {
        module.exports = Xdr;
    } else if (window.XMLHttpRequest) {
        module.exports = Xhr;
    } else {
        throw "browser support neither XMLHttpRequest2 nor XDomainRequest";
    }

}());





