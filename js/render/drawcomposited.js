'use strict';

var mat4 = require('../lib/glmatrix.js').mat4;

module.exports = drawComposited;

function drawComposited (gl, painter, buckets, layerStyle, params, style, layer) {
    var texture = painter.namedRenderTextures[layer.name];
    if (!texture) return console.warn('missing render texture ' + layer.name);

    gl.disable(gl.STENCIL_TEST);
    gl.stencilMask(0x00);

    gl.switchShader(painter.compositeShader, mat4.create());
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(painter.compositeShader.u_image, 0);

    gl.uniform1f(painter.compositeShader.u_opacity, layerStyle.opacity);

    gl.bindBuffer(gl.ARRAY_BUFFER, painter.backgroundBuffer);
    gl.vertexAttribPointer(painter.compositeShader.a_pos, 2, gl.SHORT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.enable(gl.STENCIL_TEST);

    painter.freeRenderTexture(name);
}
