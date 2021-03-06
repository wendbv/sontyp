var through = require('through2');
var path = require('path');

var gutil = require('gulp-util');
var PluginError = gutil.PluginError;
var File = gutil.File;

var sontyp = require('./sontyp');

module.exports = function(file, root) {
    if(!file) {
        throw new PluginError('gulp-sontyp', 'Missing file option for gulp-sontyp');
    }
    var st = new sontyp.Sontyp(root);
    var lastFile;

    if (typeof file === 'string') {
        fileName = file;
    } else if (typeof file.path === 'string') {
        fileName = path.basename(file.path);
    } else {
        throw new PluginError('gulp-sontyp', 'Missing path in file options for gulp-sontyp');
    }

    var buffer = function(file, encoding, callback) {
        if(file.isNull()) {
            callback();
            return;
        }

        if(file.isStream()) {
            this.emit('error', new PluginError('gulp-sontyp', 'Streaming not supported'));
            callback();
            return;
        }

        lastFile = file;
        st.addSchema(JSON.parse(file.contents));

        callback();
    };

    var endStream = function(callback) {
        var outFile;

        if (typeof file === 'string') {
            outFile = lastFile.clone({contents: false});
            outFile.path = path.join(lastFile.base, file);
        } else {
            outFile = new File(file);
        }
        outFile.contents = new Buffer(st.parse());

        this.push(outFile);
        callback();
    }

    return through.obj(buffer, endStream);
};
