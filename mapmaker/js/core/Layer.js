/**
 * Layer.js - A single layer of the tilemap.
 * Stores a 2D grid of Tile references (or null for empty cells).
 */
class Layer {
    /**
     * @param {string} name - Display name of the layer
     * @param {number} width - Width in tiles
     * @param {number} height - Height in tiles
     */
    constructor(name, width, height) {
        this.name = name;
        this.width = width;
        this.height = height;
        this.visible = true;
        this.opacity = 1.0;
        this.data = this._createGrid(width, height);
    }

    _createGrid(w, h) {
        const grid = new Array(h);
        for (let y = 0; y < h; y++) {
            grid[y] = new Array(w).fill(null);
        }
        return grid;
    }

    /**
     * Get tile at position. Returns null if out of bounds or empty.
     */
    getTile(x, y) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) return null;
        return this.data[y][x];
    }

    /**
     * Set tile at position. Accepts null to clear.
     */
    setTile(x, y, tile) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
        this.data[y][x] = tile;
    }

    /**
     * Clear all tiles.
     */
    clear() {
        this.data = this._createGrid(this.width, this.height);
    }

    /**
     * Resize the layer, preserving existing data where possible.
     */
    resize(newWidth, newHeight) {
        const newData = this._createGrid(newWidth, newHeight);
        const copyW = Math.min(this.width, newWidth);
        const copyH = Math.min(this.height, newHeight);
        for (let y = 0; y < copyH; y++) {
            for (let x = 0; x < copyW; x++) {
                newData[y][x] = this.data[y][x];
            }
        }
        this.data = newData;
        this.width = newWidth;
        this.height = newHeight;
    }

    /**
     * Deep clone the layer.
     */
    clone() {
        const layer = new Layer(this.name, this.width, this.height);
        layer.visible = this.visible;
        layer.opacity = this.opacity;
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const t = this.data[y][x];
                layer.data[y][x] = t ? t.clone() : null;
            }
        }
        return layer;
    }

    /**
     * Snapshot the data grid for undo history (returns a flat copy).
     */
    snapshot() {
        const snap = new Array(this.height);
        for (let y = 0; y < this.height; y++) {
            snap[y] = new Array(this.width);
            for (let x = 0; x < this.width; x++) {
                const t = this.data[y][x];
                snap[y][x] = t ? t.clone() : null;
            }
        }
        return snap;
    }

    /**
     * Restore from a snapshot.
     */
    restoreSnapshot(snap) {
        this.data = snap;
        this.width = snap[0] ? snap[0].length : 0;
        this.height = snap.length;
    }

    toJSON() {
        return {
            name: this.name,
            visible: this.visible,
            opacity: this.opacity,
            width: this.width,
            height: this.height,
            data: this.data.map(row => row.map(t => t ? t.toJSON() : null))
        };
    }

    static fromJSON(json) {
        const layer = new Layer(json.name, json.width, json.height);
        layer.visible = json.visible;
        layer.opacity = json.opacity;
        layer.data = json.data.map(row => row.map(t => Tile.fromJSON(t)));
        return layer;
    }
}
