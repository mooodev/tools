/**
 * TileMap.js - The main map data model.
 * Contains layers, dimensions, and tile size configuration.
 */
class TileMap {
    /**
     * @param {number} width - Map width in tiles
     * @param {number} height - Map height in tiles
     * @param {number} tileSize - Pixel size of each tile
     */
    constructor(width, height, tileSize) {
        this.width = width;
        this.height = height;
        this.tileSize = tileSize;
        this.layers = [];
        this.activeLayerIndex = 0;
    }

    /**
     * Get the currently active layer.
     */
    get activeLayer() {
        return this.layers[this.activeLayerIndex] || null;
    }

    /**
     * Add a new layer at the top.
     * @param {string} [name] - Layer name
     * @returns {Layer}
     */
    addLayer(name) {
        const idx = this.layers.length;
        const layerName = name || `Layer ${idx + 1}`;
        const layer = new Layer(layerName, this.width, this.height);
        this.layers.push(layer);
        this.activeLayerIndex = idx;
        return layer;
    }

    /**
     * Remove a layer by index.
     */
    removeLayer(index) {
        if (this.layers.length <= 1) return false;
        this.layers.splice(index, 1);
        if (this.activeLayerIndex >= this.layers.length) {
            this.activeLayerIndex = this.layers.length - 1;
        }
        return true;
    }

    /**
     * Move a layer up or down.
     */
    moveLayer(fromIndex, toIndex) {
        if (toIndex < 0 || toIndex >= this.layers.length) return;
        const [layer] = this.layers.splice(fromIndex, 1);
        this.layers.splice(toIndex, 0, layer);
        if (this.activeLayerIndex === fromIndex) {
            this.activeLayerIndex = toIndex;
        }
    }

    /**
     * Resize all layers.
     */
    resize(newWidth, newHeight, newTileSize) {
        this.width = newWidth;
        this.height = newHeight;
        if (newTileSize) this.tileSize = newTileSize;
        for (const layer of this.layers) {
            layer.resize(newWidth, newHeight);
        }
    }

    /**
     * Get pixel dimensions.
     */
    get pixelWidth() {
        return this.width * this.tileSize;
    }

    get pixelHeight() {
        return this.height * this.tileSize;
    }

    toJSON() {
        return {
            width: this.width,
            height: this.height,
            tileSize: this.tileSize,
            activeLayerIndex: this.activeLayerIndex,
            layers: this.layers.map(l => l.toJSON())
        };
    }

    static fromJSON(json) {
        const map = new TileMap(json.width, json.height, json.tileSize);
        map.activeLayerIndex = json.activeLayerIndex || 0;
        map.layers = json.layers.map(l => Layer.fromJSON(l));
        return map;
    }
}
