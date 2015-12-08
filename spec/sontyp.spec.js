'use strict';

var fs = require('fs');
var rewire = require('rewire');

var st = rewire('../lib/sontyp');

describe('Sontyp', () => {
    beforeEach(() => {
        this.obj = {title: 'foo', type: 'object', properties: {}};
    });

    it('should export two functions', () => {
        expect(st).toEqual(jasmine.objectContaining({
            sontyp: jasmine.any(Function),
            Sontyp: jasmine.any(Function)
        }));
    });


    describe('the function', () => {
        beforeEach(() => {
            this.spy = jasmine.createSpy('Sontyp')
                .and.callFake(function() { return this; });
            this.addThingSpy = jasmine.createSpy('addThing');
            this.parseSpy = jasmine.createSpy('parse');

            this.spy.prototype.addThing = this.addThingSpy;
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

        it('should call addThing with our object', () => {
            st.sontyp(this.obj);
            expect(this.addThingSpy).toHaveBeenCalledWith(this.obj);
        });

        it('should start parsing', () => {
            st.sontyp(this.obj);
            expect(this.parseSpy).toHaveBeenCalled();
        });
    });


    describe('the "class"', () => {
        beforeEach(() => {
            this.s = new st.Sontyp();
        });
        afterEach(() => {
            delete this.s;
        });

        it('should add my thing when I tell it to', () => {
            this.s.addThing(this.obj);

            expect(this.s.thingsTodo).toEqual(jasmine.arrayContaining([this.obj]));
        });

        it('should add my thing, however I decide to call it', () => {
            this.s.addThing(this.obj, 'foo');

            expect(this.s.thingsTodo[0].title).toEqual('foo');
        });

        describe('.parseThing', () => {
            it('should parse an object properly', () => {
                let res = this.s.parseThing(this.obj);

                expect(res).toEqual([undefined, 'Foo']);
            });

            it('should parse an integer properly', () => {
                let res = this.s.parseThing({type: 'integer'}, 'foo');

                expect(res).toEqual(['foo', 'number']);
            });

            it('should parse a string properly', () => {
                let res = this.s.parseThing({type: 'string'}, 'foo');

                expect(res).toEqual(['foo', 'string']);
            });

            it('should parse a simple or properly', () => {
                let res = this.s.parseThing({type: ['string', 'integer']}, 'foo');

                expect(res).toEqual(['foo', 'string | number']);
            });

            it('should parse an array of strings properly', () => {
                let res = this.s.parseThing({
                    type: 'array',
                    items: {'type': 'string'}
                }, 'foo');

                expect(res).toEqual(['foo', 'string[]']);
            });


            describe('when called with an array of objects,', () => {
                beforeEach(() => {
                    this.obj2 = {
                        type: 'array',
                        items: {
                            'type': 'object',
                            'properties': {'bar': {'type': 'string'}}
                        }
                    };
                });

                it('should parse an array of objects properly', () => {
                    let res = this.s.parseThing(this.obj2, 'foo');

                    expect(res).toEqual(['foo', 'Foo[]']);
                });

                it('should parse the object', () => {
                    spyOn(this.s, 'parseObject');
                    let res = this.s.parseThing(this.obj2, 'foo');

                    expect(this.s.parseObject).toHaveBeenCalledWith(this.obj2.items);
                });
            });

            it('should handle an anyOf correctly', () => {
                spyOn(this.s, 'parseThing').and.callThrough();
                let res = this.s.parseThing({
                    'anyOf': [
                        {'type': 'string'},
                        {'type': 'integer'},
                    ]
                }, 'foo');

                expect(this.s.parseThing).toHaveBeenCalledWith({'type': 'string'}, 'foo');
                expect(this.s.parseThing).toHaveBeenCalledWith({'type': 'integer'}, 'foo');
            });
        });

        describe('.parseObject', () => {
            beforeEach(() => {
                this.obj = {
                    title: 'foo', type: 'object',
                    properties: {
                        bar: {type: "integer"}
                    }
                };
                this.objTypeDef = [
                    'interface Foo {',
                    '  bar: number;',
                    '}'
                ].join('\n');
            });

            it('should return the right type', () => {
                var type = this.s.parseObject(this.obj);
                expect(type).toEqual('Foo');
            });

            it('should add a correct type definition to objectsDone', () => {
                var type = this.s.parseObject(this.obj);
                expect(this.s.objectsDone.length).toEqual(1);

                expect(this.s.objectsDone[0].trim()).toEqual(this.objTypeDef);
            });

            it('should register its type as done', () => {
                this.s.parseObject(this.obj);
                expect(this.s.typesDone.indexOf('Foo')).not.toBe(-1);
            });

            it('shouldn\'t do anything if the type is in typesDone', () => {
                this.s.typesDone.push('Foo');
                spyOn(this.s, 'parseThing').and.callThrough();

                this.s.parseObject(this.obj);
                expect(this.s.parseThing).not.toHaveBeenCalled();
            });
        });
    });
});