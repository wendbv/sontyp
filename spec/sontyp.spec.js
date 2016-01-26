'use strict';

var fs = require('fs');
var rewire = require('rewire');

var st = rewire('../lib/sontyp');

describe('Module', () => {
    beforeEach(() => {
        this.obj = {title: 'foo', type: 'object', properties: {}};
    });

    it('should export two functions', () => {
        expect(st).toEqual(jasmine.objectContaining({
            sontyp: jasmine.any(Function),
            Sontyp: jasmine.any(Function),
            gulpSontyp: jasmine.any(Function)
        }));
    });
});


describe('sontyp()', () => {
    beforeEach(() => {
        this.spy = jasmine.createSpy('Sontyp')
            .and.callFake(function() { return this; });
        this.addSchemaSpy = jasmine.createSpy('addSchema');
        this.parseSpy = jasmine.createSpy('parse');

        this.spy.prototype.addSchema = this.addSchemaSpy;
        this.spy.prototype.parse = this.parseSpy;

        this.reset = st.__set__({
            Sontyp: this.spy,
        });
    });
    afterEach(() => {
        this.reset();
    });


    it('should initialize Sontyp properly', () => {
        st.sontyp(this.obj, 'root');
        expect(this.spy).toHaveBeenCalledWith('root');
    });

    it('should call addSchema with our object', () => {
        st.sontyp(this.obj);
        expect(this.addSchemaSpy).toHaveBeenCalledWith(this.obj);
    });

    it('should start parsing', () => {
        st.sontyp(this.obj);
        expect(this.parseSpy).toHaveBeenCalled();
    });
});


describe('class Sontyp', () => {
    beforeEach(() => {
        this.s = new st.Sontyp();
    });
    afterEach(() => {
        delete this.s;
    });

    it('should add my thing when I tell it to', () => {
        this.s.addSchema({});

        expect(this.s.schemasTodo).toEqual(jasmine.arrayContaining([{}]));
    });

    it('should add my thing, however I decide to call it', () => {
        this.s.addSchema({title: 'foo'});

        expect(this.s.schemasTodo[0].title).toEqual('foo');
    });

    describe('parseSchema', () => {
        function createTypeSpy(name) {
            let spy = jasmine.createSpy(name)
                .and.callFake(function() { return this });

            let obj = {};
            obj[name] = spy;
            let reset = st.__set__(obj);

            return {constructor: spy, reset: reset};
        }

        it('should instantiate the right types', () => {
            let map = {
                'string': 'TString',
                'number': 'TNumber',
                'integer': 'TNumber',
                'boolean': 'TBoolean',
                'array': 'TArray',
            };

            for(let type in map) {
                let spy = createTypeSpy(map[type]);

                this.s.parseSchema({type: type});
                expect(spy.constructor).toHaveBeenCalled();

                spy.reset();
            }
        });

        it('should instantiate TTypeList for lists of types', () => {
            let spy = createTypeSpy('TTypeList');

            this.s.parseSchema({ type: ['string', 'number'] });
            expect(spy.constructor).toHaveBeenCalled();

            spy.reset();
        });

        it('should instantiate TArray for schemas with items', () => {
            let spy = createTypeSpy('TArray');

            this.s.parseSchema({items: {}});
            expect(spy.constructor).toHaveBeenCalled();

            spy.reset();
        });

        it('should instantiate TObject for schemas with properties', () => {
            let spy = createTypeSpy('TObject');

            this.s.parseSchema({properties: []});
            expect(spy.constructor).toHaveBeenCalled();

            spy.reset();
        });
    });
});




describe('Types', () => {
    let s;

    beforeEach(() => {
        s = new st.Sontyp();
    });

    describe('Base type', () => {
        let Type = st.__get__('Type');
        let t;

        beforeEach(() => {
            t = new Type(s, {});
        });

        it('should handle xOf right', () => {
            t.xOf([{type: 'string'}, {type: 'number'}], '&');

            expect(t.additionalsItems).toEqual([
                jasmine.any(st.__get__('TString')),
                jasmine.any(st.__get__('TNumber'))
            ]);
        });

        it('should not include null-type additionals', () => {
            t.xOf([{type: 'string'}, {type: 'null'}], '&');

            t.parseAdditionals();
            expect(t.additionals).toBe('string');
        });

        it('should blockify right', () => {
            t.name = 'foo';
            t.inline = 'bar';

            t.blockify();

            expect(t.block).toBe('type foo = bar;');
        });
    });


    describe('TArray', () => {
        let TArray = st.__get__('TArray');

        it('should parse properly', () => {
            spyOn(s, 'parseSchema')
                .and.returnValue({convert: () => {}, inline: 'foo'});

            let a = new TArray(s, {
                type: 'array',
                items: { 'type': 'foo' }
            });
            a.convert();
            expect(a.inline).toBe('foo[]');
        });
    });


    describe('TTypeList', () => {
        let TTypeList = st.__get__('TTypeList');

        it('should parse properly', () => {
            let t = new TTypeList(s, {
                type: ['foo', 'bar'],
            });
            t.convert();
            expect(t.inline).toBe('foo | bar');
        });
    });


    describe('TObject', () => {
        let TObject = st.__get__('TObject');

        it('should parse properly', () => {
            spyOn(s, 'parseSchema');
            spyOn(TObject.prototype, 'inlinify');

            let o = new TObject(s, {
                properties: {
                    foo: { type: 'bar' },
                    baz: { type: 'qux' },
                }
            });

            expect(s.parseSchema).toHaveBeenCalledWith({type: 'bar'});
            expect(s.parseSchema).toHaveBeenCalledWith({type: 'qux'});
        });

        it('should inlinify properly', () => {
            let o = new TObject(s, {});
            o.types = [{name: 'foo', type: {convert: () => {}, inline: 'bar'}, required: false}];

            o.inlinify();
            expect(o.inline).toBe('{\nfoo?: bar;\n}');
        });

        it('should blockify properly', () => {
            let o = new TObject(s, {title: 'foo'});

            o.inline = '{}';

            o.blockify();

            expect(o.block).toBe('interface Foo {\n}\n\n');
            expect(o.inline).toBe('Foo');
        });
    });
});
