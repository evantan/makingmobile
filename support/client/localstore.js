/*global module, window*/
/*jslint sub:true*/

(function () {
    "use strict";

    /*
     * A simple cross-page and file:// protocal compatible "localStorage".
     * It use window.name to do cross pages communication, and use window.localStorage 
     * to do persistence.
     * 
     * Attention: 
     *    Due to the size limitation of window.name, one should't use it keep large data set.
     * 
     * usage:
     *    get(key) get a key value
     *    set(key, obj) set a key value. 
     *          Key is string, and obj is a jsonable structure. 
     *          If obj is undefined, then delete the key.
     */

    function Localstore() {
        var init_data_from_localStorage = {},
            init_data_from_winname = {},
            key = null;
        
        if (!(this instanceof Localstore)) {
            return new Localstore();
        }
        if (window.name) {
            try {
                init_data_from_winname = JSON.parse(window.name);
            } catch(e) {
                init_data_from_winname = {};
            }
        }
        if (localStorage['_mm_localstore']) {
            init_data_from_localStorage = JSON.parse(localStorage['_mm_localstore']);
        }
        this._data = init_data_from_localStorage;
        for (key in init_data_from_winname) {
            if (init_data_from_winname.hasOwnProperty(key)) {
                this._data[key] = init_data_from_winname[key];
            }
        }
    }

    Localstore.prototype.get = function (key) {
        return this._data[key];
    };

    Localstore.prototype.set = function (key, obj) {
        if (obj === undefined) {
            delete this._data[key];
        } else {
            this._data[key] = obj;
        }
        this._persist();
    };
    
    Localstore.prototype._persist = function() {
        var datastr = JSON.stringify(this._data);
        window.name = localStorage['_mm_localstore'] = datastr;
    };
    
    module.exports = Localstore;
}());





