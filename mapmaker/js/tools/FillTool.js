/**
 * FillTool.js - Flood fill tool.
 * Fills contiguous area of same tile type (or empty) with selected tile.
 */
class FillTool extends BaseTool {
    constructor(app) {
        super(app);
        this.name = 'fill';
    }

    onMouseDown(e, tileX, tileY) {
        if (!this.selection || !this.layer) return;
        if (tileX < 0 || tileX >= this.map.width || tileY < 0 || tileY >= this.map.height) return;

        this.app.history.beginAction(this.app.tileMap.activeLayerIndex, this.layer);

        const targetTile = this.layer.getTile(tileX, tileY);
        this._floodFill(tileX, tileY, targetTile);

        if (this.isAutotileMode) {
            this.autoTiler.updateEntireLayer(this.layer);
        }

        this.app.history.endAction(this.layer);
        this.app.mapCanvas.render();
    }

    _floodFill(startX, startY, targetTile) {
        const sel = this.selection;
        // Don't fill if target equals what we're painting (for single tiles)
        if (sel.width === 1 && sel.height === 1 && targetTile &&
            targetTile.tilesetIndex === sel.tilesetIndex &&
            targetTile.srcX === sel.srcX && targetTile.srcY === sel.srcY) {
            return;
        }

        const visited = new Set();
        const stack = [[startX, startY]];
        const w = this.map.width;
        const h = this.map.height;

        const key = (x, y) => `${x},${y}`;

        const matches = (x, y) => {
            const t = this.layer.getTile(x, y);
            if (!targetTile && !t) return true;
            if (!targetTile || !t) return false;
            return t.tilesetIndex === targetTile.tilesetIndex &&
                   t.srcX === targetTile.srcX &&
                   t.srcY === targetTile.srcY;
        };

        while (stack.length > 0) {
            const [x, y] = stack.pop();
            const k = key(x, y);
            if (visited.has(k)) continue;
            if (x < 0 || x >= w || y < 0 || y >= h) continue;
            if (!matches(x, y)) continue;

            visited.add(k);

            // Place tile using pattern from selection
            const patX = ((x - startX) % sel.width + sel.width) % sel.width;
            const patY = ((y - startY) % sel.height + sel.height) % sel.height;
            const tile = new Tile(
                sel.tilesetIndex,
                sel.srcX + patX,
                sel.srcY + patY,
                1, 1,
                this.isAutotileMode
            );
            this.layer.setTile(x, y, tile);

            stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
        }
    }

    getCursor() { return 'crosshair'; }
}
