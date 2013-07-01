#!/usr/bin/env node

var CMDS = [
    {
        cmd: 'init',
        helps: ['init \t\t create a basic project structure in current directory']
    }, {
        cmd: 'build',
        helps: ['build \t\t build plugins in config, generate client-side files and do other stuff. For details, see docs']
    }, {
        cmd: 'run',
        helps: ['run \t\t start nodejs web server, run the main script in config']
    }, {
        cmd: 'bundle',
        helps: ['bundle \t\t concatenate multiple files into one file']
    }],
    cmdargv = process.argv.slice(2),
    path = require('path'),
    fs = require('fs');

if (cmdargv.length === 0) {
    var versionstr = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'))).version;
    console.log('\n  MakingMobile framework, version ' + versionstr + '. available commands:\n');
    for (var i = 0; i < CMDS.length; i++) {
        console.log('\t' + CMDS[i].helps[0]);
    }
    console.log('\n');
} else {
    var cmd = cmdargv[0].toLowerCase();
    for (var i = 0; i < CMDS.length; i++) {
        if (CMDS[i].cmd === cmd) {
            cmd = require('./cmd_' + cmd).main;
            break;
        }
    }
    if (typeof cmd === 'string') {
        console.log('\nInvalid command name. Issue mm without param to see available commands list.');
    } else {
        cmd(cmdargv.slice(1));
    }
}






