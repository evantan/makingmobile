/*jslint sub:true, evil:true */
var CFG_FILE_NAME = 'mmconfig.json',
    PLUGIN_PREFIX = 'makingmobile-plugin-',
    USAGES = ['Build plugins in config, generate client-side files and do other stuff. For details, see docs'],
    fs = require('fs'),
    path = require('path'),
    browserify = require('browserify'),
    TEMP_ENTRY_FILE = path.resolve(cwd, 'node_modules', '.make_entry_file_tmp.js'),
    CLIENT_MAIN_PATH = 'support/cilent/main',
    npm = require('npm'),
    cwd = process.cwd(),
    config, packagejson;

function show_usage(){
    console.log('  ' + USAGES[0]);
    for (var i = 1; i < USAGES.length; i++) {
        console.log('  ' + USAGES[i]);
    }
}

function write_package_json(){
    var p = null,
        pjconfig, i;
    
    if (fs.existsSync('package.json')) {
        try {
            pjconfig = JSON.parse(fs.readFileSync('package.json', {encoding: 'utf-8'}));
        } catch (e) {
            throw 'mm build: Bad package.json file, please check or delete it and run build again';
        }
    } else {
        pjconfig = {};
    }
    pjconfig.name = config.name;
    pjconfig.version = config.version;
    pjconfig.description = config.description;
    pjconfig.main = config.main;
    pjconfig.dependencies = {
            "makingmobile": "*"
    };
    for (i = 0; i < config.plugins.length; i++) {
        p = config.plugins[i];
        if (!p.name || !p.version){
            throw 'mm build: Bad mmconfig.json, please check plugins field.';
        }        
        pjconfig.dependencies[PLUGIN_PREFIX + p.name] = p.version;
    }
    config.dependencies = config.dependencies || {};
    for (p in config.dependencies) {
        if (config.dependencies.hasOwnProperty(p)) {
            pjconfig.dependencies[p] = config.dependencies[p];
        }
    }
    fs.writeFileSync('package.json', JSON.stringify(pjconfig), {encoding: 'utf8'});
}

function after_install() {
    var nextFns = [],
        plugin_build, i;
    
    function next (err) {
        nextFns.shift();
        if (err) {
            console.error('\nFail to build plugin: ' + err);
        } else {
            if (nextFns.length > 0) {
                nextFns[0](config, cwd, next);
            }
        }
    }
    
    console.log('Build plugins...');
    for(i = 0; i < config.plugins.length; i++) {
        plugin_build = require(PLUGIN_PREFIX + config.plugins[i].name).build;
        if (typeof plugin_build === 'function') {
            nextFns.push(plugin_build);
        }
    }
    nextFns.push(function() {
        console.log('Done.');
        generate_client_files();
    });  
}

function make_entry_file() {
    var content = 'var MakingMobile = require("./makingmobile/' + CLIENT_MAIN_PATH + '");' +
                  '\n' +
                  'var plugins = [];' +
                  '\n' +
                  'var plugin_config = {};' +
                  '\n',
        i;
    
    config.client['instance-config'].urlprefix = config.urlprefix || '';
    
    for (i = 0; i < config.plugins.length; i++) {
        content += 'plugin_config = ' + JSON.stringify(config.plugins[i]);
        content += '\n';
        content += 'plugins.push({p: require("./' + config.plugins[i].name + '/' + CLIENT_MAIN_PATH + '"), config: plugin_config});';
        content += '\n';
    }
    content += 'var mm = new MakingMobile(' + JSON.stringify(config.client['instance-config']) + ');';
    content += '\n';
    content += 'mm._init(plugins);';
    content += '\n';
    content += 'module.exports = mm;';
    fs.writeFileSync(TEMP_ENTRY_FILE, content, {encoding: 'utf8'});
}

function generate_client_files() {
    var gps = config.client['generate-to'] || [],
        nextFns = [],
        noParse = [],
        i, j, npf, b;
    
    function next (err) {
        nextFns.shift();
        if (err) {
            console.error('\nFail to run post-build: ' + err);
        } else {
            if (nextFns.length > 0) {
                nextFns[0](config, cwd, next);
            }
        }
    }
    
    console.log('Generate client-side framework in following positons: ' + gps.join('\t'));
    for(i = 0; i < config.plugins.length; i++) {
        if (config.plugins[i]['_noparse-files']) {
            for(j = 0; j < config.plugins[i]['_noparse-files'].length; j++){
                npf = config.client['addon-lib'] || {};
                npf = npf[config.plugins[i]['_noparse-files'][j]];
                if (npf && fs.existsSync(path.resolve(cwd, npf))) {
                    noParse.push(path.resolve(cwd, npf));
                } else {
                    return console.error("Cannot find addon-lib " + config.plugins[i]['noparse-files'][j] + " needed by plugin " + config.plugins[i].name);
                }
            }
        }
    }
    make_entry_file();
    b = browserify({
        entries: TEMP_ENTRY_FILE,
        noParse: noParse
    });
    b.bundle({
        debug: config.client.debug,
        standalone: config.client.standalone
    }, function(err, src) {
        var i, post_build;
        
        fs.unlinkSync(TEMP_ENTRY_FILE);
        if (err) {
            console.error('Fail to generate client files: ' + err);
        } else {
            for (i = 0; i < gps.length; i++) {
                fs.writeFileSyn(path.resolve(cwd, gps[i]), src);
            }
            console.log('Done.');
            console.log('Running post-build procedure...');
            for(i = 0; i < config.plugins.length; i++) {
                post_build = require(PLUGIN_PREFIX + config.plugins[i].name).post_build;
                if (typeof post_build === 'function') {
                    nextFns.push(post_build);
                }
            }
            nextFns.push(function() {
                console.log('Done.');
            }); 
        }
    });
}

exports.main = function cmd(params) {
    if (params.length > 0 && (params[0] == '-h' || params[0] == '--help')) {
        return show_usage();
    }
    if (!fs.existsSync(path.resolve(cwd, CFG_FILE_NAME))) {
        return console.error('Cannot find mmconfig.json in current directory. Consider run mm init first.');
    }
    try {
        //mmconfig.json could contain RegExp and other non-json object, so we use Function-eval instead JSON.parse
        config = new Function('return ' + fs.readFileSync(path.resolve(process.cwd(), CFG_FILE_NAME), {encoding: 'utf-8'}))();
    } catch (e) {
        return console.error('Fail to parse config file: ' + e);
    }
    write_package_json();
    npm.load(null, function(){
        console.log('Check and install plugins and dependencies...');
        npm.commands.install(function(err) {
            if (err) {
                console.error('Fail to build: ' + err);
            } else {
                console.log('Done.');
                after_install();
            }
         }); 
    });
};


