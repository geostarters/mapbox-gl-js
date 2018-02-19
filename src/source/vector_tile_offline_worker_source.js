// @flow

const util = require('../util/util');
const vt = require('@mapbox/vector-tile');
const Protobuf = require('pbf');
const VectorTileWorkerSource = require('./vector_tile_worker_source');
const WorkerTile = require('./worker_tile');
const Pako = require('pako');
const Abab = require('abab');
const perf = require('../util/performance');

import type {
    WorkerTileParameters,
    WorkerTileCallback,
    TileParameters
} from '../source/worker_source';

import type {
    LoadVectorData,
    LoadVectorDataCallback
} from '../source/vector_tile_worker_source';

import type Actor from '../util/actor';
import type StyleLayerIndex from '../style/style_layer_index';
import type {Callback} from '../types/callback';


/**
 * The {@link WorkerSource} implementation that supports {@link VectorTileSource}.
 * This class is designed to be easily reused to support custom source types
 * for data formats that can be parsed/converted into an in-memory VectorTile
 * representation.  To do so, create it with
 * `new VectorTileWorkerSource(actor, styleLayers, customLoadVectorDataFunction)`.
 *
 * @private
 */
class VectorTileOfflineWorkerSource extends VectorTileWorkerSource {
    /**
     * @param {Function} [loadVectorData] Optional method for custom loading of a VectorTile object based on parameters passed from the main-thread Source.  See {@link VectorTileWorkerSource#loadTile}.  The default implementation simply loads the pbf at `params.url`.
     */
    constructor(actor: Actor, layerIndex: StyleLayerIndex, loadVectorData: ?LoadVectorData) {
        super(actor, layerIndex, loadVectorData);
        this.loadVectorData = this.loadVectorDataOffline;
    }

    /**
     * Implements {@link WorkerSource#loadTile}.  Delegates to {@link VectorTileWorkerSource#loadVectorData} (which by default expects a `params.url` property) for fetching and producing a VectorTile object.
     *
     * @param {Object} params
     * @param {string} params.source The id of the source for which we're loading this tile.
     * @param {string} params.uid The UID for this tile.
     * @param {Object} params.tileID
     * @param {TileCoord} params.coord
     * @param {number} params.zoom
     * @param {number} params.overscaling
     * @param {number} params.angle
     * @param {number} params.pitch
     * @param {number} params.cameraToCenterDistance
     * @param {number} params.cameraToTileDistance
     * @param {boolean} params.showCollisionBoxes
     */
    loadTile(params: WorkerTileParameters, callback: WorkerTileCallback) {
        const uid = params.uid;

        if (!this.loading)
            this.loading = {};

        const workerTile = this.loading[uid] = new WorkerTile(params);
        workerTile.abort = this.loadVectorData(params, (err, response) => {
            delete this.loading[uid];

            if (err || !response) {
                return callback(err);
            }

            const rawTileData = response.rawData;
            const cacheControl = {};
            if (response.expires) cacheControl.expires = response.expires;
            if (response.cacheControl) cacheControl.cacheControl = response.cacheControl;
            const resourceTiming = {};
            if (params.request && params.request.collectResourceTiming) {
                const resourceTimingData = perf.getEntriesByName(params.request.url);
                // it's necessary to eval the result of getEntriesByName() here via parse/stringify
                // late evaluation in the main thread causes TypeError: illegal invocation
                if (resourceTimingData)
                    resourceTiming.resourceTiming = JSON.parse(JSON.stringify(resourceTimingData));
            }

            workerTile.vectorTile = response.vectorTile;
            workerTile.parse(response.vectorTile, this.layerIndex, this.actor, (err, result) => {
                if (err || !result) return callback(err);

                // Transferring a copy of rawTileData because the worker needs to retain its copy.
                callback(null, util.extend({rawTileData: rawTileData.slice(0)}, result, cacheControl, resourceTiming));
            });

            this.loaded = this.loaded || {};
            this.loaded[uid] = workerTile;
        });
    }

    /**
     * Implements {@link WorkerSource#reloadTile}.
     *
     * @param {Object} params
     * @param {string} params.source The id of the source for which we're loading this tile.
     * @param {string} params.uid The UID for this tile.
     */
    reloadTile(params: WorkerTileParameters, callback: WorkerTileCallback) {
        const loaded = this.loaded,
            uid = params.uid,
            vtSource = this;
        if (loaded && loaded[uid]) {
            const workerTile = loaded[uid];

            if (workerTile.status === 'parsing') {
                workerTile.reloadCallback = callback;
            } else if (workerTile.status === 'done') {
                workerTile.parse(workerTile.vectorTile, this.layerIndex, this.actor, done.bind(workerTile));
            }

        }

        function done(err, data) {
            if (this.reloadCallback) {
                const reloadCallback = this.reloadCallback;
                delete this.reloadCallback;
                this.parse(this.vectorTile, vtSource.layerIndex, vtSource.actor, reloadCallback);
            }

            callback(err, data);
        }
    }

    /**
     * Implements {@link WorkerSource#abortTile}.
     *
     * @param {Object} params
     * @param {string} params.source The id of the source for which we're loading this tile.
     * @param {string} params.uid The UID for this tile.
     */
    abortTile(params: TileParameters) {
        const loading = this.loading,
            uid = params.uid;
        if (loading && loading[uid] && loading[uid].abort) {
            loading[uid].abort();
            delete loading[uid];
        }
    }

    /**
     * Implements {@link WorkerSource#removeTile}.
     *
     * @param {Object} params
     * @param {string} params.source The id of the source for which we're loading this tile.
     * @param {string} params.uid The UID for this tile.
     */
    removeTile(params: TileParameters) {
        const loaded = this.loaded,
            uid = params.uid;
        if (loaded && loaded[uid]) {
            delete loaded[uid];
        }
    }

    /**
     * The result passed to the `loadVectorData` callback must conform to the interface established
     * by the `VectorTile` class from the [vector-tile](https://www.npmjs.com/package/vector-tile)
     * npm package. In addition, it must have a `rawData` property containing an `ArrayBuffer`
     * with protobuf data conforming to the
     * [Mapbox Vector Tile specification](https://github.com/mapbox/vector-tile-spec).
     *
     * @class VectorTile
     * @property {ArrayBuffer} rawData
     * @private
     */

    /**
     * @callback LoadVectorDataCallback
     * @param {Error?} error
     * @param {VectorTile?} vectorTile
     * @private
     */

    /**
     * @param {Object} params
     * @param {string} params.url The URL of the tile PBF to load.
     * @param {LoadVectorDataCallback} callback
     */
    loadVectorDataOffline(params: WorkerTileParameters, callback: LoadVectorDataCallback) {

        //console.debug("loadVectorData");

        this.getArrayBufferFromBlob(params.blob, done.bind(this));
        return () => {};
        function done(err, response) {
            if (err) {
                return callback(err);
            } else if (response) {
                callback(null, {
                    vectorTile: new vt.VectorTile(new Protobuf(response.data)),
                    rawData: response.data,
                    cacheControl: response.cacheControl,
                    expires: response.expires
                });
            }
        }

    }

    getArrayBufferFromBlob(blob: ?Blob, callback: Callback<Object>) {

        if (typeof blob === 'undefined') {
            callback(undefined,
                {
                    data: undefined,
                    cacheControl: null,
                    expires: null
                });
        } else if (blob) {

            const l = Abab.atob(blob);
            const a = l.length;
            const s = new Uint8Array(a);

            for (let d = 0; a > d; ++d) {
                s[d] = l.charCodeAt(d);
            }
            const n = Pako.inflate(s);

            callback(undefined,
                {
                    data: n,
                    cacheControl: null,
                    expires: null
                });
        }
    }

}

module.exports = VectorTileOfflineWorkerSource;
