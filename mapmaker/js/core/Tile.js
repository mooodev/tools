/**
 * Tile.js - Represents a single tile or multi-tile selection from a tileset.
 * Stores the source tileset index, source coordinates, and autotile flags.
 */
class Tile {
    /**
     * @param {number} tilesetIndex - Index of the tileset in TilesetManager
     * @param {number} srcX - Source X in the tileset (in tile units)
     * @param {number} srcY - Source Y in the tileset (in tile units)
     * @param {number} [width=1] - Width in tile units (for multi-tile selections)
     * @param {number} [height=1] - Height in tile units
     * @param {boolean} [isAutotile=false] - Whether this tile uses autotiling
     */
    constructor(tilesetIndex, srcX, srcY, width = 1, height = 1, isAutotile = false) {
        this.tilesetIndex = tilesetIndex;
        this.srcX = srcX;
        this.srcY = srcY;
        this.width = width;
        this.height = height;
        this.isAutotile = isAutotile;
        this.autotileId = null; // Computed bitmask for autotile variant
    }

    /**
     * Create a deep clone of this tile.
     */
    clone() {
        const t = new Tile(this.tilesetIndex, this.srcX, this.srcY, this.width, this.height, this.isAutotile);
        t.autotileId = this.autotileId;
        return t;
    }

    /**
     * Check if two tiles reference the same source.
     */
    equals(other) {
        if (!other) return false;
        return this.tilesetIndex === other.tilesetIndex &&
               this.srcX === other.srcX &&
               this.srcY === other.srcY &&
               this.width === other.width &&
               this.height === other.height;
    }

    /**
     * Serialize to plain object for JSON export.
     */
    toJSON() {
        return {
            ts: this.tilesetIndex,
            sx: this.srcX,
            sy: this.srcY,
            w: this.width,
            h: this.height,
            auto: this.isAutotile,
            aid: this.autotileId
        };
    }

    /**
     * Deserialize from plain object.
     */
    static fromJSON(data) {
        if (!data) return null;
        const t = new Tile(data.ts, data.sx, data.sy, data.w || 1, data.h || 1, data.auto || false);
        t.autotileId = data.aid || null;
        return t;
    }
}
