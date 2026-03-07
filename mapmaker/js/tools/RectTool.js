/**
 * RectTool.js - Rectangle draw tool.
 * Click and drag to define a rectangle, fills with selected tile pattern on release.
 */
class RectTool extends BaseTool {
    constructor(app) {
        super(app);
        this.name = 'rect';
        this.startTileX = 0;
        this.startTileY = 0;
        this.endTileX = 0;
        this.endTileY = 0;
    }

    onMouseDown(e, tileX, tileY) {
        if (!this.selection || !this.layer) return;
        this.isDrawing = true;
        this.startTileX = tileX;
        this.startTileY = tileY;
        this.endTileX = tileX;
        this.endTileY = tileY;
        this.app.mapCanvas.setPreviewRect(this._getRect());
    }

    onMouseMove(e, tileX, tileY) {
        if (!this.isDrawing) return;
        this.endTileX = tileX;
        this.endTileY = tileY;
        this.app.mapCanvas.setPreviewRect(this._getRect());
    }

    onMouseUp(e, tileX, tileY) {
        if (!this.isDrawing) return;
        this.isDrawing = false;
        this.endTileX = tileX;
        this.endTileY = tileY;
        this.app.mapCanvas.setPreviewRect(null);

        const rect = this._getRect();
        this.app.history.beginAction(this.app.tileMap.activeLayerIndex, this.layer);

        const sel = this.selection;
        for (let y = rect.y1; y <= rect.y2; y++) {
            for (let x = rect.x1; x <= rect.x2; x++) {
                if (x < 0 || x >= this.map.width || y < 0 || y >= this.map.height) continue;
                const patX = ((x - rect.x1) % sel.width + sel.width) % sel.width;
                const patY = ((y - rect.y1) % sel.height + sel.height) % sel.height;
                const tile = new Tile(
                    sel.tilesetIndex,
                    sel.srcX + patX,
                    sel.srcY + patY,
                    1, 1,
                    this.isAutotileMode
                );
                this.layer.setTile(x, y, tile);
            }
        }

        if (this.isAutotileMode) {
            this.autoTiler.updateEntireLayer(this.layer);
        }

        this.app.history.endAction(this.layer);
        this.app.mapCanvas.render();
    }

    _getRect() {
        return {
            x1: Math.min(this.startTileX, this.endTileX),
            y1: Math.min(this.startTileY, this.endTileY),
            x2: Math.max(this.startTileX, this.endTileX),
            y2: Math.max(this.startTileY, this.endTileY)
        };
    }

    getCursor() { return 'crosshair'; }
}
