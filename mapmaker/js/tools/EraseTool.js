/**
 * EraseTool.js - Eraser tool. Click and drag to remove tiles.
 */
class EraseTool extends BaseTool {
    constructor(app) {
        super(app);
        this.name = 'erase';
        this._lastTileX = -1;
        this._lastTileY = -1;
    }

    onMouseDown(e, tileX, tileY) {
        if (!this.layer) return;
        this.isDrawing = true;
        this._lastTileX = -1;
        this._lastTileY = -1;
        this.app.history.beginAction(this.app.tileMap.activeLayerIndex, this.layer);
        this._eraseAt(tileX, tileY);
        this.app.mapCanvas.render();
    }

    onMouseMove(e, tileX, tileY) {
        if (!this.isDrawing) return;
        this._eraseAt(tileX, tileY);
        this.app.mapCanvas.render();
    }

    onMouseUp(e, tileX, tileY) {
        if (this.isDrawing) {
            this.isDrawing = false;
            this.app.history.endAction(this.layer);
        }
    }

    _eraseAt(tileX, tileY) {
        if (tileX === this._lastTileX && tileY === this._lastTileY) return;
        this._lastTileX = tileX;
        this._lastTileY = tileY;
        this.eraseTile(tileX, tileY);
    }

    getCursor() { return 'crosshair'; }
}
