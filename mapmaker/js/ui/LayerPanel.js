/**
 * LayerPanel.js - Layer management UI.
 * Handles layer list, visibility toggles, selection, add/remove, and reordering.
 */
class LayerPanel {
    constructor(app) {
        this.app = app;
        this._listEl = document.getElementById('layer-list');
        this._addBtn = document.getElementById('btn-add-layer');

        this._addBtn.addEventListener('click', () => this._addLayer());
        this._setupDragReorder();
    }

    _addLayer() {
        const map = this.app.tileMap;
        if (!map) return;
        map.addLayer();
        this.render();
        this.app.mapCanvas.render();
    }

    render() {
        const map = this.app.tileMap;
        if (!map) return;

        this._listEl.innerHTML = '';

        // Render layers in reverse order (top layer first in UI)
        for (let i = map.layers.length - 1; i >= 0; i--) {
            const layer = map.layers[i];
            const li = document.createElement('li');
            li.className = i === map.activeLayerIndex ? 'active' : '';
            li.dataset.index = i;
            li.draggable = true;

            // Visibility toggle
            const visBtn = document.createElement('button');
            visBtn.className = 'layer-visibility' + (layer.visible ? '' : ' hidden-layer');
            visBtn.textContent = layer.visible ? '👁' : '—';
            visBtn.title = 'Toggle visibility';
            visBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                layer.visible = !layer.visible;
                this.render();
                this.app.mapCanvas.render();
            });

            // Name
            const nameSpan = document.createElement('span');
            nameSpan.className = 'layer-name';
            nameSpan.textContent = layer.name;
            nameSpan.addEventListener('dblclick', () => {
                nameSpan.contentEditable = 'true';
                nameSpan.focus();
                const range = document.createRange();
                range.selectNodeContents(nameSpan);
                window.getSelection().removeAllRanges();
                window.getSelection().addRange(range);
            });
            nameSpan.addEventListener('blur', () => {
                nameSpan.contentEditable = 'false';
                layer.name = nameSpan.textContent.trim() || layer.name;
            });
            nameSpan.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    nameSpan.blur();
                }
            });

            // Delete button
            const delBtn = document.createElement('button');
            delBtn.className = 'layer-delete';
            delBtn.textContent = '×';
            delBtn.title = 'Delete layer';
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (map.layers.length <= 1) return;
                map.removeLayer(i);
                this.render();
                this.app.mapCanvas.render();
            });

            li.appendChild(visBtn);
            li.appendChild(nameSpan);
            li.appendChild(delBtn);

            li.addEventListener('click', () => {
                map.activeLayerIndex = i;
                this.render();
            });

            this._listEl.appendChild(li);
        }
    }

    _setupDragReorder() {
        let dragIndex = -1;

        this._listEl.addEventListener('dragstart', (e) => {
            const li = e.target.closest('li');
            if (!li) return;
            dragIndex = parseInt(li.dataset.index);
            e.dataTransfer.effectAllowed = 'move';
            li.style.opacity = '0.5';
        });

        this._listEl.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        });

        this._listEl.addEventListener('drop', (e) => {
            e.preventDefault();
            const li = e.target.closest('li');
            if (!li || dragIndex === -1) return;
            const dropIndex = parseInt(li.dataset.index);
            if (dragIndex !== dropIndex) {
                this.app.tileMap.moveLayer(dragIndex, dropIndex);
                this.render();
                this.app.mapCanvas.render();
            }
        });

        this._listEl.addEventListener('dragend', (e) => {
            dragIndex = -1;
            const items = this._listEl.querySelectorAll('li');
            items.forEach(li => li.style.opacity = '');
        });
    }
}
