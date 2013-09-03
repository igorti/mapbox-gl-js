importScripts('/js/lib/underscore.js', '/js/protobuf.js', '/js/vectortile.js', '/js/geometry.js');


var mappings = {};

self.actor.on('set mapping', function(data) {
    mappings = data;
});

function VectorTileLayerLoader(buffer, end) {
    this._buffer = buffer;

    this.version = 1;
    this.name = null;
    this.extent = 4096;
    this.length = 0;

    this._keys = [];
    this._values = [];
    this._features = [];

    if (typeof end === 'undefined') {
        end = buffer.length;
    }

    var val, tag;
    while (buffer.pos < end) {
        val = buffer.readVarint();
        tag = val >> 3;
        if (tag == 15) {
            this.version = buffer.readVarint();
        } else if (tag == 1) {
            this.name = buffer.readString();
        } else if (tag == 5) {
            this.extent = buffer.readVarint();
        } else if (tag == 2) {
            this.length++;
            this._features.push(buffer.pos);
            buffer.skip(val);
        } else if (tag == 3) {
            this._keys.push(buffer.readString());
        } else if (tag == 4) {
            this._values.push(VectorTileLayerLoader.readFeatureValue(buffer));
        } else if (tag == 6) {
            this.vertex_count = buffer.readVarint();
        } else {
            console.warn('skipping', tag);
            buffer.skip(val);
        }
    }
}

VectorTileLayerLoader.readFeatureValue = function(buffer) {
    var value = null;

    var bytes = buffer.readVarint();
    var val, tag;
    var end = buffer.pos + bytes;
    while (buffer.pos < end) {
        val = buffer.readVarint();
        tag = val >> 3;

        if (tag == 1) {
            value = buffer.readString();
        } else if (tag == 2) {
            throw new Error('read float');
        } else if (tag == 3) {
            value = buffer.readDouble();
        } else if (tag == 4) {
            value = buffer.readVarint();
        } else if (tag == 5) {
            throw new Error('read uint');
        } else if (tag == 6) {
            value = buffer.readSVarint();
        } else if (tag == 7) {
            value = Boolean(buffer.readVarint());
        } else {
            buffer.skip(val);
        }
    }

    return value;
};

function VectorTileLoader(buffer, end) {
    this._buffer = buffer;
    this.layers = {};

    if (typeof end === 'undefined') {
        end = buffer.length;
    }

    var val, tag;
    while (buffer.pos < end) {
        val = buffer.readVarint();
        tag = val >> 3;
        if (tag == 3) {
            var layer_bytes = buffer.readVarint();
            var layer_end = buffer.pos + layer_bytes;
            var layer = new VectorTileLayerLoader(buffer, layer_end);
            if (layer.length) {
                this.layers[layer.name] = layer;
            }
            buffer.pos = layer_end;
        } else {
            buffer.skip(val);
        }
    }
}

function LoaderManager() {
    this.loading = {};
};

LoaderManager.prototype.load = function(url, respond) {
    var mgr = this;
    this.loading[url] = this.loadBuffer(url, function(err, buffer) {
        delete mgr.loading[url];
        if (err) {
            respond(err);
        }
        else {
            try {
                var tile = new VectorTileLoader(new Protobuf(buffer));
                mgr.parseTile(tile, respond);
            }
            catch (err) {
                respond(err);
            }
        }
    });
};

LoaderManager.prototype.abort = function(url) {
    if (this.loading[url]) {
        this.loading[url].abort();
        delete this.loading[url];
    }
}

LoaderManager.prototype.loadBuffer = function(url, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.responseType = "arraybuffer";
    xhr.onload = function(e) {
        if (xhr.status >= 200 && xhr.status < 300 && xhr.response) {
            callback(null, new Uint8Array(xhr.response));
        } else {
            callback(xhr.statusText);
        }
    };
    xhr.send();
    return xhr;
}

LoaderManager.prototype.parseTile = function(data, respond) {
    var layers = {}, geometry = new Geometry();
    var tile = new VectorTile(data);
    mappings.forEach(function(mapping) {
        var layer = tile.layers[mapping.layer];
        if (layer) {
            var buckets = {}; for (var key in mapping.sort) buckets[key] = [];

            for (var i = 0; i < layer.length; i++) {
                var feature = layer.feature(i);
                for (var key in mapping.sort) {
                    if (mapping.sort[key] === true ||
                        mapping.sort[key].indexOf(feature[mapping.field]) >= 0) {
                        buckets[key].push(feature);
                        break;
                    }
                }
            }

            // All features are sorted into buckets now. Add them to the geometry
            // object and remember the position/length
            for (var key in buckets) {
                var layer = layers[key] = {
                    line: geometry.lineOffset(),
                    fill: geometry.fillOffset()
                };

                // Add all the features to the geometry
                var bucket = buckets[key];
                for (var i = 0; i < bucket.length; i++) {
                    bucket[i].drawNative(geometry);
                }

                layer.lineEnd = geometry.lineOffset();
                layer.fillEnd = geometry.fillOffset();
            }
        }
    });

    /*
    // add labels to map.
    for (var name in this.data.layers) {
        if (name.indexOf("_label") < 0) continue;
        var layer = this.data.layers[name];

        for (var i = 0; i < layer.length; i++) {
            // console.warn(layer.feature(i));
            // get the centroid of the feature
        }
    }
    */
    respond(null, {
        vertices: geometry.vertices,
        lineElements: geometry.lineElements,
        fillElements: geometry.fillElements,
        layers: layers
    }, [ data._buffer.buf.buffer ]);
}

var manager = new LoaderManager();

self.actor.on('load tile', function(url, respond) {
    manager.load(url, respond);
});

self.actor.on('abort tile', function(url, respond) {
    manager.abort(url);
});