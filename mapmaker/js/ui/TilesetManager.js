/**
 * TilesetManager.js - Manages loaded tileset images.
 * Handles uploading, storing, and providing tileset images.
 * Shows image previews in tabs that auto-update.
 */
class TilesetManager {
    constructor(app) {
        this.app = app;
        /** @type {{name: string, image: HTMLImageElement, cols: number, rows: number}[]} */
        this.tilesets = [];
        this.activeTilesetIndex = -1;

        this._tabsEl = document.getElementById('tileset-tabs');
        this._fileInput = document.getElementById('tileset-file-input');
        this._addBtn = document.getElementById('btn-add-tileset');

        this._addBtn.addEventListener('click', () => this._fileInput.click());
        this._fileInput.addEventListener('change', (e) => this._onFilesSelected(e));
    }

    get activeTileset() {
        return this.tilesets[this.activeTilesetIndex] || null;
    }

    /**
     * Handle file selection - multiple files become animation frames of the same tileset.
     */
    _onFilesSelected(e) {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        const loadPromises = files.map(file => this._loadImage(file));

        Promise.all(loadPromises).then(images => {
            if (images.length === 0) return;

            const tileSize = this.app.tileMap?.tileSize || 32;
            const firstImg = images[0];
            const name = files[0].name.replace(/\.[^.]+$/, '');
            const cols = Math.floor(firstImg.width / tileSize);
            const rows = Math.floor(firstImg.height / tileSize);

            // First image is the base tileset
            const tsIndex = this.tilesets.length;
            this.tilesets.push({ name, image: firstImg, cols, rows });

            // Additional images are animation frames
            if (images.length > 1) {
                for (const img of images) {
                    this.app.animationManager.addFrame(tsIndex, img);
                }
                this.app.updateAnimationUI();
            }

            this.activeTilesetIndex = tsIndex;
            this._renderTabs();
            this.app.palette.setTileset(tsIndex);
            this.app.mapCanvas.render();
        });

        this._fileInput.value = '';
    }

    _loadImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    _renderTabs() {
        this._tabsEl.innerHTML = '';
        this.tilesets.forEach((ts, idx) => {
            const tab = document.createElement('div');
            tab.className = 'tileset-tab' + (idx === this.activeTilesetIndex ? ' active' : '');

            // Image thumbnail
            if (ts.image) {
                const thumb = document.createElement('canvas');
                thumb.className = 'tileset-tab-thumb';
                thumb.width = 24;
                thumb.height = 24;
                const ctx = thumb.getContext('2d');
                ctx.imageSmoothingEnabled = false;
                const aspect = ts.image.width / ts.image.height;
                const drawW = aspect >= 1 ? 24 : 24 * aspect;
                const drawH = aspect >= 1 ? 24 / aspect : 24;
                ctx.drawImage(ts.image, (24 - drawW) / 2, (24 - drawH) / 2, drawW, drawH);
                tab.appendChild(thumb);
            }

            const nameSpan = document.createElement('span');
            nameSpan.className = 'tileset-tab-name';
            nameSpan.textContent = ts.name;
            tab.appendChild(nameSpan);

            tab.addEventListener('click', () => {
                this.activeTilesetIndex = idx;
                this._renderTabs();
                this.app.palette.setTileset(idx);
            });

            const removeBtn = document.createElement('span');
            removeBtn.className = 'remove-tileset';
            removeBtn.textContent = 'x';
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._removeTileset(idx);
            });
            tab.appendChild(removeBtn);

            this._tabsEl.appendChild(tab);
        });
    }

    _removeTileset(index) {
        this.tilesets.splice(index, 1);
        this.app.animationManager.removeFrames(index);
        if (this.activeTilesetIndex >= this.tilesets.length) {
            this.activeTilesetIndex = Math.max(0, this.tilesets.length - 1);
        }
        this._renderTabs();
        if (this.tilesets.length > 0) {
            this.app.palette.setTileset(this.activeTilesetIndex);
        } else {
            this.app.palette.clear();
        }
        this.app.mapCanvas.render();
    }

    /**
     * Recalculate tileset cols/rows after tile size change.
     */
    recalculate(tileSize) {
        for (const ts of this.tilesets) {
            ts.cols = Math.floor(ts.image.width / tileSize);
            ts.rows = Math.floor(ts.image.height / tileSize);
        }
        this._renderTabs();
    }

    /**
     * Get tileset data for serialization (names only, images can't be serialized).
     */
    toJSON() {
        return this.tilesets.map(ts => ({
            name: ts.name,
            cols: ts.cols,
            rows: ts.rows
        }));
    }
}
