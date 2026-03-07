/**
 * MapCanvas.js - Main map rendering canvas.
 * Handles rendering all layers, grid, cursor preview, and zoom/pan.
 */
class MapCanvas {
    constructor(app) {
        this.app = app;
        this.canvas = document.getElementById('map-canvas');
        this.gridCanvas = document.getElementById('grid-overlay');
        this.cursorCanvas = document.getElementById('cursor-overlay');
        this.viewport = document.getElementById('canvas-viewport');
        this.scrollContainer = document.getElementById('canvas-scroll-container');

        this.ctx = this.canvas.getContext('2d');
        this.gridCtx = this.gridCanvas.getContext('2d');
        this.cursorCtx = this.cursorCanvas.getContext('2d');

        this._previewRect = null;
        this._previewLine = null;
        this._cursorTileX = -1;
        this._cursorTileY = -1;

        this._setupEvents();
    }

    _setupEvents() {
        const container = this.scrollContainer;

        container.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            const pos = this._getCanvasPos(e);
            const tile = this._posToTile(pos.x, pos.y);
            this.app.currentTool?.onMouseDown(e, tile.x, tile.y);
        });

        container.addEventListener('mousemove', (e) => {
            const pos = this._getCanvasPos(e);
            const tile = this._posToTile(pos.x, pos.y);
            this._cursorTileX = tile.x;
            this._cursorTileY = tile.y;
            this.app.currentTool?.onMouseMove(e, tile.x, tile.y);
            this._renderCursor();
            this._updateStatusBar(pos.x, pos.y, tile.x, tile.y);
        });

        window.addEventListener('mouseup', (e) => {
            const pos = this._getCanvasPos(e);
            const tile = this._posToTile(pos.x, pos.y);
            this.app.currentTool?.onMouseUp(e, tile.x, tile.y);
        });

        // Middle-click panning
        let isPanning = false, panStartX = 0, panStartY = 0, scrollStartX = 0, scrollStartY = 0;
        container.addEventListener('mousedown', (e) => {
            if (e.button === 1) {
                e.preventDefault();
                isPanning = true;
                panStartX = e.clientX;
                panStartY = e.clientY;
                scrollStartX = container.scrollLeft;
                scrollStartY = container.scrollTop;
                container.style.cursor = 'grabbing';
            }
        });
        window.addEventListener('mousemove', (e) => {
            if (!isPanning) return;
            container.scrollLeft = scrollStartX - (e.clientX - panStartX);
            container.scrollTop = scrollStartY - (e.clientY - panStartY);
        });
        window.addEventListener('mouseup', (e) => {
            if (e.button === 1 && isPanning) {
                isPanning = false;
                container.style.cursor = '';
            }
        });
    }

    _getCanvasPos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    _posToTile(px, py) {
        const zoom = this.app.zoom;
        const ts = this.app.tileMap?.tileSize || 32;
        return {
            x: Math.floor(px / (ts * zoom)),
            y: Math.floor(py / (ts * zoom))
        };
    }

    _updateStatusBar(px, py, tx, ty) {
        const cursorPosEl = document.getElementById('cursor-pos');
        const tilePosEl = document.getElementById('tile-pos');
        cursorPosEl.textContent = `X: ${Math.round(px)}, Y: ${Math.round(py)}`;
        tilePosEl.textContent = `Tile: ${tx}, ${ty}`;
    }

    setPreviewRect(rect) {
        this._previewRect = rect;
        this._renderCursor();
    }

    setPreviewLine(points) {
        this._previewLine = points;
        this._renderCursor();
    }

    /**
     * Full render of all layers.
     */
    render() {
        const map = this.app.tileMap;
        if (!map) return;

        const zoom = this.app.zoom;
        const pw = map.pixelWidth * zoom;
        const ph = map.pixelHeight * zoom;

        // Size canvases
        this.canvas.width = pw;
        this.canvas.height = ph;
        this.gridCanvas.width = pw;
        this.gridCanvas.height = ph;
        this.cursorCanvas.width = pw;
        this.cursorCanvas.height = ph;

        // Set scroll area
        this.scrollContainer.style.width = '100%';
        this.scrollContainer.style.height = '100%';
        const inner = this.canvas;
        inner.style.width = pw + 'px';
        inner.style.height = ph + 'px';

        // Make scrollContainer scrollable
        this.scrollContainer.style.overflow = 'auto';
        this.scrollContainer.style.position = 'relative';

        // Position all canvases
        [this.canvas, this.gridCanvas, this.cursorCanvas].forEach(c => {
            c.style.position = 'absolute';
            c.style.top = '0';
            c.style.left = '0';
            c.style.width = pw + 'px';
            c.style.height = ph + 'px';
        });

        this.ctx.imageSmoothingEnabled = false;
        this.ctx.clearRect(0, 0, pw, ph);

        // Draw checkerboard background
        this._drawCheckerboard(pw, ph);

        // Draw each layer bottom to top
        for (let li = 0; li < map.layers.length; li++) {
            const layer = map.layers[li];
            if (!layer.visible) continue;

            this.ctx.globalAlpha = layer.opacity;
            this._renderLayer(layer, zoom);
        }
        this.ctx.globalAlpha = 1.0;

        // Grid
        if (this.app.showGrid) {
            this._renderGrid(map, zoom);
        } else {
            this.gridCtx.clearRect(0, 0, pw, ph);
        }

        // Mob markers
        if (this.app.mobManager && this.app.mobManager.mobs.length > 0) {
            this.app.mobManager.renderOnCanvas(this.ctx, zoom, map.tileSize);
        }

        // Cursor
        this._renderCursor();

        // Minimap
        this.app.minimap?.render();
    }

    _drawCheckerboard(w, h) {
        const size = 8;
        this.ctx.fillStyle = '#1a1a2e';
        this.ctx.fillRect(0, 0, w, h);
        this.ctx.fillStyle = '#22223a';
        for (let y = 0; y < h; y += size) {
            for (let x = 0; x < w; x += size) {
                if ((Math.floor(x / size) + Math.floor(y / size)) % 2 === 0) {
                    this.ctx.fillRect(x, y, size, size);
                }
            }
        }
    }

    _renderLayer(layer, zoom) {
        const tileSize = this.app.tileMap.tileSize;
        const ts = tileSize * zoom;
        const tilesetMgr = this.app.tilesetManager;
        const animMgr = this.app.animationManager;

        for (let y = 0; y < layer.height; y++) {
            for (let x = 0; x < layer.width; x++) {
                const tile = layer.data[y][x];
                if (!tile) continue;

                const tilesetData = tilesetMgr.tilesets[tile.tilesetIndex];
                if (!tilesetData) continue;

                const img = animMgr.getCurrentFrameImage(tile.tilesetIndex, tilesetData.image);

                let srcX = tile.srcX;
                let srcY = tile.srcY;

                // If autotile, offset by variant
                if (tile.isAutotile && tile.autotileId !== null) {
                    const variant = this.app.autoTiler.getVariantPosition(tile.autotileId);
                    srcX = tile.srcX * 7 + variant.col; // Autotile sheet is 7 cols wide per base tile
                    srcY = tile.srcY * 7 + variant.row;
                }

                this.ctx.drawImage(
                    img,
                    srcX * tileSize, srcY * tileSize, tileSize, tileSize,
                    x * ts, y * ts, ts, ts
                );
            }
        }
    }

    _renderGrid(map, zoom) {
        const ts = map.tileSize * zoom;
        const w = map.pixelWidth * zoom;
        const h = map.pixelHeight * zoom;

        this.gridCtx.clearRect(0, 0, w, h);
        this.gridCtx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        this.gridCtx.lineWidth = 0.5;

        for (let x = 0; x <= map.width; x++) {
            this.gridCtx.beginPath();
            this.gridCtx.moveTo(x * ts, 0);
            this.gridCtx.lineTo(x * ts, h);
            this.gridCtx.stroke();
        }
        for (let y = 0; y <= map.height; y++) {
            this.gridCtx.beginPath();
            this.gridCtx.moveTo(0, y * ts);
            this.gridCtx.lineTo(w, y * ts);
            this.gridCtx.stroke();
        }
    }

    _renderCursor() {
        const map = this.app.tileMap;
        if (!map) return;

        const zoom = this.app.zoom;
        const ts = map.tileSize * zoom;
        const w = this.cursorCanvas.width;
        const h = this.cursorCanvas.height;

        this.cursorCtx.clearRect(0, 0, w, h);

        // Preview rect
        if (this._previewRect) {
            const r = this._previewRect;
            this.cursorCtx.fillStyle = 'rgba(79, 195, 247, 0.2)';
            this.cursorCtx.fillRect(r.x1 * ts, r.y1 * ts, (r.x2 - r.x1 + 1) * ts, (r.y2 - r.y1 + 1) * ts);
            this.cursorCtx.strokeStyle = '#4fc3f7';
            this.cursorCtx.lineWidth = 2;
            this.cursorCtx.strokeRect(r.x1 * ts, r.y1 * ts, (r.x2 - r.x1 + 1) * ts, (r.y2 - r.y1 + 1) * ts);
            return;
        }

        // Preview line
        if (this._previewLine) {
            this.cursorCtx.fillStyle = 'rgba(79, 195, 247, 0.3)';
            for (const [x, y] of this._previewLine) {
                this.cursorCtx.fillRect(x * ts, y * ts, ts, ts);
            }
            return;
        }

        // Normal cursor highlight
        const tx = this._cursorTileX;
        const ty = this._cursorTileY;
        if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return;

        const sel = this.app.palette?.selection;
        const selW = sel ? sel.width : 1;
        const selH = sel ? sel.height : 1;

        this.cursorCtx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        this.cursorCtx.lineWidth = 1;
        this.cursorCtx.strokeRect(tx * ts + 0.5, ty * ts + 0.5, selW * ts - 1, selH * ts - 1);

        // Ghost preview of selection
        if (sel && this.app.tilesetManager.tilesets[sel.tilesetIndex]) {
            const tilesetData = this.app.tilesetManager.tilesets[sel.tilesetIndex];
            const tileSize = map.tileSize;
            this.cursorCtx.globalAlpha = 0.5;
            this.cursorCtx.imageSmoothingEnabled = false;
            for (let dy = 0; dy < selH; dy++) {
                for (let dx = 0; dx < selW; dx++) {
                    const mapX = tx + dx;
                    const mapY = ty + dy;
                    if (mapX >= map.width || mapY >= map.height) continue;
                    this.cursorCtx.drawImage(
                        tilesetData.image,
                        (sel.srcX + dx) * tileSize, (sel.srcY + dy) * tileSize, tileSize, tileSize,
                        mapX * ts, mapY * ts, ts, ts
                    );
                }
            }
            this.cursorCtx.globalAlpha = 1.0;
        }
    }
}
