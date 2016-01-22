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


class Type {
    constructor(st, object) {
        this.st = st;
        this.object = object;

        this.name = this.object.title ? tsifyString(this.object.title) : '';
        this.objName = this.name;

        this.inline = null;
        this.block = '';

        this.additionals = '';

        if('allOf' in this.object) {
            this.xOf(this.object.anyOf, '&');
        } else if('anyOf' in this.object) {
            this.xOf(this.object.anyOf, '|');
        } else if('oneOf' in this.object) {
            this.xOf(this.object.oneOf, '|');
        }

        this.parse();

        if('title' in this.object) {
            this.blockify();
        }
    }

    xOf(options, separator) {
        let items = options.map((schema) => this.st.parseSchema(schema).inline);

        let sep = ` ${separator} `;
        this.additionals = items.join(sep);

        this.objName = '_' + this.objName;
    }

    parse() { }

    inlinify() { }

    blockify() {
        let add = '';
        if(this.additionals) {
            add = ` & (${this.additionals})`;
        }

        this.block = `type ${this.name} = ${this.inline}${add};`;
        this.inline = this.name;
    }
}


class TNumber extends Type {
    parse() {
        this.inline = 'number';
    }
}
class TString extends Type {
    parse() {
        this.inline = 'string';
    }
}
class TBoolean extends Type {
    parse() {
        this.inline = 'boolean';
    }
}
class TNull extends Type {
    parse() {
        this.inline = null;
    }
}


class TArray extends Type {
    parse() {
        let itemsType = this.st.parseSchema(this.object.items);

        if(itemsType.inline.indexOf(' ') !== -1) {
            this.inline = '(' + itemsType.inline + ')[]';
        } else {
            this.inline = itemsType.inline + '[]';
        }
    }
}


class TTypeList extends Type {
    constructor(st, object) {
        super(st, object);

        this.inline = object.type.join(' | ');
    }
}


class TObject extends Type {
    parse() {
        this.types = [];

        for(let name in this.object.properties) {
            this.types.push({
                name: name,
                type: this.st.parseSchema(this.object.properties[name]),
                required: this.object.required && this.object.required.indexOf(name) != -1
            });
        }

        this.inlinify();
    }

    inlinify() {
        let typedef = `{\n`;

        for(let t of this.types) {
            let req = t.required ? '?' : '';

            typedef += `  ${t.name}${req}: ${t.type.inline};\n`;
        }

        typedef += `}`;

        this.inline = typedef;
        this.block = '';
    }

    blockify() {
        let typedef = `interface ${this.objName} ${this.inline}\n\n`;
        this.inline = this.name;

        if(this.additionals) {
            let add = '';
            if(this.additionals) {
                add = ` & (${this.additionals})`;
            }

            if(this.objName == this.name) {
                this.objName = '_' + this.name;
            }
        }

        if(this.objName != this.name) {
            this.block = `type ${this.name} = ${this.objName}${this.additionals};\n${typedef}`;
        } else {
            this.block = typedef;
        }
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
        this.titledTypesDone = {};

        this.schemasTodo = [];
    }

    /**
     * A schema is really anything with a type value or some xOf.
     * @param {object} obj - The schema.
     */
    addSchema(schema) {
        this.schemasTodo.push(schema);
    }

    /**
     * Since json-schema does this cool thing called references, we need to be
     * able to resolve the paths in those and load things from these paths.
     * (really just calls Sontyp.parseSchema)
     * @param {string} ref - The path to the thing.
     * @return {Type}
     */
    addByRef(ref) {
        if(this.root) {
            ref = path.join(this.root, ref);
        }

        let fs = require("fs");
        let file = fs.readFileSync(ref, {encoding: "utf-8"});

        let obj = JSON.parse(file);
        let type = this.parseSchema(obj);

        return type;
    }

    /**
     * Since json-schema has a fairly complex typing system, we have this
     * separate function to parse anything that could be described as a type
     * definition - a schema.
     * @param {object} schema - The schema.
     * @return {Type} An instance of one of the different possible Type
     * subclasses.
     */
    parseSchema(schema) {
        let type;

        if('$ref' in schema) {
            type = this.addByRef(schema.$ref);

        } else if(schema.type && typeof schema.type !== 'string' && schema.type.length) {
            type = new TTypeList(this, schema);

        } else if(schema.type == 'string') {
            type = new TString(this, schema);
        } else if(schema.type == 'number' || schema.type == 'integer') {
            type = new TNumber(this, schema);
        } else if(schema.type == 'boolean') {
            type = new TBoolean(this, schema);

        } else if(schema.type == 'array' || 'items' in schema) {
            type = new TArray(this, schema);
        } else if(schema.type == 'object' || 'properties' in schema) {
            type = new TObject(this, schema);

        } else if('anyOf' in schema || 'allOf' in schema || 'oneOf' in schema) {
            type = new Type(this, schema);
        }

        return type;
    }

    parse() {
        while(this.schemasTodo.length > 0) {
            let schema = this.schemasTodo.pop();
            let type = this.parseSchema(schema);

            this.typesDone.push(type);
        }

        return this.typesDone.map(type => type.block).join('\n\n');
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
