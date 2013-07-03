/*jslint sub:true, evil:true */
var CFG_FILE_NAME = 'mmconfig.json',
    USAGES = ['Start nodejs web server, run the main script in config',
              '  -p --port \t specify the server port listened to, overload the config file value'],
    MIN_EXIT_INTERVAL = 1000 * 10,
    MAX_EXIT = 5,
    exit_count = 0,
    last_exit_time = null,
    fs = require('fs'),
    path = require('path'),
    forever = require('forever-monitor').Monitor,
    cwd = process.cwd(),
    mm_run_file = path.resolve(cwd, 'run.js'),
    config, cp;

function show_usage(){
    console.log('  ' + USAGES[0]);
    for (var i = 1; i < USAGES.length; i++) {
        console.log('  ' + USAGES[i]);
    }
}

exports.main = function cmd(params) {
    var options = [path.resolve(cwd, CFG_FILE_NAME)],
        p, pidFile, outFile, errFile, watchDirectory;
    
    if (params.length > 0) {
        if ((params[0] == '-h' || params[0] == '--help')) {
            return show_usage();
        } else if (params[0] == '-p' || params[0] == '--port') {
            p = Number(params[1]);
            if (p > 0 && p < 65532) {
                options.push(p);
            }
        }
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
    if(config.forever.enable) {
        pidFile = path.resolve(cwd, config.forever.pidFile || 'forever/app.pid');
        outFile = path.resolve(cwd, config.forever.outFile || 'forever/out.pid');
        errFile = path.resolve(cwd, config.forever.errFile || 'forever/err.pid');
        watchDirectory = path.resolve(cwd, config.forever.watchDirectory || 'server/');

        if (!fs.existsSync(path.resolve(pidFile, '..'))) {
            return console.error('Parent folder of forever pidFile "' + pidFile + '" does not exist, please create it first.');
        }
        if (!fs.existsSync(path.resolve(outFile, '..'))) {
            return console.error('Parent folder of forever outFile "' + outFile + '" does not exist, please create it first.');
        }
        if (!fs.existsSync(path.resolve(errFile, '..'))) {
            return console.error('Parent folder of forever errFile "' + errFile + '" does not exist, please create it first.');
        }
        if (!fs.existsSync(watchDirectory)) {
            return console.error('Forever watchDirectory does not exist, please check.');
        }
        cp = new forever(mm_run_file, {
            max: config.forever.max || 3,
            silent: config.forever.silent === true,
            pidFile: pidFile,
            outFile: outFile,
            errFile: errFile,
            watch: config.forever.watch === true,
            watchDirectory: watchDirectory,
            options: options
        });
        cp.on('exit', function () {
            console.log('mm server has exited.');
            process.exit(1);
        });
        cp.on('restart', function() {
            var t = new Date();
            console.log('Restart mm server ...');
            if (t - last_exit_time < MIN_EXIT_INTERVAL) {
                exit_count += 1;
                if (exit_count > MAX_EXIT) {
                    cp.stop();
                    console.log("Exit too many times during a short interval, stop auto-respawning, pls check error.");
                }
            } else {
                exit_count = 0;
            }
            last_exit_time = t;
        });
        cp.start();
        last_exit_time = new Date();
    } else {
        require(mm_run_file).main(options);
    }
};


