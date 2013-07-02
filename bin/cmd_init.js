var CFG_FILE_NAME = 'mmconfig.json',
    USAGES = ['Create a basic project structure in current directory',
              '  -h, --help \t show this usage info', 
              '  -b, --build \t init and do build'],
    fs = require('fs'),
    path = require('path');

function copy_runjs(targetPath) {
    var runjs_path = path.resolve(__dirname, '..', 'support', 'run.js');
    if (!fs.existsSync(path.resolve(targetPath, 'run.js'))) {
        fs.createReadStream(runjs_path).pipe(fs.createWriteStream(path.resolve(targetPath, 'run.js')));
    }
}

function make_mmconfig(targetPath) {
    var init_config_path = path.resolve(__dirname, '..', 'support', 'init_config.json');
    if (!fs.existsSync(path.resolve(targetPath, CFG_FILE_NAME))) {
        fs.createReadStream(init_config_path).pipe(fs.createWriteStream(path.resolve(targetPath, CFG_FILE_NAME)));
    }
}

function make_var(targetPath) {
    if (!fs.existsSync(path.resolve(targetPath, 'var'))) {
        fs.mkdirSync(path.resolve(targetPath, 'var'));
    }
    if (!fs.existsSync(path.resolve(targetPath, 'var', 'forever'))) {
        fs.mkdirSync(path.resolve(targetPath, 'var', 'forever'));
    }
}

function make_client(targetPath) {
    if (!fs.existsSync(path.resolve(targetPath, 'client'))) {
        fs.mkdirSync(path.resolve(targetPath, 'client'));
    }
}

function make_server(targetPath) {
    if (!fs.existsSync(path.resolve(targetPath, 'server'))) {
        fs.mkdirSync(path.resolve(targetPath, 'server'));
    }
}

function make_build(targetPath) {
    if (!fs.existsSync(path.resolve(targetPath, 'build'))) {
        fs.mkdirSync(path.resolve(targetPath, 'build'));
    }
}

function show_usage(){
    console.log('  ' + USAGES[0]);
    for (var i = 1; i < USAGES.length; i++) {
        console.log('  ' + USAGES[i]);
    }
}

exports.main = function cmd(params) {
    var cwd = process.cwd();
    if (params[0] == '-h' || params[0] == '--help') {
        show_usage();
    } else {
        copy_runjs(cwd);
        make_mmconfig(cwd);
        make_var(cwd);
        make_client(cwd);
        make_server(cwd);
        make_build(cwd);
        if (params[0] == '-b' || params[0] == '--build') {
            require('./cmd_build').main([]);
        }
    }
};


