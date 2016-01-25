'use strict';

var path = require('path');


function tsifyString(str) {
    return str
        .replace(/[^\w\d _]/g, '')
        .replace(/_/g, ' ')
        .replace(/ (\w)/g, s => s.trim().toUpperCase())
        .replace(/^\w/, s => s.toUpperCase());
}


const INLINE = 0;
const BLOCK = 1;


class Type {
    constructor(st, object) {
        this.st = st;
        this.object = object;

        this.name = this.object.title ? tsifyString(this.object.title) : '';
        this.objName = this.name;

        this.type = INLINE;
        this.converted = false;

        this.inline = null;
        this.block = '';

        this.hasAdditonals = false;
        this.additionals = '';

        if('allOf' in this.object) {
            this.xOf(this.object.anyOf, '&');
        } else if('anyOf' in this.object) {
            this.xOf(this.object.anyOf, '|');
        } else if('oneOf' in this.object) {
            this.xOf(this.object.oneOf, '|');
        }

        if('title' in this.object) {
            this.type = BLOCK;
            this.st.typesDone.push(this);
        }
    }

    xOf(options, separator) {
        let items = options.map((schema) => this.st.parseSchema(schema));

        this.hasAdditonals = true;
        this.additionalsItems = items;
        this.additionalsSep = ` ${separator} `;
    }

    convert() {
        if(this.converted) return;

        this.converted = true;

        if(this.hasAdditonals) {
            this.additionals = this.additionalsItems.map((t) => {
                t.convert();

                if(t.inline !== null) {
                    return t.inline;
                }
            }).join(this.additionalsSep);

            this.inline = this.additionals;
            this.objName = '_' + this.objName;
        }

        if(this.type == INLINE) {
            this.inlinify();
        } else if(this.type == BLOCK) {
            this.blockify();
        }
    }

    inlinify() {
        this.type = INLINE;
    }

    blockify() {
        this.type = BLOCK;

        let add = '';
        if(this.name == this.objName && this.additionals) {
            add = ` & (${this.additionals})`;

            this.block = `type ${this.name} = ${this.inline}${add};`;
            this.inline = this.name;
        } else {
            this.block = `type ${this.name} = ${this.additionals};`;
            this.inline = this.name;
        }
    }
}


class TNumber extends Type {
    inlinify() {
        super.inlinify();
        this.inline = 'number';
    }
}
class TString extends Type {
    inlinify() {
        super.inlinify();
        this.inline = 'string';
    }
}
class TBoolean extends Type {
    inlinify() {
        super.inlinify();
        this.inline = 'boolean';
    }
}
class TNull extends Type {
    inlinify() {
        super.inlinify();
        this.inline = null;
    }
}


class TArray extends Type {
    inlinify() {
        super.inlinify();

        let itemsType = this.st.parseSchema(this.object.items);
        itemsType.convert();

        if(itemsType.inline !== null &&
           itemsType.inline.indexOf(' ') !== -1 &&
           itemsType.inline.substr(-1) !== '}') {
            this.inline = '(' + itemsType.inline + ')[]';
        } else {
            this.inline = itemsType.inline + '[]';
        }
    }
}


class TTypeList extends Type {
    inlinify() {
        super.inlinify();

        this.inline = this.object.type.join(' | ');
    }
}


class TObject extends Type {
    constructor(st, object) {
        super(st, object);

        this.types = [];

        for(let name in this.object.properties) {
            this.types.push({
                name: name,
                type: this.st.parseSchema(this.object.properties[name]),
                required: this.object.required && this.object.required.indexOf(name) > -1
            });
        }
    }

    createTypedef() {
        let typedef = `{\n`;

        for(let t of this.types) {
            let optionalityOperator = '?';
            if(t.required) optionalityOperator = '';

            t.type.convert();
            typedef += `${t.name}${optionalityOperator}: ${t.type.inline};\n`;
        }

        typedef += `}`;
        return typedef;
    }

    inlinify() {
        super.inlinify();

        this.inline = this.createTypedef();
        this.block = '';
    }

    blockify() {
        this.inline = this.name;

        let inlineDef = this.createTypedef();
        let typedef = `interface ${this.objName} ${inlineDef}\n\n`;

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

        this.type = BLOCK;
    }
}


class TReference extends Type {
    convert() {
        if(this.converted) return;

        this.converted = true;
        let referenced = this.st.refsDone[this.object.$ref];

        if(!referenced.converted) {
            referenced.convert();
            referenced.blockify();

            this.st.typesDone.push(referenced);
        }

        this.inline = referenced.inline;
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
        this.refsDone = {};
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
        if(ref in this.refsDone) {
            return;
        }

        let fs = require("fs");
        let file = fs.readFileSync(ref, {encoding: "utf-8"});

        let obj = JSON.parse(file);
        this.parseSchema(obj);
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

        if('id' in schema && schema.id in this.refsDone) {
            return this.refsDone[schema.id];
        }

        if('$ref' in schema) {
            this.addByRef(schema.$ref);
            type = new TReference(this, schema);

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

        if('id' in schema) {
            this.refsDone[schema.id] = type;
        }

        return type;
    }

    parse() {
        while(this.schemasTodo.length > 0) {
            let schema = this.schemasTodo.pop();
            let type = this.parseSchema(schema);

            this.typesDone.push(type);
        }

        let typeNames = [];
        let finalTypes = [];
        while(this.typesDone.length > 0) {
            let type = this.typesDone.pop();
            type.convert();

            if(type.type == BLOCK && typeNames.indexOf(type.inline) < 0) {
                typeNames.push(type.inline);
                finalTypes.push(type.block);
            }
        }

        return finalTypes.join('\n\n');
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
