// @flow

const util = require('../util/util');
const Evented = require('../util/evented');
const RasterTileSource = require('./raster_tile_source');
const Texture = require('../render/texture');

import type Dispatcher from '../util/dispatcher';
import type Tile from './tile';
import type {Callback} from '../types/callback';
import type {Coordinates} from '../types/coordinates';
import type {DbObject} from '../types/db';


class RasterTileSourceOffline extends RasterTileSource {

    db: DbObject;
    imageFormat: string;

    constructor(id: string, options: RasterSourceSpecification | RasterDEMSourceSpecification, dispatcher: Dispatcher, eventedParent: Evented) {
        super(id, options, dispatcher, eventedParent);
        this.id = id;
        this.dispatcher = dispatcher;
        this.setEventedParent(eventedParent);

        this.type = 'raster-offline';
        this.minzoom = 0;
        this.maxzoom = 22;
        this.roundZoom = true;
        this.scheme = 'xyz';
        this.tileSize = 512;
        this.imageFormat = 'png';
        this._loaded = false;
        this._options = util.extend({}, options);
        util.extend(this, util.pick(options, ['scheme', 'tileSize', 'imageFormat']));

        if (window.sqlitePlugin && options.tiles && options.tiles.length > 0) {

            this.db = window.sqlitePlugin.openDatabase(
                JSON.parse(options.tiles[0]), () => {

                }, () => {
                    throw new Error('vector tile Offline sources not opened');
                });

        } else {
            throw new Error('vector tile Offline sources need cordova-sqlite-ext extended -----> https://github.com/jessisena/cordova-sqlite-ext');
        }

    }

    loadTile(tile: Tile, callback: Callback<void>) {

        const coord = { z: tile.tileID.overscaledZ, x: tile.tileID.canonical.x, y: tile.tileID.canonical.y };
        tile.request = this._getImage(coord, done.bind(this));

        function done(err, img) {
            delete tile.request;

            if (tile.aborted) {
                tile.state = 'unloaded';
                return callback(null);
            } else if (err) {
                tile.state = 'errored';
                return callback(err);
            } else if (img) {

                if (this.map._refreshExpiredTiles) tile.setExpiryData(img);
                delete img.cacheControl;
                delete img.expires;

                const context = this.map.painter.context;
                const gl = context.gl;
                tile.texture = this.map.painter.getTileTexture(img.width);
                if (tile.texture) {
                    gl.bindTexture(gl.TEXTURE_2D, tile.texture);
                    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, img);
                } else {
                    tile.texture = new Texture(context, img, gl.RGBA);
                    tile.texture.bind(gl.LINEAR, gl.CLAMP_TO_EDGE, gl.LINEAR_MIPMAP_NEAREST);

                    if (context.extTextureFilterAnisotropic) {
                        gl.texParameterf(gl.TEXTURE_2D, context.extTextureFilterAnisotropic.TEXTURE_MAX_ANISOTROPY_EXT, context.extTextureFilterAnisotropicMax);
                    }
                }
                gl.generateMipmap(gl.TEXTURE_2D);

                tile.state = 'loaded';

                callback(null);

            }
        }
    }

    _getBlob(coord: Coordinates, callback: Callback<Object>) {

        const coordY = Math.pow(2, coord.z) - 1 - coord.y;
        console.log(coordY);

        const query = 'SELECT tile_data as myTile FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?';
        const params = [coord.z, coord.x, coordY];

        const base64Prefix = `data:image/${this.imageFormat};base64,`;


        this.db.executeSql(query, params,
            function (res) {
                if (res.rows.length > 0) {

                    callback(undefined,
                        {
                            data: base64Prefix + res.rows.item(0).myTile,
                            cacheControl: null,
                            expires: null
                        });

                } else {
                    callback(undefined,
                        {
                            data: this._transparentPngUrl,
                            cacheControl: null,
                            expires: null
                        });
                }

            }, () => {
                callback(new Error("Error"), null);
            }
        );

    }


    _getImage(coord: Coordinates, callback: Callback<Object>) {

        return this._getBlob(coord, (err, imgData) => {
            if (err) return callback(err);
            else if (imgData) {

                const img = new window.Image();
                const URL = window.URL || window.webkitURL;
                img.onload = () => {
                    callback(null, img);
                    URL.revokeObjectURL(img.src);
                };
                img.cacheControl = imgData.cacheControl;
                img.expires = imgData.expires;
                img.src = imgData.data;

            }

        });

    }
}

module.exports = RasterTileSourceOffline;
