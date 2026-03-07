/**
 * Toolbar.js - Tool selection and keyboard shortcuts.
 */
class Toolbar {
    constructor(app) {
        this.app = app;
        this.currentTool = 'draw';
        this.previousTool = 'draw';

        this._tools = {
            draw: new DrawTool(app),
            erase: new EraseTool(app),
            fill: new FillTool(app),
            rect: new RectTool(app),
            line: new LineTool(app),
            eyedropper: new EyedropperTool(app)
        };

        this._setupButtons();
        this._setupKeyboard();
    }

    get activeTool() {
        return this._tools[this.currentTool];
    }

    selectTool(name) {
        if (!this._tools[name]) return;
        this.previousTool = this.currentTool;
        this.currentTool = name;

        // Update button states
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === name);
        });

        // Update cursor
        const viewport = document.getElementById('canvas-scroll-container');
        viewport.style.cursor = this.activeTool.getCursor();
    }

    _setupButtons() {
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.selectTool(btn.dataset.tool);
            });
        });
    }

    _setupKeyboard() {
        window.addEventListener('keydown', (e) => {
            // Don't trigger shortcuts when typing in inputs
            if (e.target.tagName === 'INPUT' || e.target.contentEditable === 'true') return;

            const shortcuts = {
                'b': 'draw',
                'e': 'erase',
                'g': 'fill',
                'r': 'rect',
                'l': 'line',
                'i': 'eyedropper'
            };

            if (shortcuts[e.key]) {
                e.preventDefault();
                this.selectTool(shortcuts[e.key]);
            }

            // Ctrl+Z / Ctrl+Y
            if (e.ctrlKey || e.metaKey) {
                if (e.key === 'z' && !e.shiftKey) {
                    e.preventDefault();
                    this.app.history.undo(this.app.tileMap);
                    this.app.mapCanvas.render();
                    this.app.layerPanel.render();
                } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
                    e.preventDefault();
                    this.app.history.redo(this.app.tileMap);
                    this.app.mapCanvas.render();
                    this.app.layerPanel.render();
                } else if (e.key === 's') {
                    e.preventDefault();
                    this.app.saveProject();
                }
            }
        });
    }
}
