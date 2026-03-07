/**
 * LineTool.js - Line drawing tool.
 * Click and drag to draw a line of tiles using Bresenham's algorithm.
 */
class LineTool extends BaseTool {
    constructor(app) {
        super(app);
        this.name = 'line';
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
        this.app.mapCanvas.setPreviewLine(this._getLinePoints());
    }

    onMouseMove(e, tileX, tileY) {
        if (!this.isDrawing) return;
        this.endTileX = tileX;
        this.endTileY = tileY;
        this.app.mapCanvas.setPreviewLine(this._getLinePoints());
    }

    onMouseUp(e, tileX, tileY) {
        if (!this.isDrawing) return;
        this.isDrawing = false;
        this.endTileX = tileX;
        this.endTileY = tileY;
        this.app.mapCanvas.setPreviewLine(null);

        const points = this._getLinePoints();
        this.app.history.beginAction(this.app.tileMap.activeLayerIndex, this.layer);

        const sel = this.selection;
        for (const [x, y] of points) {
            if (x < 0 || x >= this.map.width || y < 0 || y >= this.map.height) continue;
            const tile = new Tile(
                sel.tilesetIndex,
                sel.srcX,
                sel.srcY,
                1, 1,
                this.isAutotileMode
            );
            this.layer.setTile(x, y, tile);
        }

        if (this.isAutotileMode) {
            this.autoTiler.updateEntireLayer(this.layer);
        }

        this.app.history.endAction(this.layer);
        this.app.mapCanvas.render();
    }

    /**
     * Bresenham's line algorithm.
     */
    _getLinePoints() {
        const points = [];
        let x0 = this.startTileX, y0 = this.startTileY;
        let x1 = this.endTileX, y1 = this.endTileY;

        const dx = Math.abs(x1 - x0);
        const dy = Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1;
        const sy = y0 < y1 ? 1 : -1;
        let err = dx - dy;

        while (true) {
            points.push([x0, y0]);
            if (x0 === x1 && y0 === y1) break;
            const e2 = 2 * err;
            if (e2 > -dy) { err -= dy; x0 += sx; }
            if (e2 < dx) { err += dx; y0 += sy; }
        }

        return points;
    }

    getCursor() { return 'crosshair'; }
}
