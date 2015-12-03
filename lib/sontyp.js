'use strict';


function tsifyString(str) {
    return str
        .replace(/[^\w\d _]/g, '')
        .replace(/_/g, ' ')
        .replace(/ (\w)/g, s => s.trim().toUpperCase());
}


class Sontyp {
    constructor() {
        this.objectsDone = [];
        this.thingsTodo = [];
    }

    addThing(obj, name) {
        if(name) {
            obj.title = name;
        }
        this.thingsTodo.push(obj);
    }

    parseObject(obj) {
        let type = tsifyString(obj.title);
        let typedef = `interface ${type} {\n`;

        let objects = [];
        for(let name in obj.properties) {
            let res = this.parseThing(obj.properties[name], name);
            typedef += `  ${res[0]}: ${res[1]},\n`;
        }

        typedef += `}\n\n`;

        this.objectsDone.push(typedef);
        return type;
    }

    addByRef(ref) {
        let fs = require("fs");
        let file = fs.readFileSync(ref, {encoding: "utf-8"});

        let obj = JSON.parse(file);

        this.addThing(obj);
        return tsifyString(obj.title);
    }

    parseThing(obj, name) {
        if('$ref' in obj) {
            return [name, this.addByRef(obj.$ref)];
        }

        let type = obj.type;

        switch(obj.type) {
            case 'object':
                if(name) {
                    obj.title = name;
                }
                type = this.parseObject(obj);
                break;
            case 'array':
                type = this.parseThing(obj.items, name)[1] + '[]';
                break;
            case 'integer':
            case 'string':
                break;
        }

        return [name, type];
    }

    parse() {
        while(this.thingsTodo.length > 0) {
            this.parseThing(this.thingsTodo.pop());
        }

        return this.objectsDone.join('\n');
    }
}


function sontypFile(filename) {
    var fs = require("fs");
    var file = fs.readFileSync(filename, {encoding: "utf-8"});

    var obj = JSON.parse(file);

    sontyp(obj);
}


function sontyp(json) {
    var s = new Sontyp();
    s.addThing(json);
    return s.parse();
}


module.exports = function(json) {
    process.stdout.write(sontyp(json));
}
