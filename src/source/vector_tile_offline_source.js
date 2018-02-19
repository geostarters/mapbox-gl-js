// @flow

const Evented = require('../util/evented');
const VectorTileSource = require('./vector_tile_source');

import type Dispatcher from '../util/dispatcher';
import type { DbObject } from '../types/db';
import type Tile from './tile';
import type {Callback} from '../types/callback';

class VectorTileOfflineSource extends VectorTileSource {
    db: DbObject

    constructor(id: string, options: VectorSourceSpecification & {collectResourceTiming: boolean}, dispatcher: Dispatcher, eventedParent: Evented) {
        super(id, options, dispatcher, eventedParent);

        this.type = 'vector-offline';
        //this.db = options.db;

        if (window.sqlitePlugin && options && options.tiles && options.tiles.length > 0) {

            this.db = window.sqlitePlugin.openDatabase(
                JSON.parse(options.tiles[0])
, () => {

                }, () => {
                    throw new Error('vector tile Offline sources not opened');
                });

        } else {
            throw new Error('vector tile Offline sources need cordova-sqlite-ext extended -----> https://github.com/jessisena/cordova-sqlite-ext');
        }
    }


    readTile(z: number, x: number, y: number, db: DbObject): Promise<Blob | void> {

        return new Promise(((resolve, reject) => {

            const query = 'SELECT tile_data as myTile FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?';
            const params = [z, x, y];

            db.executeSql(query, params,
            (res) => {
                if (res.rows.length > 0) {
                    //console.debug("MBTiles BLOB SELECTED OK" );
                    resolve(res.rows.item(0).myTile);
                } else {
                    resolve(undefined);
                }

            }, (error) => {
                //console.debug("MBTiles BLOB SELECTED KO" );
                reject(error);
            }
            );

        }));

    }

    loadTile(tile: Tile, callback: Callback<void>) {
        const coord = { z: tile.tileID.overscaledZ, x: tile.tileID.canonical.x, y: tile.tileID.canonical.y };
        const overscaling = coord.z > this.maxzoom ? Math.pow(2, coord.z - this.maxzoom) : 1;
        const newZ = ((coord.z < this.maxzoom) ? coord.z : Math.floor(this.maxzoom));
        const coordY = Math.pow(2, newZ) - 1 - coord.y;

        const params = {
            //url: normalizeURL(tile.coord.url(this.tiles, this.maxzoom, this.scheme), this.url),
            blob: undefined,
            uid: tile.uid,
            tileID: tile.tileID,
            coord: coord,
            zoom: coord.z,
            tileSize: this.tileSize * overscaling,
            type: this.type,
            source: this.id,
            overscaling: overscaling,
            angle: this.map.transform.angle,
            pitch: this.map.transform.pitch,
            //Calen?
            cameraToCenterDistance: this.map.transform.cameraToCenterDistance,
            showCollisionBoxes: this.map.showCollisionBoxes
        };


        function readTileSuccess(blob: Blob | void) {

            if (blob) {

                params.blob = blob;

            }

            if (!tile.workerID || tile.state === 'expired') {
                tile.workerID = this.dispatcher.send('loadTile', params, done.bind(this));
            } else if (tile.state === 'loading') {
                // schedule tile reloading after it has been loaded
                tile.reloadCallback = callback;
            } else {
                this.dispatcher.send('reloadTile', params, done.bind(this), tile.workerID);
            }

            function done(err, data) {
                if (tile.aborted)
                    return;

                if (err) {
                    return callback(err);
                }

                if (this.map._refreshExpiredTiles) tile.setExpiryData(data);
                tile.loadVectorData(data, this.map.painter);

                callback(null);

                if (tile.reloadCallback) {
                    this.loadTile(tile, tile.reloadCallback);
                    tile.reloadCallback = null;
                }
            }

        }

        function readTileError(err: Error) {
            return callback(err);
        }

        this.readTile(newZ, coord.x, coordY, this.db).then(
            readTileSuccess.bind(this), readTileError.bind(this)
        );


    }

}

module.exports = VectorTileOfflineSource;
