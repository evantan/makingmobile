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
    mm_run_file = require(path.resolve(cwd, './node_modules/makingmobile/bin/run.js')),
    config, cp;

function show_usage(){
    console.log('  ' + USAGES[0]);
    for (var i = 1; i < USAGES.length; i++) {
        console.log('  ' + USAGES[i]);
    }
}

exports.main = function cmd(params) {
    var options = [path.resolve(cwd, CFG_FILE_NAME)],
        p;
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
    
    if(config.forever.enable) {
        cp = new forever(mm_run_file, {
            max: config.forever.max || 3,
            silent: config.forever.silent === true,
            pidFile: path.resolve(cwd, config.forever.pidFile || 'forever/app.pid'),
            outFile: path.resolve(config.forever.outFile || 'forever/out.pid'),
            errFile: path.resolve(config.forever.errFile || 'forever/err.pid'),
            watch: config.forever.watch === true,
            watchDirectory: path.resolve(config.forever.watchDirectory || 'server/'),
            options: options
        });
        cp.on('exit', function () {
            var t = new Date();
            console.log(mm_run_file + ' has exited from forever.');
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
        cp.on('restart', function() {
            console.log('Restart ' + mm_run_file + ' ...');
        });
        cp.start();
        last_exit_time = new Date();
    } else {
        require(mm_run_file).main(options);
    }
};


