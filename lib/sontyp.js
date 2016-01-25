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


/**
 * The Type class tracks a single type node (a schema), which could be
 * something as simple as a `number`, or as complicated as a `"type": "object"
 * schema. It is compatible with any allOf/anyOf/oneOf construct.
 */
class Type {
    /**
     * Or Type constructor initialises a bunch of different variables, which
     * need to be set for the conversion methods to function properly. Note
     * that no actual Typescript is written until we get to these conversion
     * methods.
     * @param {Sontyp} st - The Sontyp object that we're working from.
     * @param {Object} object - A valid JSON Schema.
     */
    constructor(st, object) {
        this.st = st;
        this.object = object;

        this.name = this.object.title ? tsifyString(this.object.title) : '';

        this.type = INLINE;
        this.converted = false;

        this.inline = null;
        this.block = '';

        this.hasAdditonals = false;
        this.additionals = '';

        // Initialise allOf, anyOf and oneOf properties.
        if('allOf' in this.object) {
            this.xOf(this.object.anyOf, '&');
        } else if('anyOf' in this.object) {
            this.xOf(this.object.anyOf, '|');
        } else if('oneOf' in this.object) {
            this.xOf(this.object.oneOf, '|');
        }

        // Everything with a title should be block-type.
        if('title' in this.object) {
            this.type = BLOCK;
            this.st.typesDone.push(this);
        }
    }

    /**
     * Since allOf, anyOf and oneOf function mostly in the same way for our
     * expected output, we've put them all in a single method. Here we simply
     * gather the items and set some extra variables. We call these options
     * "additionals".
     * @param {array} options - The array containing the schemas to be matched
     * against.
     * @param {string} separator - The separator to be inserted between the
     * items (like | or &).
     */
    xOf(options, separator) {
        let items = options.map((schema) => this.st.parseSchema(schema));

        this.hasAdditonals = true;
        this.additionalsItems = items;
        this.additionalsSep = ` ${separator} `;
    }

    /**
     * Start the conversion to Typescript definitions. We make sure this is
     * only runs once, and starting here we can actually write Typescript
     * definitions. An INLINE type can be put as a type expression (if
     * `this.inline` were Bar, you could use it like `{foo: Bar}`), while a
     * BLOCK type has a block-level definition, which should define a type (for
     * example, `type Foo = string`) but should also have an inline type, to
     * reference it.
     */
    convert() {
        if(this.converted) return;

        this.converted = true;

        // In case of additionals, convert them and create the additionals
        // string.
        if(this.hasAdditonals) {
            this.additionals = this.additionalsItems.map((t) => {
                t.convert();

                if(t.inline !== null) {
                    return t.inline;
                }
            }).join(this.additionalsSep);

            this.inline = this.additionals;
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
        if(this.additionals) {
            let add = ` & (${this.additionals})`;

            if(this.name == this.inline) {
                this.block = `type ${this.name} = ${this.additionals};`;
            } else {
                this.block = `type ${this.name} = ${this.inline}${add};`;
            }
            this.inline = this.name;
        } else {
            this.block = `type ${this.name} = ${this.inline};`;
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


/**
 * The Array Type has a property called `items`, which defines a JSON Schema
 * that the items in the array have to conform to. Note that we do not support
 * an `items` property defined as an array, since that wouldn't make sense in
 * Typescript definitions.
 */
class TArray extends Type {
    inlinify() {
        super.inlinify();

        let itemsType = this.st.parseSchema(this.object.items);
        itemsType.convert();

        // If there's any spaces in the type of the output (for example, if we
        // have a type like `string | number`, we should put parentheses around
        // it to make sure we're actually defining an array with items of
        // _either_ type, not the first time or an array of the last type.
        if(itemsType.inline !== null && itemsType.inline.indexOf(' ') !== -1) {
            this.inline = '(' + itemsType.inline + ')[]';
        } else {
            this.inline = itemsType.inline + '[]';
        }
    }
}


/**
 * What I've called a "TypeList" is pretty much just a simple array of types,
 * like `["string", "number"] and so on.
 */
class TTypeList extends Type {
    inlinify() {
        super.inlinify();

        // TODO: the types should be parsed!
        this.inline = this.object.type.join(' | ');
    }
}


/**
 * This is our most complex type, since it can have a lot of edge-cases. An
 * object type has a property called `properties`, which list several
 * properties that we can expect to see in a valid object. We try to be as
 * type-strict as possible, so we assume that `additionalProperties` is set to
 * `false`.
 */
class TObject extends Type {
    /**
     * The only special thing our constructor does is create a list of types,
     * and parse them. This is so we can later more easily generate definitions
     * from them.
     */
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

    /**
     * Since both our `inlinify` and `blockify` methods have mostly identical
     * output (`{property: Type; propertwo: Twope}`), we have extracted
     * creating that into this helper method.
     */
    createTypedef() {
        let typedef = `{\n`;

        for(let t of this.types) {
            // One of the two hardest thing in CompSci.
            // http://martinfowler.com/bliki/TwoHardThings.html
            let optionalityOperator = '?';
            if(t.required) optionalityOperator = '';

            t.type.convert();
            typedef += `${t.name}${optionalityOperator}: ${t.type.inline};\n`;
        }

        typedef += `}`;
        return typedef;
    }

    /**
     * An inline object type is very simple, since it's just the exact output
     * of the `createTypedef` method.
     */
    inlinify() {
        super.inlinify();

        this.inline = this.createTypedef();
        this.block = '';
    }

    /**
     * The block object type is a little tougher. We may not be able to use an
     * interface if we have additionals, but we should prefer it for
     * readability.
     */
    blockify() {
        this.inline = this.name;

        let inlineDef = this.createTypedef();

        if(this.additionals) {
            this.block = [
                `type ${this.name} = ${inlineDef} & (${this.additionals})`
            ].join('\n');
        } else {
            this.block = `interface ${this.name} ${inlineDef}\n\n`;
        }

        this.type = BLOCK;
    }
}


/**
 * The Reference type exists to prevent recursivity problems (a circular type
 * definition, in particular). It stores a reference to another type, which
 * should be added to the Sontyp object's `refsDone` array. We don't actually
 * have to do anything with it until we start _converting_. This way we make
 * sure to never pass a referenced object twice, or get stuck in a loop.
 */
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

        // If we've already had this schema (the id isn't new), we can simply
        // pass the Type generated then.
        if('id' in schema && schema.id in this.refsDone) {
            return this.refsDone[schema.id];
        }

        // A reference is a special case, the only one which needs to do
        // something else than simply initiate a new Type.
        if('$ref' in schema) {
            this.addByRef(schema.$ref);
            type = new TReference(this, schema);

        // The rest is simple Type initiations, sometimes with some advanced
        // logic, like the TypeList.
        } else if(schema.type && typeof schema.type !== 'string' && schema.type.length) {
            type = new TTypeList(this, schema);

        // Base types
        } else if(schema.type == 'string') {
            type = new TString(this, schema);
        } else if(schema.type == 'number' || schema.type == 'integer') {
            type = new TNumber(this, schema);
        } else if(schema.type == 'boolean') {
            type = new TBoolean(this, schema);

        // Array and objects check for the `items` and `properties` properties
        // as well as a defined type.
        } else if(schema.type == 'array' || 'items' in schema) {
            type = new TArray(this, schema);
        } else if(schema.type == 'object' || 'properties' in schema) {
            type = new TObject(this, schema);

        // And if we have a simple xOf, we just initiate a base Type, that'll
        // work.
        } else if('anyOf' in schema || 'allOf' in schema || 'oneOf' in schema) {
            type = new Type(this, schema);
        }

        // Save the schema in the `refsDone` array if we can reference it.
        if('id' in schema) {
            this.refsDone[schema.id] = type;
        }

        return type;
    }

    /**
     * The parse method works in three steps:
     * [1] Parse the schemas.
     * [2] Convert the schemas.
     * [3] Generate the text output.
     */
    parse() {
        // [1]
        while(this.schemasTodo.length > 0) {
            let schema = this.schemasTodo.pop();
            let type = this.parseSchema(schema);

            this.typesDone.push(type);
        }

        // [2]
        let typeNames = [];
        let finalTypes = [];
        while(this.typesDone.length > 0) {
            let type = this.typesDone.pop();
            type.convert();

            // We save typeNames so we don't output the same type several
            // times. Bad schema definitions may break from this.
            if(type.type == BLOCK && typeNames.indexOf(type.inline) < 0) {
                typeNames.push(type.inline);
                finalTypes.push(type.block);
            }
        }

        // [3]
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
