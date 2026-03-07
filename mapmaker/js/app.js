/**
 * app.js - Main application entry point.
 * Wires together all modules and handles global app state.
 */
class MapMakerApp {
    constructor() {
        this.tileMap = null;
        this.zoom = 1;
        this.showGrid = true;
        this.isAutotileMode = false;

        // Initialize core systems
        this.autoTiler = new AutoTiler();
        this.animationManager = new AnimationManager();
        this.history = new UndoHistory();

        // Initialize UI
        this.tilesetManager = new TilesetManager(this);
        this.palette = new Palette(this);
        this.mapCanvas = new MapCanvas(this);
        this.layerPanel = new LayerPanel(this);
        this.toolbar = new Toolbar(this);
        this.minimap = new Minimap(this);

        // Bind UI controls
        this._bindControls();

        // Create default map
        this.createMap(20, 15, 32);

        // Setup animation
        this.animationManager.onFrameChange(() => {
            this.mapCanvas.render();
        });
    }

    get currentTool() {
        return this.toolbar.activeTool;
    }

    /**
     * Create a new map with the given dimensions.
     */
    createMap(width, height, tileSize) {
        this.tileMap = new TileMap(width, height, tileSize);
        this.tileMap.addLayer('Ground');
        this.tileMap.addLayer('Objects');
        this.tileMap.addLayer('Overlay');
        this.tileMap.activeLayerIndex = 0;

        this.history.clear();
        this.tilesetManager.recalculate(tileSize);

        this._updateMapInfo();
        this.layerPanel.render();
        this.mapCanvas.render();
        this.palette.render();
    }

    _updateMapInfo() {
        const info = document.getElementById('map-info');
        if (this.tileMap) {
            info.textContent = `${this.tileMap.width}x${this.tileMap.height} | Tile: ${this.tileMap.tileSize}px`;
        } else {
            info.textContent = 'No Map';
        }

        // Sync property inputs
        document.getElementById('map-width').value = this.tileMap?.width || 20;
        document.getElementById('map-height').value = this.tileMap?.height || 15;
        document.getElementById('tile-size').value = this.tileMap?.tileSize || 32;
    }

    _bindControls() {
        // New map modal
        const newMapModal = document.getElementById('modal-new-map');
        document.getElementById('btn-new-map').addEventListener('click', () => {
            newMapModal.classList.remove('hidden');
        });
        newMapModal.querySelector('.btn-cancel').addEventListener('click', () => {
            newMapModal.classList.add('hidden');
        });
        document.getElementById('btn-create-map').addEventListener('click', () => {
            const w = parseInt(document.getElementById('new-map-width').value) || 20;
            const h = parseInt(document.getElementById('new-map-height').value) || 15;
            const ts = parseInt(document.getElementById('new-tile-size').value) || 32;
            this.createMap(w, h, ts);
            newMapModal.classList.add('hidden');
        });

        // Resize map
        document.getElementById('btn-resize-map').addEventListener('click', () => {
            if (!this.tileMap) return;
            const w = parseInt(document.getElementById('map-width').value) || this.tileMap.width;
            const h = parseInt(document.getElementById('map-height').value) || this.tileMap.height;
            const ts = parseInt(document.getElementById('tile-size').value) || this.tileMap.tileSize;
            this.tileMap.resize(w, h, ts);
            this.tilesetManager.recalculate(ts);
            this._updateMapInfo();
            this.mapCanvas.render();
            this.palette.render();
        });

        // Zoom
        const zoomSlider = document.getElementById('zoom-slider');
        const zoomLabel = document.getElementById('zoom-label');
        zoomSlider.addEventListener('input', () => {
            this.zoom = parseFloat(zoomSlider.value);
            zoomLabel.textContent = Math.round(this.zoom * 100) + '%';
            this.mapCanvas.render();
        });

        // Grid toggle
        document.getElementById('show-grid').addEventListener('change', (e) => {
            this.showGrid = e.target.checked;
            this.mapCanvas.render();
        });

        // Autotile toggle
        document.getElementById('autotile-toggle').addEventListener('change', (e) => {
            this.isAutotileMode = e.target.checked;
        });

        // Undo/Redo buttons
        document.getElementById('btn-undo').addEventListener('click', () => {
            this.history.undo(this.tileMap);
            this.mapCanvas.render();
        });
        document.getElementById('btn-redo').addEventListener('click', () => {
            this.history.redo(this.tileMap);
            this.mapCanvas.render();
        });

        // Export buttons
        document.getElementById('btn-export-png').addEventListener('click', () => {
            if (!this.tileMap) return;
            ExportUtils.exportPNG(this.tileMap, this.tilesetManager, this.animationManager, this.autoTiler);
        });
        document.getElementById('btn-export-json').addEventListener('click', () => {
            if (!this.tileMap) return;
            ExportUtils.exportJSON(this.tileMap, this.tilesetManager);
        });

        // Import JSON
        const importInput = document.getElementById('import-json-input');
        document.getElementById('btn-import-json').addEventListener('click', () => {
            importInput.click();
        });
        importInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                const data = await ExportUtils.importJSON(file);
                if (data.map) {
                    this.tileMap = TileMap.fromJSON(data.map);
                    this.history.clear();
                    this._updateMapInfo();
                    this.layerPanel.render();
                    this.mapCanvas.render();
                }
            } catch (err) {
                console.error('Failed to import JSON:', err);
            }
            importInput.value = '';
        });

        // Save/Load project
        document.getElementById('btn-save').addEventListener('click', () => this.saveProject());

        const loadInput = document.getElementById('load-project-input');
        document.getElementById('btn-load').addEventListener('click', () => {
            loadInput.click();
        });
        loadInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            await this.loadProject(file);
            loadInput.value = '';
        });

        // Animation controls
        document.getElementById('btn-toggle-anim').addEventListener('click', () => {
            const playing = this.animationManager.toggle();
            document.getElementById('btn-toggle-anim').textContent = playing ? 'Stop' : 'Play';
        });
        document.getElementById('anim-speed').addEventListener('change', (e) => {
            this.animationManager.setSpeed(parseInt(e.target.value) || 500);
        });

        // Panel resize
        this._setupPanelResize();

        // Scroll-wheel zoom
        document.getElementById('canvas-scroll-container').addEventListener('wheel', (e) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -0.25 : 0.25;
                this.zoom = Math.max(0.25, Math.min(4, this.zoom + delta));
                zoomSlider.value = this.zoom;
                zoomLabel.textContent = Math.round(this.zoom * 100) + '%';
                this.mapCanvas.render();
            }
        }, { passive: false });
    }

    _setupPanelResize() {
        const handle = document.getElementById('panel-resize-handle');
        const leftPanel = document.getElementById('left-panel');
        let startX = 0, startWidth = 0;

        handle.addEventListener('mousedown', (e) => {
            startX = e.clientX;
            startWidth = leftPanel.offsetWidth;
            handle.classList.add('active');

            const onMove = (e) => {
                const diff = e.clientX - startX;
                const newWidth = Math.max(200, Math.min(500, startWidth + diff));
                leftPanel.style.width = newWidth + 'px';
            };

            const onUp = () => {
                handle.classList.remove('active');
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
            };

            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
        });
    }

    /**
     * Save the full project including tileset images.
     */
    saveProject() {
        if (!this.tileMap) return;
        ExportUtils.saveProject(this.tileMap, this.tilesetManager, this.animationManager);
    }

    /**
     * Load a full project from file.
     */
    async loadProject(file) {
        try {
            const data = await ExportUtils.loadProject(file);
            if (!data.map || !data.tilesets) {
                console.error('Invalid project file');
                return;
            }

            // Load tileset images
            this.tilesetManager.tilesets = [];
            this.animationManager.frames.clear();

            for (let i = 0; i < data.tilesets.length; i++) {
                const tsData = data.tilesets[i];
                const img = await ExportUtils.loadImageFromDataURL(tsData.image);
                const tileSize = data.map.tileSize || 32;
                this.tilesetManager.tilesets.push({
                    name: tsData.name,
                    image: img,
                    cols: Math.floor(img.width / tileSize),
                    rows: Math.floor(img.height / tileSize)
                });

                // Load animation frames
                if (tsData.frames && tsData.frames.length > 0) {
                    for (const frameDataURL of tsData.frames) {
                        const frameImg = await ExportUtils.loadImageFromDataURL(frameDataURL);
                        this.animationManager.addFrame(i, frameImg);
                    }
                }
            }

            if (this.tilesetManager.tilesets.length > 0) {
                this.tilesetManager.activeTilesetIndex = 0;
            }
            this.tilesetManager._renderTabs();

            // Load map
            this.tileMap = TileMap.fromJSON(data.map);
            if (data.animSpeed) {
                this.animationManager.setSpeed(data.animSpeed);
                document.getElementById('anim-speed').value = data.animSpeed;
            }

            this.history.clear();
            this._updateMapInfo();
            this.layerPanel.render();
            this.palette.setTileset(0);
            this.mapCanvas.render();
            this.updateAnimationUI();
        } catch (err) {
            console.error('Failed to load project:', err);
        }
    }

    /**
     * Update animation UI (frame thumbnails).
     */
    updateAnimationUI() {
        const list = document.getElementById('animation-frames-list');
        list.innerHTML = '';

        const tsIdx = this.tilesetManager.activeTilesetIndex;
        if (tsIdx < 0) return;

        const frameCount = this.animationManager.getFrameCount(tsIdx);
        if (frameCount === 0) return;

        const frames = this.animationManager.frames.get(tsIdx) || [];
        frames.forEach((img, idx) => {
            const thumb = document.createElement('img');
            thumb.className = 'anim-frame-thumb' + (idx === 0 ? ' active' : '');
            thumb.src = ExportUtils._imageToDataURL(img);
            thumb.title = `Frame ${idx + 1}`;
            list.appendChild(thumb);
        });
    }
}

// Launch
window.addEventListener('DOMContentLoaded', () => {
    window.app = new MapMakerApp();
});
