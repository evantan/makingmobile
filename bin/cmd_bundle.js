var USAGES = ['Concatenate multiple files into one file, optionally compress css/js file with YUI Compressor.',
              '\n  usage: ',
              '  mm bundle a.js  b.js -o all.js',
              '  mm bundle -o all.css -i a.css b.css',
              '  mm bundle a.js b.js -m -o a.min.all',
              '  mm bundle -c bundleconfig.txt --minify --output bundle_result.min.css',
              '\n  param: ', 
              '  -h, --help  \tshow this usage info', 
              '  -i, --input \tspecify the input files',
              '  -o, --output \tspecify the output file',
              '  -f, --force \tforce to overwrite output file when exist',
              '  -m, --minify \tcompress the output file',
              '  -c, --config \tspecify a text file whose every line is a input file name',
              '\n'],
    compressor = require('node-minify'),
    fs = require('fs'),
    path = require('path'),
    params = {
        force: false,
        minify: false,
        inputs: [],
        output: null
    };

function show_usage(){
    console.log('\n  ' + USAGES[0]);
    for (var i = 1; i < USAGES.length; i++) {
        console.log('  ' + USAGES[i]);
    }
}

function parseParams(targetPath, argvArr) {
    var configFile = null,
        i, j, ct, f;
    
    if (argvArr[0][0] !== '-') {
        argvArr.unshift('-i');
    }
    for(i = 0; i < argvArr.length; i++) {
        if (argvArr[i] === '-i' || argvArr[i] === '--input') {
            if (params.inputs.length !== 0) return false;
            ct = 0;
            for (j = i+1 ; j < argvArr.length; j++){
                if (argvArr[j][0] === '-') {
                    break;
                } else {
                    ct++;
                }
            }
            if (ct === 0) return false;
            params.inputs = argvArr.slice(i+1, i+1+ct);
            i += ct;
            continue;
        }
        if (argvArr[i] === '-o' || argvArr[i] === '--output') {
            if (params.output || argvArr[i+1] === undefined || argvArr[i+1][0] === '-') return false;
            params.output = argvArr[i+1];
            i += 1;
            continue;
        }
        if (argvArr[i] === '-m' || argvArr[i] === '--minify') {
            if (params.minify) return false;
            params.minify = true;
            continue;
        }
        if (argvArr[i] === '-f' || argvArr[i] === '--force') {
            if (params.force) return false;
            params.force = true;
            continue;
        }
        if (argvArr[i] === '-c' || argvArr[i] === '--config') {
            if (params.output || configFile || argvArr[i+1] === undefined || argvArr[i+1][0] === '-') return false;
            configFile = path.resolve(targetPath, argvArr[i+1]);
            if (!fs.existsSync(configFile)) return false;
            configFile = fs.readFileSync(configFile, {encoding: 'utf-8'}).split('\n');
            for (j = 0; j < configFile.length; j++) {
                f = configFile[j].replace(/\s+$/, '');
                if (f.length > 0) params.inputs.push(f);
            }
            i += 1;
            continue;
        }
    }
    if (params.inputs && params.output) {
        return true;
    } else {
        return false;
    }
    
}

function compress(targetPath, inputArr, ouptFile, type, cb) {
    new compressor.minify({
        type: 'yui-' + type,
        fileIn: inputArr,
        fileOut: ouptFile,
        callback: cb
    });
}

exports.bundle = function cmd(targetPath, argv, parseCallback, doneCallback) {
    var outstr = '/* Bundle result file */\n\n',
        outputType = null,
        i, fpath, ftype, tarr;
    if (argv.length === 0 || argv[0] == '-h' || argv[0] == '--help' || !parseParams(targetPath, argv)) {
        show_usage();
        doneCallback('Invalid arguments');
    } else {
        parseCallback(params);
        if (fs.existsSync(path.resolve(targetPath, params.output)) && !params.force) {
            return doneCallback('Ouput file already exist -- ' + params.output + '. You can use -f to overwrite.');
        }
        if (params.minify) {
            for (i = 0; i < params.inputs.length; i++) {
                if (!fs.existsSync(path.resolve(targetPath, params.inputs[i]))) {
                    return doneCallback('File not exist -- ' + params.inputs[i]);
                } else {
                    tarr = params.inputs[i].split('.');
                    ftype = tarr[tarr.length-1].toLowerCase();
                    if (tarr.length < 2 || (ftype !== 'css' && ftype !== 'js')) {
                        return doneCallback('File type unknown -- ' + params.inputs[i]);
                    }
                    if (!outputType) outputType = ftype;
                    if (outputType !== ftype) {
                        return doneCallback('Cannot mixin css file and js file when minify');
                    }
                }
            }
            compress(targetPath, params.inputs, params.output, outputType, doneCallback);
        } else {
            for (i = 0; i < params.inputs.length; i++) {
                if (!fs.existsSync(path.resolve(targetPath, params.inputs[i]))) {
                    return doneCallback('File not exist -- ' + params.inputs[i]);
                } else {
                    fpath = path.resolve(targetPath, params.inputs[i]);
                    outstr += '/* --------> Start of file: ' + fpath + ' */\n';
                    outstr += fs.readFileSync(fpath, {encoding: 'utf-8'});
                    outstr += '/* <-------- End of file: ' + fpath + ' */\n\n';
                }
            }
            fs.writeFileSync(path.resolve(targetPath, params.output), outstr, {encoding: 'utf8'});
            doneCallback(null);
        }
    }
};

exports.main = function(argv) {
    if (argv.length === 0 || argv[0] == '-h' || argv[0] == '--help') {
        return show_usage();
    }
    exports.bundle(process.cwd(), argv, function(p) {
        var outputstr = '';
        console.log('Bundling ' + (p.minify ? 'and minify ' : '') + 'the following file to ' + p.output + ':\n');
        for(var i = 0; i < p.inputs.length; i++){
            outputstr += p.inputs[i] + '\t';
        }
        console.log(outputstr + '\n');
    }, function(err) {
        if (err) {
            console.log('Error: ' + err);
        } else {
            console.log('Done.');
        }
    });
};

