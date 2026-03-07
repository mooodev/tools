/**
 * BaseTool.js - Abstract base class for all map editing tools.
 */
class BaseTool {
    constructor(app) {
        this.app = app;
        this.name = 'base';
        this.isDrawing = false;
        this.startX = 0;
        this.startY = 0;
    }

    get map() { return this.app.tileMap; }
    get layer() { return this.app.tileMap?.activeLayer; }
    get tileSize() { return this.app.tileMap?.tileSize || 32; }
    get selection() { return this.app.palette?.selection; }
    get autoTiler() { return this.app.autoTiler; }
    get isAutotileMode() { return this.app.isAutotileMode; }

    /** Convert pixel coords to tile coords */
    pixelToTile(px, py) {
        const zoom = this.app.zoom;
        const ts = this.tileSize;
        return {
            x: Math.floor(px / (ts * zoom)),
            y: Math.floor(py / (ts * zoom))
        };
    }

    onMouseDown(e, tileX, tileY) {}
    onMouseMove(e, tileX, tileY) {}
    onMouseUp(e, tileX, tileY) {}

    /** Get cursor CSS class */
    getCursor() { return 'crosshair'; }

    /**
     * Place a tile (or multi-tile selection) at the given position.
     * Handles multi-tile stamps.
     */
    placeTile(tileX, tileY) {
        const sel = this.selection;
        if (!sel || !this.layer) return;

        for (let dy = 0; dy < sel.height; dy++) {
            for (let dx = 0; dx < sel.width; dx++) {
                const mapX = tileX + dx;
                const mapY = tileY + dy;
                if (mapX >= this.map.width || mapY >= this.map.height) continue;

                const tile = new Tile(
                    sel.tilesetIndex,
                    sel.srcX + dx,
                    sel.srcY + dy,
                    1, 1,
                    this.isAutotileMode
                );
                this.layer.setTile(mapX, mapY, tile);

                if (this.isAutotileMode) {
                    this.autoTiler.updateTileAndNeighbors(this.layer, mapX, mapY);
                }
            }
        }
    }

    /**
     * Erase a tile at the given position.
     */
    eraseTile(tileX, tileY) {
        if (!this.layer) return;
        const existing = this.layer.getTile(tileX, tileY);
        this.layer.setTile(tileX, tileY, null);
        if (existing && existing.isAutotile) {
            this.autoTiler.updateTileAndNeighbors(this.layer, tileX, tileY);
        }
    }
}
