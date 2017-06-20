'use strict';

// @flow

const assert = require('assert');

const {
    NumberType,
    StringType,
    BooleanType,
    ColorType,
    ObjectType,
    ValueType,
    InterpolationType,
    typename,
    variant,
    vector,
    array,
    anyArray,
    lambda,
    nargs
} = require('./types');

/*::
 import type { PrimitiveType, TypeName, VariantType, VectorType, ArrayType, AnyArrayType, NArgs, LambdaType, Type } from './types.js';

 import type { TypeError, TypedLambdaExpression, TypedLiteralExpression, TypedExpression } from './type_check.js';

 import type { CompiledExpression } from './compile.js';

 export type ExpressionName = "literal" | "ln2" | "pi" | "e" | "string" | "number" | "boolean" | "json_array" | "object" | "get" | "has" | "at" | "typeof" | "length" | "zoom" | "properties" | "geometry_type" | "id" | "case" | "match" | "is_error" | "==" | "!=" | ">" | ">=" | "<=" | "<" | "&&" | "||" | "!" | "curve" | "step" | "exponential" | "linear" | "cubic-bezier" | "+" | "-" | "*" | "/" | "%" | "^" | "log10" | "ln" | "log2" | "sin" | "cos" | "tan" | "asin" | "acos" | "atan" | "ceil" | "floor" | "round" | "abs" | "min" | "max" | "concat" | "upcase" | "downcase" | "rgb" | "rgba" | "color" | "color_to_array"

 type Definition = {
     name: ExpressionName,
     type: Type,
     compile: (expr: TypedExpression, args: Array<CompiledExpression>) => ({ js?: string, errors?: Array<string>, isFeatureConstant?: boolean, isZoomConstant?: boolean })
 }
 */

const expressions: { [string]: Definition } = {
    'ln2': defineMathConstant('ln2'),
    'pi': defineMathConstant('pi'),
    'e': defineMathConstant('e'),
    'string': {
        name: 'string',
        type: lambda(StringType, ValueType),
        compile: (_, args) => ({ js: `String(${args[0].js})` })
    },
    'number': {
        name: 'string',
        type: lambda(NumberType, ValueType),
        compile: (_, args) => ({js: `Number(${args[0].js})`})
    },
    'boolean': {
        name: 'boolean',
        type: lambda(BooleanType, ValueType),
        compile: (_, args) => ({js: `Boolean(${args[0].js})`})
    },
    'json_array': {
        name: 'json_array',
        type: lambda(vector(ValueType), ValueType),
        compile: fromContext('asArray')
    },
    'object': {
        name: 'object',
        type: lambda(ObjectType, ValueType),
        compile: fromContext('asObject')
    },
    'color': {
        name: 'color',
        type: lambda(ColorType, StringType),
        compile: fromContext('color')
    },
    'color_to_array': {
        name: 'color_to_array',
        type: lambda(array(NumberType, 4), ColorType),
        compile: (_, args) => ({js: `${args[0].js}.value`})
    },
    'get': {
        name: 'get',
        type: lambda(ValueType, ObjectType, StringType),
        compile: fromContext('get')
    },
    'has': {
        name: 'has',
        type: lambda(BooleanType, ObjectType, StringType),
        compile: (_, args) => ({js: `${args[0].js}.hasOwnProperty(${args[1].js})`})
    },
    'at': {
        name: 'at',
        type: lambda(
            typename('T'),
            variant(vector(typename('T')), anyArray(typename('T'))),
            NumberType
        ),
        compile: (_, args) => ({js: `${args[0].js}[${args[1].js}]`})
    },
    'typeof': {
        name: 'typeof',
        type: lambda(StringType, ValueType),
        compile: fromContext('typeOf')
    },
    'length': {
        name: 'length',
        type: lambda(NumberType, variant(
            vector(typename('T')),
            StringType
        )),
        compile: (_, args) => ({js: `${args[0].js}.length`})
    },
    'properties': {
        name: 'properties',
        type: lambda(ObjectType),
        compile: () => ({
            js: 'this.asObject(props)',
            isFeatureConstant: false
        })
    },
    'geometry_type': {
        name: 'geometry_type',
        type: lambda(StringType),
        // TODO: should yield error if missing
        compile: () => ({
            js: '(feature.geometry || {}).type || null',
            isFeatureConstant: false
        })
    },
    'id': {
        name: 'id',
        type: lambda(ValueType),
        // TODO: should yield error if missing
        compile: () => ({
            js: 'typeof feature.id === "undefined" ? null : feature.id',
            isFeatureConstant: false
        })
    },
    'zoom': {
        name: 'zoom',
        type: lambda(NumberType),
        compile: () => ({js: 'mapProperties.zoom', isZoomConstant: false})
    },
    '+': defineBinaryMathOp('+', true),
    '*': defineBinaryMathOp('*', true),
    '-': defineBinaryMathOp('-'),
    '/': defineBinaryMathOp('/'),
    '%': defineBinaryMathOp('%'),
    '^': {
        name: '^',
        type: lambda(NumberType, NumberType, NumberType),
        compile: (_, args) => ({js: `Math.pow(${args[0].js}, ${args[1].js})`})
    },
    'log10': defineMathFunction('log10', 1),
    'ln': defineMathFunction('ln', 1, 'log'),
    'log2': defineMathFunction('log2', 1),
    'sin': defineMathFunction('sin', 1),
    'cos': defineMathFunction('cos', 1),
    'tan': defineMathFunction('tan', 1),
    'asin': defineMathFunction('asin', 1),
    'acos': defineMathFunction('acos', 1),
    'atan': defineMathFunction('atan', 1),
    '==': defineComparisonOp('=='),
    '!=': defineComparisonOp('!='),
    '>': defineComparisonOp('>'),
    '<': defineComparisonOp('<'),
    '>=': defineComparisonOp('>='),
    '<=': defineComparisonOp('<='),
    '&&': defineBooleanOp('&&'),
    '||': defineBooleanOp('||'),
    '!': {
        name: '!',
        type: lambda(BooleanType, BooleanType),
        compile: (_, args) => ({js: `!(${args[0].js})`})
    },
    'upcase': {
        name: 'upcase',
        type: lambda(StringType, StringType),
        compile: (_, args) => ({js: `(${args[0].js}).toUpperCase()`})
    },
    'downcase': {
        name: 'downcase',
        type: lambda(StringType, StringType),
        compile: (_, args) => ({js: `(${args[0].js}).toLowerCase()`})
    },
    'concat': {
        name: 'concat',
        type: lambda(StringType, nargs(ValueType)),
        compile: (_, args) => ({js: `[${args.map(a => a.js).join(', ')}].join('')`})
    },
    'rgb': {
        name: 'rgb',
        type: lambda(ColorType, NumberType, NumberType, NumberType),
        compile: fromContext('rgba')
    },
    'rgba': {
        name: 'rgb',
        type: lambda(ColorType, NumberType, NumberType, NumberType, NumberType),
        compile: fromContext('rgba')
    },
    'case': {
        name: 'case',
        type: lambda(typename('T'), nargs(BooleanType, typename('T')), typename('T')),
        compile: (_, args) => {
            args = [].concat(args);
            const result = [];
            while (args.length > 1) {
                const c = args.splice(0, 2);
                result.push(`${c[0].js} ? ${c[1].js}`);
            }
            assert(args.length === 1); // enforced by type checking
            result.push(args[0].js);
            return { js: result.join(':') };
        }
    },
    'match': {
        name: 'match',
        // note that, since they're pulled out during parsing, the input
        // values of type T aren't reflected in the signature here
        type: lambda(typename('T'), typename('U'), nargs(typename('T'))),
        compile: (e, args) => {
            if (!e.matchInputs) { throw new Error('Missing match input values'); }
            const inputs = e.matchInputs;
            if (args.length !== inputs.length + 2) {
                return {
                    errors: [`Expected ${2 * inputs.length + 2} arguments, but found ${inputs.length + args.length} instead.`]
                };
            }

            const input = args[0].js;
            const outputs = args.slice(1).map(a => `() => ${a.js}`);
            const inputMap = {};
            for (let i = 0; i < inputs.length; i++) {
                for (const value of inputs[i]) {
                    inputMap[String(value)] = i;
                }
            }

            return {js: `
            (function () {
                var outputs = [${outputs.join(', ')}];
                var inputMap = ${JSON.stringify(inputMap)};
                var input = ${input};
                var outputIndex = inputMap[${input}];
                return typeof outputIndex === 'number' ? outputs[outputIndex]() :
                    outputs[${outputs.length - 1}]();
            }.bind(this))()`};
        }
    },

    'curve': {
        name: 'curve',
        type: lambda(typename('T'), InterpolationType, NumberType, nargs(NumberType, typename('T'))),
        compile: (_, args) => {
            const interpolation = args[0].expression;
            if (interpolation.literal) { throw new Error('Invalid interpolation type'); } // enforced by type checking

            let resultType;
            if (args[3].type === NumberType) {
                resultType = 'number';
            } else if (args[3].type === ColorType) {
                resultType = 'color';
            } else {
                return {
                    errors: [`Type ${args[3].type.name} is not interpolatable, and thus cannot be used as a curve's output type.`]
                };
            }

            const stops = [];
            const outputs = [];
            for (let i = 2; (i + 1) < args.length; i += 2) {
                const input = args[i].expression;
                const output = args[i + 1];
                if (!input.literal || typeof input.value !== 'number') {
                    return {
                        errors: [ 'Input/output pairs for "curve" expressions must be defined using literal numeric values (not computed expressions) for the input values.' ]
                    };
                }

                if (stops.length && stops[stops.length - 1] >= input.value) {
                    return {
                        errors: [ 'Input/output pairs for "curve" expressions must be arranged with input values in strictly ascending order.' ]
                    };
                }

                stops.push(input.value);
                outputs.push(`() => ${output.js}`);
            }

            if (stops.length === 1) return {js: `${outputs[0]}`};

            const interpolationOptions: Object = {
                name: interpolation.name
            };

            if (interpolation.name === 'exponential') {
                const baseExpr = interpolation.arguments[0];
                if (!baseExpr.literal || typeof baseExpr.value !== 'number') {
                    return {errors: ["Exponential interpolation base must be a literal number value."]};
                }
                interpolationOptions.base = baseExpr.value;
            }

            // TODO: investigate how this code is optimized in V8
            return {js: `
            (function () {
                var input = ${args[1].js};
                var stopInputs = [${stops.join(', ')}];
                var stopOutputs = [${outputs.join(', ')}];
                return this.evaluateCurve(${args[1].js}, stopInputs, stopOutputs, ${JSON.stringify(interpolationOptions)}, ${JSON.stringify(resultType)});
            }.bind(this))()`};
        }
    },
    'step': {
        name: 'step',
        type: lambda(InterpolationType),
        compile: () => ({ js: 'void 0' })
    },
    'exponential': {
        name: 'exponential',
        type: lambda(InterpolationType, NumberType),
        compile: () => ({ js: 'void 0' })
    },
    'linear': {
        name: 'step',
        type: lambda(InterpolationType),
        compile: () => ({ js: 'void 0' })
    }
};

module.exports = expressions;

function defineMathConstant(name) {
    const mathName = name.toUpperCase();
    assert(typeof Math[mathName] === 'number');
    return {
        name: name,
        type: lambda(NumberType),
        compile: () => ({ js: `Math.${mathName}` })
    };
}

function defineMathFunction(name: ExpressionName, arity: number, mathName?: string) {
    const key:string = mathName || name;
    assert(typeof Math[key] === 'function');
    assert(arity > 0);
    const args = [];
    while (arity-- > 0) args.push(NumberType);
    return {
        name: name,
        type: lambda(NumberType, ...args),
        compile: (_, args) => ({ js: `Math.${key}(${args.map(a => a.js).join(', ')})` })
    };
}

function defineBinaryMathOp(name, isAssociative) {
    const args = isAssociative ? [nargs(NumberType)] : [NumberType, NumberType];
    return {
        name: name,
        type: lambda(NumberType, ...args),
        compile: (_, args) => ({ js: `${args.map(a => a.js).join(name)}` })
    };
}

function defineComparisonOp(name) {
    const op = name === '==' ? '===' :
        name === '!=' ? '!==' : name;
    return {
        name: name,
        type: lambda(BooleanType, typename('T'), typename('T')),
        compile: (_, args) => ({ js: `${args[0].js} ${op} ${args[1].js}` })
    };
}

function defineBooleanOp(op) {
    return {
        name: op,
        type: lambda(BooleanType, nargs(BooleanType)),
        compile: (_, args) => ({ js: `${args.map(a => a.js).join(op)}` })
    };
}

function fromContext(name) {
    return (_, args) => {
        const argvalues = args.map(a => a.js).join(', ');
        return { js: `this.${name}(${argvalues})` };
    };
}
