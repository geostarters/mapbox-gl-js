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
 import type { TypeError, TypedExpression } from './type_check.js';

 import type { ExpressionName } from './expressions.js';

 export type ParseError = {|
     error: string,
     key: string
 |}
*/

module.exports = parseExpression;

/**
 * Parse raw JSON expression into a TypedExpression structure, with type
 * tags taken directly from the definition of each function (i.e.,
 * no inference performed).
 *
 * @private
 */
function parseExpression(expr: any, path: Array<number> = []) /*: TypedExpression | ParseError */ {
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
        return {
            key,
            error: `Expected an array, but found ${typeof expr} instead.`
        };
    }

    const op = expr[0];
    const definition = expressions[op];
    if (!definition) {
        return {
            key,
            error: `Unknown function ${op}`
        };
    }

    const args = [];
    for (const arg of expr.slice(1)) {
        const parsedArg = parseExpression(arg, path.concat(1 + args.length));
        if (parsedArg.error) {
            return parsedArg;
        }
        args.push(parsedArg);
    }

    return {
        literal: false,
        name: op,
        type: definition.type,
        arguments: args,
        key
    };
}

