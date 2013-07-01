//#!/usr/bin/env node

/*jslint sub:true, evil:true */
var CFG_FILE_NAME = 'mmconfig.json',
    PLUGIN_PREFIX = 'makingmobile-plugin-',
    cmdargv = process.argv.slice(2),
    path = require('path'),
    fs = require('fs'),
    cwd = process.cwd();

function find_config_root(cp){
    if (fs.existsSync(path.resolve(cp, CFG_FILE_NAME))) return cp;
    if (path.resolve(cp, '..') == cp) return null;
    return find_config_root(path.resolve(cp, '..'));
}

function main() {
    var config_root = find_config_root(cwd),
        plugin_cmd = {},
        str = '  ',
        cmd = null,
        config, i, pc;
    if (!config_root) return console.error(CFG_FILE_NAME + ' no found in current path');
    try {
        //mmconfig.json could contain RegExp and other non-json object, so we use Function-eval instead JSON.parse
        config = new Function('return ' + fs.readFileSync(path.resolve(config_root, CFG_FILE_NAME), {encoding: 'utf-8'}))();
    } catch (e) {
        return console.error('Fail to parse config file: ' + e);
    }
    for (i = 0; i < config.plugins.length; i++) {
        pc = require(path.resolve(config_root, 'node_modules', PLUGIN_PREFIX + config.plugins[i].name)).docmd;
        if (typeof pc === 'function') {
            plugin_cmd[config.plugins[i].name] = pc;
        }
    }
    if (cmdargv.length === 0) {
        console.log('\n Run MakingMobile plugin-specific command. Following plugins has its command:\n');
        for (cmd in plugin_cmd){
            str += cmd + '\t';
        }
        console.log(str);
        console.log('\n  Usage: mmp pluginname cmd arg1 arg2 ...');
        console.log('\nTo get available cmds within each plugin, type: mmp pluginname -h');
    } else {
        cmd = cmdargv[0];
        if (plugin_cmd.hasOwnProperty(cmd)){
            cmdargv[cmd](cmdargv.slice(1), config, config_root);
        } else {
            console.error('Cannot find plugin: ' + cmd);
        }
    }
}

