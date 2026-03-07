/**
 * AutoTiler.js - Implements RPG Maker-style 47-tile blob autotiling.
 *
 * Uses an 8-bit bitmask of neighboring tiles to determine which
 * sub-tile variant to draw. Supports the standard 47-tile "blob" tileset layout.
 *
 * Autotile tileset layout expectation (7 columns x 7 rows = 47 unique tiles + 2 spare):
 * The tileset should contain tiles arranged by their bitmask index.
 * We use a lookup table mapping 8-bit neighbor bitmask -> tile index in the autotile set.
 */
class AutoTiler {
    constructor() {
        // 8-direction neighbor bit flags
        this.N  = 1;
        this.NE = 2;
        this.E  = 4;
        this.SE = 8;
        this.S  = 16;
        this.SW = 32;
        this.W  = 64;
        this.NW = 128;

        // Build the 47-tile blob lookup.
        // Maps a simplified bitmask (after corner cleanup) to a tile index 0-46.
        this._buildLookup();
    }

    _buildLookup() {
        // The 47 unique blob tile configurations.
        // We reduce 256 possible states to 47 by ignoring corners
        // that don't have both adjacent edges filled.
        // This lookup maps reduced bitmask -> index in a standard 47-tile autotile sheet.
        this.bitmaskToIndex = new Map();

        // Generate all 256 combinations, reduce, and assign indices
        const seen = new Map();
        let index = 0;
        for (let mask = 0; mask < 256; mask++) {
            const reduced = this._reduceCorners(mask);
            if (!seen.has(reduced)) {
                seen.set(reduced, index);
                index++;
            }
            this.bitmaskToIndex.set(mask, seen.get(reduced));
        }
        this.totalVariants = seen.size; // Should be 47
    }

    /**
     * Remove corner bits that don't have both adjacent edges.
     * E.g., NE only matters if both N and E are set.
     */
    _reduceCorners(mask) {
        let result = mask;
        if (!(mask & this.N) || !(mask & this.E)) result &= ~this.NE;
        if (!(mask & this.S) || !(mask & this.E)) result &= ~this.SE;
        if (!(mask & this.S) || !(mask & this.W)) result &= ~this.SW;
        if (!(mask & this.N) || !(mask & this.W)) result &= ~this.NW;
        return result;
    }

    /**
     * Compute the neighbor bitmask for a tile at (x, y) on a given layer.
     * A neighbor "matches" if it has the same tilesetIndex and isAutotile.
     *
     * @param {Layer} layer
     * @param {number} x
     * @param {number} y
     * @returns {number} 8-bit bitmask
     */
    computeBitmask(layer, x, y) {
        const center = layer.getTile(x, y);
        if (!center || !center.isAutotile) return 0;

        let mask = 0;
        const check = (dx, dy, bit) => {
            const neighbor = layer.getTile(x + dx, y + dy);
            if (neighbor && neighbor.isAutotile &&
                neighbor.tilesetIndex === center.tilesetIndex &&
                neighbor.srcX === center.srcX && neighbor.srcY === center.srcY) {
                mask |= bit;
            }
        };

        check(0, -1, this.N);
        check(1, -1, this.NE);
        check(1,  0, this.E);
        check(1,  1, this.SE);
        check(0,  1, this.S);
        check(-1, 1, this.SW);
        check(-1, 0, this.W);
        check(-1,-1, this.NW);

        return mask;
    }

    /**
     * Get the autotile variant index (0-46) for the given bitmask.
     */
    getVariantIndex(bitmask) {
        const reduced = this._reduceCorners(bitmask);
        return this.bitmaskToIndex.get(reduced) || 0;
    }

    /**
     * Convert a variant index to row/column in a 7-column autotile sheet.
     * @param {number} variantIndex
     * @returns {{col: number, row: number}}
     */
    getVariantPosition(variantIndex) {
        const cols = 7;
        return {
            col: variantIndex % cols,
            row: Math.floor(variantIndex / cols)
        };
    }

    /**
     * Update autotile IDs for a tile and its neighbors after a change.
     * @param {Layer} layer
     * @param {number} x
     * @param {number} y
     */
    updateTileAndNeighbors(layer, x, y) {
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const nx = x + dx;
                const ny = y + dy;
                const tile = layer.getTile(nx, ny);
                if (tile && tile.isAutotile) {
                    const bitmask = this.computeBitmask(layer, nx, ny);
                    tile.autotileId = this.getVariantIndex(bitmask);
                }
            }
        }
    }

    /**
     * Recalculate all autotile IDs for entire layer.
     */
    updateEntireLayer(layer) {
        for (let y = 0; y < layer.height; y++) {
            for (let x = 0; x < layer.width; x++) {
                const tile = layer.getTile(x, y);
                if (tile && tile.isAutotile) {
                    const bitmask = this.computeBitmask(layer, x, y);
                    tile.autotileId = this.getVariantIndex(bitmask);
                }
            }
        }
    }
}
