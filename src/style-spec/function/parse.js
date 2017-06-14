'use strict';
// @flow

const {
    NullType,
    NumberType,
    StringType,
    BooleanType,
} = require('./types');

const expressions = require('./expressions');

/*::
 import type { PrimitiveType, TypeName, VariantType, VectorType, ArrayType, AnyArrayType, NArgs, LambdaType, Type } from './types.js';

 import type { TypeError, TypedLambdaExpression, TypedLiteralExpression, TypedExpression } from './type_check.js';

 import type { ExpressionName } from './expressions.js';
*/

module.exports = parseExpression;

/**
 * Parse raw JSON expression into a TypedExpression structure, with type
 * tags taken directly from the definition of each function (i.e.,
 * no inference performed).
 *
 * @private
 */
function parseExpression(expr: any, path: Array<number> = []) /*: TypedExpression */ {
    const key = path.join('.');
    if (typeof expr === 'undefined') return {
        literal: true,
        value: null,
        type: NullType,
        key
    };

    if (typeof expr === 'string') return {
        literal: true,
        value: expr,
        type: StringType,
        key
    };

    if (typeof expr === 'number') return {
        literal: true,
        value: expr,
        type: NumberType,
        key
    };

    if (typeof expr === 'boolean') return {
        literal: true,
        value: expr,
        type: BooleanType,
        key
    };

    if (!Array.isArray(expr)) {
        throw new Error(`${key}: expected an array, but found ${typeof expr} instead.`);
    }

    const op = expr[0];
    const definition = expressions[op];
    if (!definition) {
        throw new Error(`${key}: unknown function ${op}`);
    }

    return {
        literal: false,
        name: op,
        type: definition.type,
        arguments: expr.slice(1).map((arg, i) => parseExpression(arg, path.concat(i + 1))),
        key
    };
}

