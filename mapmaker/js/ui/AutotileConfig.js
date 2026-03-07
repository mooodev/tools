/**
 * AutotileConfig.js - UI for configuring autotile regions on tilesets.
 * Allows users to define which rectangular region of a tileset is an autotile set,
 * and what layout format it uses (blob-47, simple-16, RPG Maker A2, etc).
 */
class AutotileConfig {
    constructor(app) {
        this.app = app;
        /**
         * Autotile definitions keyed by tileset index.
         * Each entry is an array of autotile region definitions:
         * { id, srcX, srcY, width, height, format, name }
         * - srcX/srcY: top-left tile of the autotile region in the tileset
         * - width/height: size of the autotile region in tiles
         * - format: 'blob47' | 'simple16' | 'simple4'
         */
        this.definitions = new Map();
        this._nextId = 1;

        this._setupUI();
    }

    _setupUI() {
        this._listEl = document.getElementById('autotile-defs-list');
        this._addBtn = document.getElementById('btn-add-autotile-def');

        this._addBtn.addEventListener('click', () => {
            this._openDefineModal();
        });
    }

    /**
     * Check if a tile position is part of an autotile region.
     * Returns the definition if found, null otherwise.
     */
    getAutotileDef(tilesetIndex, srcX, srcY) {
        const defs = this.definitions.get(tilesetIndex);
        if (!defs) return null;
        for (const def of defs) {
            if (srcX >= def.srcX && srcX < def.srcX + def.width &&
                srcY >= def.srcY && srcY < def.srcY + def.height) {
                return def;
            }
        }
        return null;
    }

    /**
     * Add an autotile definition.
     */
    addDefinition(tilesetIndex, def) {
        if (!this.definitions.has(tilesetIndex)) {
            this.definitions.set(tilesetIndex, []);
        }
        if (!def.id) def.id = 'atd_' + (this._nextId++);
        this.definitions.get(tilesetIndex).push(def);
        this.renderList();
        return def;
    }

    /**
     * Remove an autotile definition.
     */
    removeDefinition(tilesetIndex, defId) {
        const defs = this.definitions.get(tilesetIndex);
        if (!defs) return;
        const idx = defs.findIndex(d => d.id === defId);
        if (idx >= 0) defs.splice(idx, 1);
        this.renderList();
    }

    _openDefineModal() {
        const tsIdx = this.app.tilesetManager.activeTilesetIndex;
        if (tsIdx < 0) {
            alert('Please select a tileset first.');
            return;
        }

        const modal = document.getElementById('modal-autotile-def');
        modal.classList.remove('hidden');

        // Check if there's a palette selection to pre-fill
        const sel = this.app.palette.selection;
        if (sel && sel.tilesetIndex === tsIdx) {
            document.getElementById('atd-src-x').value = sel.srcX;
            document.getElementById('atd-src-y').value = sel.srcY;
            document.getElementById('atd-width').value = sel.width;
            document.getElementById('atd-height').value = sel.height;
        } else {
            document.getElementById('atd-src-x').value = 0;
            document.getElementById('atd-src-y').value = 0;
            document.getElementById('atd-width').value = 7;
            document.getElementById('atd-height').value = 7;
        }
        document.getElementById('atd-name').value = 'Autotile ' + this._nextId;
        document.getElementById('atd-format').value = 'blob47';

        // Remove old listeners via clone
        const saveBtn = document.getElementById('btn-save-atd');
        const cancelBtn = modal.querySelector('.btn-cancel');
        const newSave = saveBtn.cloneNode(true);
        const newCancel = cancelBtn.cloneNode(true);
        saveBtn.parentNode.replaceChild(newSave, saveBtn);
        cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);

        newCancel.addEventListener('click', () => modal.classList.add('hidden'));
        newSave.addEventListener('click', () => {
            const def = {
                name: document.getElementById('atd-name').value || 'Autotile',
                srcX: parseInt(document.getElementById('atd-src-x').value) || 0,
                srcY: parseInt(document.getElementById('atd-src-y').value) || 0,
                width: parseInt(document.getElementById('atd-width').value) || 7,
                height: parseInt(document.getElementById('atd-height').value) || 7,
                format: document.getElementById('atd-format').value || 'blob47',
            };
            this.addDefinition(tsIdx, def);
            modal.classList.add('hidden');
            this.app.palette.render(); // Refresh to show autotile highlights
        });
    }

    renderList() {
        this._listEl.innerHTML = '';
        const tsIdx = this.app.tilesetManager.activeTilesetIndex;
        const defs = this.definitions.get(tsIdx) || [];

        if (defs.length === 0) {
            const hint = document.createElement('div');
            hint.className = 'hint';
            hint.textContent = 'No autotile regions defined. Select tiles on the palette and click + to define one.';
            this._listEl.appendChild(hint);
            return;
        }

        for (const def of defs) {
            const item = document.createElement('div');
            item.className = 'atd-item';

            const info = document.createElement('span');
            info.className = 'atd-info';
            info.textContent = `${def.name} [${def.srcX},${def.srcY} ${def.width}x${def.height}] ${def.format}`;
            item.appendChild(info);

            const delBtn = document.createElement('button');
            delBtn.className = 'atd-del-btn';
            delBtn.textContent = 'x';
            delBtn.title = 'Remove';
            delBtn.addEventListener('click', () => {
                this.removeDefinition(tsIdx, def.id);
                this.app.palette.render();
            });
            item.appendChild(delBtn);

            this._listEl.appendChild(item);
        }
    }

    toJSON() {
        const result = {};
        for (const [tsIdx, defs] of this.definitions) {
            result[tsIdx] = defs.map(d => ({
                id: d.id,
                name: d.name,
                srcX: d.srcX,
                srcY: d.srcY,
                width: d.width,
                height: d.height,
                format: d.format,
            }));
        }
        return result;
    }

    fromJSON(obj) {
        this.definitions.clear();
        this._nextId = 1;
        if (!obj || typeof obj !== 'object') return;
        for (const [tsIdx, defs] of Object.entries(obj)) {
            const idx = parseInt(tsIdx);
            this.definitions.set(idx, []);
            for (const d of defs) {
                const def = {
                    id: d.id || 'atd_' + (this._nextId++),
                    name: d.name || 'Autotile',
                    srcX: d.srcX || 0,
                    srcY: d.srcY || 0,
                    width: d.width || 7,
                    height: d.height || 7,
                    format: d.format || 'blob47',
                };
                this.definitions.get(idx).push(def);
                const numId = parseInt((def.id || '').replace('atd_', ''));
                if (!isNaN(numId) && numId >= this._nextId) this._nextId = numId + 1;
            }
        }
        this.renderList();
    }

    clear() {
        this.definitions.clear();
        this._nextId = 1;
        this.renderList();
    }
}
