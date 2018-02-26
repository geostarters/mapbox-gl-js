// @flow

const {normalizeGlyphsURL} = require('../util/mapbox');
const ajax = require('../util/ajax');
const parseGlyphPBF = require('./parse_glyph_pbf');

import type {StyleGlyph} from './style_glyph';
import type {RequestTransformFunction} from '../ui/map';
import type {Callback} from '../types/callback';

module.exports = function (fontstack: string,
                           range: number,
                           urlTemplate: string,
                           requestTransform: RequestTransformFunction,
                           callback: Callback<{[number]: StyleGlyph | null}>) {
    const begin = range * 256;
    const end = begin + 255;

    if(urlTemplate.indexOf("file://") === -1) {

        const request = requestTransform(
            normalizeGlyphsURL(urlTemplate)
                .replace('{fontstack}', fontstack)
                .replace('{range}', `${begin}-${end}`),
            ajax.ResourceType.Glyphs);

        ajax.getArrayBuffer(request, (err, response) => {
            if (err) {
                callback(err);
            } else if (response) {
                const glyphs = {};

                for (const glyph of parseGlyphPBF(response.data)) {
                    glyphs[glyph.id] = glyph;
                }

                callback(null, glyphs);
            }
        });

    } else {

        if(window.resolveLocalFileSystemURL){

            const url = urlTemplate.replace('{fontstack}', fontstack)
                .replace('{range}', `${begin}-${end}`);

            window.resolveLocalFileSystemURL(url, function(fileEntry) {

                fileEntry.file(function(file) {
                    var reader = new FileReader();

                    reader.onloadend = function(e) {
                        const glyphs = {};

                        for (const glyph of parseGlyphPBF(reader.result)) {
                            glyphs[glyph.id] = glyph;
                        }
        
                        callback(null, glyphs);
                    }

                    reader.readAsArrayBuffer(file);
                });

            }, function(e) {

                callback(e.code);

            });

        }else{

            throw new Error('vector tile Offline sources need cordova-sqlite-ext extended -----> https://github.com/jessisena/cordova-sqlite-ext');

        }

    }


};
