/*jshint sub:true*/
function toSetcookie(obj) { 
    var pairs = [obj.name + '=' + obj.val];
    
    if (obj.maxAge) pairs.push('Max-Age=' + obj.maxAge);
    //if (obj.domain) pairs.push('Domain=' + opt.domain);
    if (obj.path) pairs.push('Path=' + obj.path);
    if (obj.expires) pairs.push('Expires=' + (obj.expires instanceof Date ? obj.expires.toUTCString() : obj.expires));
    if (obj.httpOnly) pairs.push('HttpOnly');
    if (obj.secure) pairs.push('Secure');

    return pairs.join('; ');
}

function fromSetcookie(str) {
    var obj = {},
        pairs = str.split(/[;,] */);

    pairs.forEach(function(pair, index) {
        var eq_idx = pair.indexOf('='),
            key, val;
    
        if (eq_idx < 0) {
            key = pair.trim();
            val = "true";
        } else {
            key = pair.substr(0, eq_idx).trim();
            val = pair.substr(++eq_idx, pair.length).trim();
        }
        
        if ('"' == val[0]) {
            val = val.slice(1, -1);
        }
        
        if (index === 0) {
            obj.name = key;
            obj.val = val;
            return;
        }
        
        key = key.toLowerCase();
        if (key === 'max-age') {
            key = 'maxAge';
        } else if (key === 'path') {
            key = 'path';
        } else if (key === 'expires') {
            key = 'expires';
        } else if (key === 'httponly') {
            key = 'httpOnly';
        } else if (key === 'secure') {
            key = 'secure';
        } else {
            return;
        }
    
        // only assign once
        if (undefined === obj[key]) {
            obj[key] = val;
        }
    });
    
    return obj;
}

function cookieTracker(data) {
    if (!(this instanceof cookieTracker)) {
        return new cookieTracker(data);
    }
    this.data = data || {};
}

cookieTracker.prototype.expired = function (cookie) {
    var now = new Date();
    
    if (cookie.expires && now > new Date(cookie.expires)) {
        return true;
    }
    if (cookie.maxAge && (now - 0) > (new Date(cookie.createTime) + cookie.maxAge)) {
        return true;
    }
    return false;
};

cookieTracker.prototype.delExpired = function () {
    var self = this,
        key = null,
        delkey = [];
    for (key in this.data) {
        if (this.data.hasOwnProperty(key) && this.expired(this.data[key])) {
            delkey.push(key);
        }
    }
    delkey.forEach(function(key) {
        delete self.data[key];
    });
};

/*
 * cookie: {
 *      name: string
 *      val: string,
 *      maxAge: string/number
 *      path: string,
 *      expires: utc-string/Date
 *      httpOnly: "true"/"false"/true/false
 *      secure: "true"/"false"/true/false
 *      createTime: utc-string/Date
 * }
 */
cookieTracker.prototype.addcookie = function (cookie, defaultPath) {  
    if (typeof cookie === 'string') {
        cookie = fromSetcookie(cookie);
    }
    cookie['createTime'] = (new Date()).toUTCString();
    if (!cookie.path) {
        cookie.path = defaultPath || '/';
    }
    if (cookie.path[0] !== '/') {
        cookie.path = '/' + cookie.path;
    }
    if (cookie.path.length > 1 && cookie.path[cookie.path.length - 1] === '/') {
        cookie.path = cookie.path.slice(0, cookie.path.length - 1);
    }
    
    if (!this.expired(cookie)) {
        this.data[cookie.name + cookie.path] = cookie;
    }
};

cookieTracker.prototype.fromResHeader = function (resheader, reqpath) {
    var self = this;
    
    resheader = resheader || [];
    if (typeof resheader.headers === 'object') {
        resheader = resheader.headers['set-cookie'];
    }
    if (typeof resheader === 'string') {
        resheader = [resheader];
    }
    resheader = resheader || [];
    resheader.forEach(function(str) {
        self.addcookie(fromSetcookie(str), reqpath);
    });
};

cookieTracker.prototype.toObj = function (reqpath) {   
    var url = require('url'),
        k = null,
        ck = {};
    
    if (reqpath.indexOf('http://') !== -1 || reqpath.indexOf('https://') !== -1) {
        reqpath = url.parse(reqpath).path;
    }
    if (reqpath[0] !== '/') {
        reqpath = '/' + reqpath;
    }
    this.delExpired();
    for (k in this.data) {
        if (this.data.hasOwnProperty(k)) {
            if (this.data[k].path === '/' || reqpath === this.data[k].path || reqpath.indexOf(this.data[k].path + '/') !== -1) {
                //Same cookie only set once, long path first.
                if (!ck[this.data[k].name] || ck[this.data[k].name].path.length < this.data[k].path.length) {
                    ck[this.data[k].name] = {val: this.data[k].val, path: this.data[k].path};
                }   
            }
        }
    }
    for (k in ck) {
        if (ck.hasOwnProperty(k)) {
            ck[k] = ck[k].val;
        }
    }
    
    return ck;
};

cookieTracker.prototype.toHeader = function (reqpath) {
    var obj = this.toObj(reqpath),
        pairs = [],
        k = null;
    
    for (k in obj) {
        if (obj.hasOwnProperty(k)) {
            pairs.push(k + '=' + obj[k]);
        }
    }
    return pairs.join('; ');
};

cookieTracker.prototype.find = function (name, reqpath) {
    return this.toObj(reqpath)[name];
};

/*
 * Class method. Append pathPrefix to every cookie.path. Return a set-cookie string array.
 */
cookieTracker.pathPrefix = function (pathPrefix, reqpath, source) {
    var ckarr = [],
        resarr = [];
    
    if (pathPrefix[0] !== '/') {
        pathPrefix = '/' + pathPrefix;
    }
    if (pathPrefix.length > 1 && pathPrefix[pathPrefix.length - 1] === '/') {
        pathPrefix = pathPrefix.slice(0, pathPrefix.length - 1);
    }
    if (reqpath.indexOf('http://') !== -1 || reqpath.indexOf('https://') !== -1) {
        reqpath = url.parse(reqpath).path;
    }
    if (reqpath[0] !== '/') {
        reqpath = '/' + reqpath;
    }
    source = source || [];
    if (typeof source.headers === 'object') {
        source = source.headers['set-cookie'];
    }
    if (typeof source === 'string') {
        source = [source];
    }
    source.forEach(function(str) {
        ckarr.push(fromSetcookie(str));
    });
    ckarr.forEach(function(obj) {
        obj.path = pathPrefix + (obj.path ? obj.path : reqpath);
        if (obj.path.length > 1 && obj.path[obj.path.length - 1] === '/') {
            obj.path = obj.path.slice(0, obj.path.length - 1);
        }
        resarr.push(toSetcookie(obj));
    });
    return resarr;
};

module.exports = cookieTracker;