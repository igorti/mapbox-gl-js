/*
 * Construct a new vector tile feature given a buffer.
 *
 * @param {object} buffer
 * @param {number} [end]
 * @param {extent}
 * @param {object} keys
 * @param {object} values
 */
function VectorTileFeature(buffer, end, extent, keys, values) {
    this._buffer = buffer;
    this._type = 0;
    this._geometry = -1;
    this._triangulation = -1;
    this.extent = extent;

    if (typeof end === 'undefined') {
        end = buffer.length;
    }

    var val, tag;
    while (buffer.pos < end) {
        val = buffer.readVarint();
        tag = val >> 3;

        if (tag == 1) {
            this._id = buffer.readVarint();
        } else if (tag == 2) {
            var tag_end = buffer.pos + buffer.readVarint();
            while (buffer.pos < tag_end) {
                var key = keys[buffer.readVarint()];
                var value = values[buffer.readVarint()];
                this[key] = value;
            }
        } else if (tag == 4) {
            this._geometry = buffer.pos;
            buffer.skip(val);
        } else if (tag == 5) {
            this._triangulation = buffer.pos;
            buffer.skip(val);
        } else if (tag == 6) {
            this.vertex_count = buffer.readVarint();
        } else {
            buffer.skip(val);
        }
    }
}

/*
 * Given a buffer, return a new buffer of a different size but the same
 * type.
 *
 * @param {object} buffer
 * @param {number} size
 * @return {object} buffer
 */
function realloc(buffer, size) {
    if (!size) size = (buffer.length + 1024) * 2;
    var newBuffer = new buffer.constructor(size);
    newBuffer.set(buffer);
    newBuffer.pos = buffer.pos;
    newBuffer.idx = buffer.idx;
    return newBuffer;
}

VectorTileFeature.prototype.loadGeometry = function(labels) {
    var buffer = this._buffer;
    buffer.pos = this._geometry;

    var bytes = buffer.readVarint();
    var end = buffer.pos + bytes;

    var cmd = 1;
    var length = 0;
    var x = 0, y = 0;

    var lines = [];
    var line = null;

    while (buffer.pos < end) {
        if (!length) {
            var cmd_length = buffer.readVarint();
            cmd = cmd_length & 0x7;
            length = cmd_length >> 3;
        }

        length--;

        if (cmd == 1 || cmd == 2) {
            x += buffer.readSVarint();
            y += buffer.readSVarint();

            if (cmd == 1) {
                // moveTo
                if (line) {
                    lines.push(line);
                }
                line = [];
            }

            line.push({ x: x, y: y });
        } else if (cmd == 7) {
            // closePolygon
            line.push(line[0]);
        } else {
            throw new Error('unknown command ' + cmd);
        }
    }

    if (line) {
        lines.push(line);
    }

    return lines;
};