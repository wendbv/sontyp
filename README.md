# sontyp
[![Travis](https://img.shields.io/travis/wendbv/sontyp.svg)](https://travis-ci.org/wendbv/sontyp)
[![Coveralls](https://img.shields.io/coveralls/wendbv/sontyp.svg)](https://coveralls.io/github/wendbv/sontyp)


Sontyp is a somewhat advanced converter, converting from json-schema to Typescript.

## Specific to Sontyp
JSON Schema by itself isn't very strict, and thus in a lot of cases, Sontyp
will have to make a bunch of assumptions. If, instead, you validate your
schemas against our more [strict schema definition][strict], the returned
definitions will be a lot more predictable and reliable.

## Usage
```
var sontyp = require('sontyp');

// Simple example: we'll read our schemas from the ./schemas/ directory, and
// save them to a file schemas.d.ts
const fs = require('fs');
let obj = JSON.parse(fs.readFileSync('schemas/entry.json'));

// Pass it along to sontyp
let dts = sontyp.sontyp(obj, 'schemas/');

// Write whatever we got to a .d.ts file
fs.writeFileSync('schemas.d.ts', dts);
```

[strict]: http://wendbv.github.io/sontyp/json-schema-strict.json
