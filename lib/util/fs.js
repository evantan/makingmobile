/*jshint sub:true*/
var fs = require('fs'),
    path = require('path');

/*
 * rm dir synchronous and recursively 
 */
function rmdirr(p) {
    var entries = fs.readdirSync(p),
        e, i;

    for(i = 0; i < entries.length; i++) {
        e = fs.lstatSync(path.join(p, entries[i]));
        if(e.isDirectory()){
            rmdirr(path.join(p, entries[i]));
        }
        else if(e.isSymbolicLink()){
            fs.unlinkSync(path.join(p, entries[i]));
        }
        else {
            fs.unlinkSync(path.join(p, entries[i]));
        }
    }
    return fs.rmdirSync(p);  
}

/*
 * make dir synchronous and recursively 
 */
function mkdirr(p, mode, made){
    if (mode === undefined) {
        mode = 0777 & (~process.umask());
    }
    if (!made) made = null;

    if (typeof mode === 'string') mode = parseInt(mode, 8);
    p = path.resolve(p);

    try {
        fs.mkdirSync(p, mode);
        made = made || p;
    }
    catch (err0) {
        switch (err0.code) {
            case 'ENOENT' :
                made = mkdirr(path.dirname(p), mode, made);
                mkdirr(p, mode, made);
                break;

            // In the case of any other error, just see if there's a dir
            // there already.  If so, then hooray!  If not, then something
            // is borked.
            default:
                var stat;
                try {
                    stat = fs.statSync(p);
                }
                catch (err1) {
                    throw err0;
                }
                if (!stat.isDirectory()) throw err0;
                break;
        }
    }

    return made;
}

exports.rmdirr = rmdirr;
exports.mkdirr = mkdirr;