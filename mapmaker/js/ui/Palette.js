/**
 * Palette.js - Tileset palette UI.
 * Handles displaying the tileset and selecting single/multi-tile regions.
 */
class Palette {
    constructor(app) {
        this.app = app;
        this.canvas = document.getElementById('palette-canvas');
        this.overlay = document.getElementById('palette-selection-overlay');
        this.ctx = this.canvas.getContext('2d');
        this.overlayCtx = this.overlay.getContext('2d');
        this.infoEl = document.getElementById('selected-tile-info');

        this.currentTilesetIndex = -1;
        this.selection = null; // { tilesetIndex, srcX, srcY, width, height }

        this._isSelecting = false;
        this._selectStartX = 0;
        this._selectStartY = 0;

        this.canvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
        window.addEventListener('mouseup', (e) => this._onMouseUp(e));
    }

    get tileSize() {
        return this.app.tileMap?.tileSize || 32;
    }

    get tileset() {
        return this.app.tilesetManager.tilesets[this.currentTilesetIndex] || null;
    }

    setTileset(index) {
        this.currentTilesetIndex = index;
        this.selection = null;
        this.render();
    }

    setSelection(sel) {
        this.selection = sel;
        this.currentTilesetIndex = sel.tilesetIndex;
        this._updateInfo();
        this._renderOverlay();
    }

    clear() {
        this.currentTilesetIndex = -1;
        this.selection = null;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.overlayCtx.clearRect(0, 0, this.overlay.width, this.overlay.height);
        this.infoEl.textContent = 'No tile selected';
    }

    render() {
        const ts = this.tileset;
        if (!ts) {
            this.canvas.width = 0;
            this.canvas.height = 0;
            return;
        }

        const img = ts.image;
        this.canvas.width = img.width;
        this.canvas.height = img.height;
        this.overlay.width = img.width;
        this.overlay.height = img.height;

        this.ctx.imageSmoothingEnabled = false;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(img, 0, 0);

        // Draw grid lines
        this.ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        this.ctx.lineWidth = 0.5;
        const tileSize = this.tileSize;
        for (let x = 0; x <= img.width; x += tileSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, img.height);
            this.ctx.stroke();
        }
        for (let y = 0; y <= img.height; y += tileSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(img.width, y);
            this.ctx.stroke();
        }

        this._renderOverlay();
    }

    _renderOverlay() {
        this.overlayCtx.clearRect(0, 0, this.overlay.width, this.overlay.height);
        if (!this.selection) return;

        const ts = this.tileSize;
        const sel = this.selection;
        const x = sel.srcX * ts;
        const y = sel.srcY * ts;
        const w = sel.width * ts;
        const h = sel.height * ts;

        this.overlayCtx.fillStyle = 'rgba(79, 195, 247, 0.25)';
        this.overlayCtx.fillRect(x, y, w, h);
        this.overlayCtx.strokeStyle = '#4fc3f7';
        this.overlayCtx.lineWidth = 2;
        this.overlayCtx.strokeRect(x, y, w, h);
    }

    _onMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const px = (e.clientX - rect.left) * scaleX;
        const py = (e.clientY - rect.top) * scaleY;
        const ts = this.tileSize;

        this._isSelecting = true;
        this._selectStartX = Math.floor(px / ts);
        this._selectStartY = Math.floor(py / ts);

        // Immediately set single tile selection
        this.selection = {
            tilesetIndex: this.currentTilesetIndex,
            srcX: this._selectStartX,
            srcY: this._selectStartY,
            width: 1,
            height: 1
        };
        this._updateInfo();
        this._renderOverlay();
    }

    _onMouseMove(e) {
        if (!this._isSelecting) return;

        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const px = (e.clientX - rect.left) * scaleX;
        const py = (e.clientY - rect.top) * scaleY;
        const ts = this.tileSize;
        const tileset = this.tileset;
        if (!tileset) return;

        let endX = Math.floor(px / ts);
        let endY = Math.floor(py / ts);
        endX = Math.max(0, Math.min(endX, tileset.cols - 1));
        endY = Math.max(0, Math.min(endY, tileset.rows - 1));

        const x1 = Math.min(this._selectStartX, endX);
        const y1 = Math.min(this._selectStartY, endY);
        const x2 = Math.max(this._selectStartX, endX);
        const y2 = Math.max(this._selectStartY, endY);

        this.selection = {
            tilesetIndex: this.currentTilesetIndex,
            srcX: x1,
            srcY: y1,
            width: x2 - x1 + 1,
            height: y2 - y1 + 1
        };
        this._updateInfo();
        this._renderOverlay();
    }

    _onMouseUp(e) {
        this._isSelecting = false;
    }

    _updateInfo() {
        if (!this.selection) {
            this.infoEl.textContent = 'No tile selected';
            return;
        }
        const s = this.selection;
        if (s.width === 1 && s.height === 1) {
            this.infoEl.textContent = `Tile (${s.srcX}, ${s.srcY})`;
        } else {
            this.infoEl.textContent = `Selection ${s.width}x${s.height} from (${s.srcX}, ${s.srcY})`;
        }
    }
}
