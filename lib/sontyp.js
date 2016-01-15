'use strict';

var path = require('path');


function tsifyString(str) {
    return str
        .replace(/[^\w\d _]/g, '')
        .replace(/_/g, ' ')
        .replace(/ (\w)/g, s => s.trim().toUpperCase())
        .replace(/^\w/, s => s.toUpperCase());
}


class SontypError extends Error {
    constructor(message, obj) {
        if(typeof obj !== 'undefined') {
            let objStr = JSON.stringify(obj);
            message = `Object ${objStr} ${message}`;
        }

        super(message);
        this.message = message;
        this.name = 'SontypError';
    }
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
        this.schemasTodo = [];

        let unboundTypeMap = {
            'object': this._parseObject,
            'array': this._parseArray,

            'number': this._parseNumber,
            'integer': this._parseNumber,

            'string': this._parsePassThrough,
            'boolean': this._parsePassThrough,

            'null': this._parseNull,
        };
        this.typeMap = {};
        Object.keys(unboundTypeMap).map((val) => {
            this.typeMap[val] = unboundTypeMap[val].bind(this);
        });
    }

    /**
     * A schema is really anything with a type value or some xOf.
     * @param {object} obj - The thing.
     * @param {string} name - Optionally give the thing a name, if it doesn't
     * have one yet.
     * @return {string} The eventual name that the TS type will have.
     */
    addSchema(schema, name) {
        if(name) {
            schema.title = name;
        } else if(typeof schema.title === 'undefined') {
            throw new SontypError('has no title and no name has been given.', schema);
        }

        this.schemasTodo.push(schema);
        return tsifyString(schema.title);
    }

    /**
     * Since json-schema does this cool thing called references, we need to be
     * able to resolve the paths in those and load things from these paths.
     * (really just calls Sontyp.addSchema)
     * @param {string} ref - The path to the thing.
     * @return {string} See addSchema.
     */
    addByRef(ref) {
        if(this.root) {
            ref = path.join(this.root, ref);
        }

        let fs = require("fs");
        let file = fs.readFileSync(ref, {encoding: "utf-8"});

        let obj = JSON.parse(file);

        return this.addSchema(obj);
    }

    /**
     * Now this is where the magic happens. parseObject is the only method
     * that'll actually write Typescript type definitions.
     * @param {object} obj - The object to parse. NB: needs to have a title
     * parameter!
     * @return {string} The name of the TS type.
     */
    createInterface(obj) {
        if(!obj.title) throw SontypError('has no title.', obj);

        let type = tsifyString(obj.title);
        if(this.typesDone.indexOf(type) !== -1) return type;

        let typedef = `interface ${type} {\n`;

        let objects = [];
        for(let name in obj.properties) {
            let res = this.parseSchema(obj.properties[name], name);

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


    _parseXOf(obj, name) {
        let items = obj.anyOf.map((thing) => {
            return this.parseSchema(thing, name)[1];
        }).join(' | ')

        let type = items;
        return [name, type];
    }

    _parseTypeList(obj, name) {
        let items = obj.type.map(
            (thing) => {
                let type = this.parseSchema({type: thing}, name)[1];
                if(type !== null) return type;
            });
        return [name, items.join(' | ')];
    }

    _parseObject(obj, name) {
        if(name && !obj.title) {
            obj.title = name;
        } else if(obj.title) {
            name = obj.title;
        }
        return [name, this.createInterface(obj)];
    }

    _parseArray(obj, name) {
        let itemsType = this.parseSchema(obj.items, name);
        itemsType = itemsType[1];
        if(itemsType.indexOf(' ') !== -1) {
            itemsType = '(' + itemsType + ')';
        }
        let type = itemsType + '[]';

        return [name, type];
    }

    _parseNumber(obj, name) {
        return [name, 'number'];
    }

    _parsePassThrough(obj, name) {
        return [name, obj.type];
    }

    _parseNull(obj, name) {
        return [name, null];
    }


    /**
     * Since json-schema has a fairly complex typing system, we have this
     * separate function to parse anything that could be described as a type
     * definition - a schema.
     * @param {object} schema - The schema.
     * @param {string} name - The schema's name, not necessarily required, but
     * sometimes it is.
     * @return {array} An array of [property name, type]. Fairly simple, right?
     */
    parseSchema(schema, name) {
        let type = schema.type;

        if('$ref' in schema) {
            return [name, this.addByRef(schema.$ref)];

        } else if('anyOf' in schema) {
            return this._parseXOf(schema, name);

        } else if(schema.type && typeof schema.type !== 'string' && schema.type.length) {
            return this._parseTypeList(schema, name);

        } else if(schema.type in this.typeMap) {
            return this.typeMap[schema.type](schema, name);
        }

        return [name, 'any'];
    }

    parse() {
        while(this.schemasTodo.length > 0) {
            this.parseSchema(this.schemasTodo.pop());
        }

        return this.objectsDone.join('\n');
    }
}


function sontyp(json, root) {
    var s = new Sontyp(root);
    s.addSchema(json);
    return s.parse();
}


module.exports = {
    sontyp: sontyp,
    Sontyp: Sontyp
};
module.exports.gulpSontyp = require('./gulp-sontyp');
