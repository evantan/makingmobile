/*jslint sub:true, evil:true */
var CFG_FILE_NAME = 'mmconfig.json',
    path = require('path'),
    rootdir = __dirname,
    fs = require('fs'),
    config_file = path.resolve(rootdir, CFG_FILE_NAME),
    mm = require('makingmobile');

function main(argv) {
    var port = Number(argv[1]),
        config = null;
    
    if (argv.length > 0) {
        config_file = argv[0];
    }
    if (!fs.existsSync(config_file)) {
        return console.error('Cannot find ' + CFG_FILE_NAME);
    }
    try {
        //mmconfig.json could contain RegExp and other non-json object, so we use Function-eval instead JSON.parse
        config = new Function('return ' + fs.readFileSync(config_file, {encoding: 'utf-8'}))();
    } catch (e) {
        return console.error('Fail to parse config file: ' + e);
    }
    config.port = port > 0 && port < 65532 ? port : config.port;
    mm._rootdir = rootdir;
    mm._init(config, rootdir);
}

exports.main = main;

if (require.main === module) {
    main(process.argv.slice(2));
}