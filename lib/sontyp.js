'use strict';

var path = require('path');


function tsifyString(str) {
    return str
        .replace(/[^\w\d _]/g, '')
        .replace(/_/g, ' ')
        .replace(/ (\w)/g, s => s.trim().toUpperCase())
        .replace(/^\w/, s => s.toUpperCase());
}


/**
 * The Sontyp parser object. It's fairly simple, but requires some shared
 * variables between its separate little parsers, so it's a class.
 */
class Sontyp {
    constructor(root) {
        this.root = root;

        this.typesDone = [];
        this.objectsDone = [];
        this.thingsTodo = [];
    }

    /**
     * A "thing", in Sontyp speak, is really anything with a type value or an
     * anyOf.
     * TODO: this should probably be named after the proper json-schema jargon,
     * but I don't know it, so I haven't.
     * @param {object} obj - The thing.
     * @param {string} name - Optionally give the thing a name, if it doesn't
     * have one yet.
     * @return {string} The eventual name that the TS type will have.
     */
    addThing(obj, name) {
        if(name) {
            obj.title = name;
        }
        this.thingsTodo.push(obj);
        return tsifyString(obj.title);
    }

    /**
     * Since json-schema does this cool thing called references, we need to be
     * able to resolve the paths in those and load things from these paths.
     * (really just calls Sontyp.addThing)
     * @param {string} ref - The path to the thing.
     * @return {string} See addThing.
     */
    addByRef(ref) {
        if(this.root) {
            ref = path.join(this.root, ref);
        }

        let fs = require("fs");
        let file = fs.readFileSync(ref, {encoding: "utf-8"});

        let obj = JSON.parse(file);

        return this.addThing(obj);
    }

    /**
     * Now this is where the magic happens. parseObject is the only method
     * that'll actually write Typescript type definitions.
     * @param {object} obj - The object to parse. NB: needs to have a title
     * parameter!
     * @return {string} The name of the TS type.
     */
    parseObject(obj) {
        let type = tsifyString(obj.title);
        if(this.typesDone.indexOf(type) !== -1) return type;

        let typedef = `interface ${type} {\n`;

        let objects = [];
        for(let name in obj.properties) {
            let res = this.parseThing(obj.properties[name], name);

            var req = '?';
            if(obj.required && obj.required.indexOf(name) != -1) {
                req = '';
            }

            typedef += `  ${res[0]}${req}: ${res[1]};\n`;
        }

        typedef += `}\n\n`;

        this.objectsDone.push(typedef);
        this.typesDone.push(type);
        return type;
    }

    /**
     * Since json-schema has a fairly complex typing system, we have this
     * separate function to parse anything that could be described as a type
     * definition.
     * @param {object} obj - The thing.
     * @param {string} name - The thing's name, not necessarily required, but
     * sometimes it is.
     * @return {array} An array of [property name, type]. Fairly simple, right?
     */
    parseThing(obj, name) {
        let type = obj.type;

        if('$ref' in obj) {
            type = this.addByRef(obj.$ref);

        } else if('anyOf' in obj) {
            type = obj.anyOf.map((thing) => this.parseThing(thing, name)[1]).join(' | ');
        } else if(typeof obj.type !== 'string' && obj.type.length) {
            type = obj.type.map((thing) => this.parseThing({type: thing}, name)[1]).join(' | ');

        } else {
            switch(obj.type) {
                case 'object':
                    if(name && !obj.title) {
                        obj.title = name;
                    }
                    type = this.parseObject(obj);
                    break;
                case 'array':
                    type = this.parseThing(obj.items, name)[1] + '[]';
                    break;
                case 'integer':
                    type = 'number';
                    break;
                case 'string':
                case 'boolean':
                    break;
                default:
                    type = 'any';
            }
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


function sontyp(json, root) {
    var s = new Sontyp(root);
    s.addThing(json);
    return s.parse();
}


module.exports = {
    sontyp: sontyp,
    Sontyp: Sontyp
};
