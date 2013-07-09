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

util.multipart = function (obj) {
    var boundary = Math.random().toString().substr(2),
        str = "";
    
    for(var key in obj) {
        if (obj.hasOwnProperty(key)) {
            str += "--" + boundary +
                   '\r\nContent-Disposition: form-data; name="' + key + '"' +
                   //"\r\nContent-type: application/octet-stream" +
                   "\r\n\r\n" + obj[key] + "\r\n";
        }
    }
    str += "--" + boundary + "--\r\n";
    return {
            boundary: boundary,
            content: str,
            length: str.length
    };
};

module.exports = util;
