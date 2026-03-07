/**
 * DrawTool.js - Freehand drawing tool.
 * Click and drag to paint tiles continuously.
 */
class DrawTool extends BaseTool {
    constructor(app) {
        super(app);
        this.name = 'draw';
        this._lastTileX = -1;
        this._lastTileY = -1;
    }

    onMouseDown(e, tileX, tileY) {
        if (!this.selection || !this.layer) return;
        this.isDrawing = true;
        this._lastTileX = -1;
        this._lastTileY = -1;
        this.app.history.beginAction(this.app.tileMap.activeLayerIndex, this.layer);
        this._drawAt(tileX, tileY);
        this.app.mapCanvas.render();
    }

    onMouseMove(e, tileX, tileY) {
        if (!this.isDrawing) return;
        this._drawAt(tileX, tileY);
        this.app.mapCanvas.render();
    }

    onMouseUp(e, tileX, tileY) {
        if (this.isDrawing) {
            this.isDrawing = false;
            this.app.history.endAction(this.layer);
        }
    }

    _drawAt(tileX, tileY) {
        if (tileX === this._lastTileX && tileY === this._lastTileY) return;
        this._lastTileX = tileX;
        this._lastTileY = tileY;

        // If we have a line from last position, interpolate
        this.placeTile(tileX, tileY);
    }

    getCursor() { return 'crosshair'; }
}
