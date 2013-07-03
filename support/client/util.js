/*jshint sub:true*/

/*
 * nodeSide Utilities object, which contains many useful but unrelated tools.
 */
var util = {};

/*
 * Convert "/xxx/", "xxx", "xxx/" form url string to "/xxx" form(leading with slash, but has no ending slash)
 */
util.slash_url = function (url) {
    if (url.length > 0 && url[0] !== '/') {
        url = '/' + url;
    }
    return url[url.length - 1] === '/' ? url.slice(0, url.length - 1) : url;
};

module.exports = util;
