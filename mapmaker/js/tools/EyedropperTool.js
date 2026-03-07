/**
 * EyedropperTool.js - Picks a tile from the map and selects it in the palette.
 */
class EyedropperTool extends BaseTool {
    constructor(app) {
        super(app);
        this.name = 'eyedropper';
    }

    onMouseDown(e, tileX, tileY) {
        if (!this.layer) return;
        const tile = this.layer.getTile(tileX, tileY);
        if (tile) {
            // Set palette selection to this tile
            this.app.palette.setSelection({
                tilesetIndex: tile.tilesetIndex,
                srcX: tile.srcX,
                srcY: tile.srcY,
                width: 1,
                height: 1
            });
            // Switch to previous tool (usually draw)
            this.app.toolbar.selectTool(this.app.toolbar.previousTool || 'draw');
        }
    }

    getCursor() { return 'copy'; }
}
