/**
 * MobManager.js - Manages mob/NPC entities on the map.
 * Handles creation, editing, rendering, and serialization of mobs.
 * Supports character spritesheet for rendering mob sprites on the canvas.
 */
class MobManager {
    constructor(app) {
        this.app = app;
        /** @type {{id:string, name:string, x:number, y:number, charIndex:number, direction:number, dialogue:string[], hp:number, maxHp:number, stats:Object, collision:boolean}[]} */
        this.mobs = [];
        this.selectedMob = null;
        this._nextId = 1;

        /** @type {HTMLImageElement|null} Character spritesheet image */
        this.spritesheet = null;
        /** Spritesheet layout constants */
        this.CHAR_COLS = 4;      // characters per row
        this.FRAMES_PER_ANIM = 3; // frames per direction
        this.DIRECTIONS = 4;      // down, left, right, up
        this.CHAR_GROUPS = 2;     // row groups (top: 0-3, bottom: 4-7)

        this._setupUI();
    }

    _setupUI() {
        // Mob list panel
        this._listEl = document.getElementById('mob-list');

        // Delete selected mob button
        document.getElementById('btn-delete-mob').addEventListener('click', () => {
            if (this.selectedMob) {
                this.removeMob(this.selectedMob.id);
                this.selectedMob = null;
                this.renderList();
                this.app.mapCanvas.render();
            }
        });

        // Character spritesheet upload
        const charFileInput = document.getElementById('charsheet-file-input');
        document.getElementById('btn-upload-charsheet').addEventListener('click', () => {
            charFileInput.click();
        });
        charFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            this._loadSpritesheet(file);
            charFileInput.value = '';
        });
    }

    _loadSpritesheet(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                this.spritesheet = img;
                this._updateSpritesheetPreview();
                this.app.mapCanvas.render();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    /**
     * Set spritesheet from an already-loaded Image element.
     */
    setSpritesheet(img) {
        this.spritesheet = img;
        this._updateSpritesheetPreview();
    }

    _updateSpritesheetPreview() {
        const container = document.getElementById('charsheet-preview-container');
        container.innerHTML = '';
        if (!this.spritesheet) return;

        const preview = document.createElement('img');
        preview.className = 'charsheet-preview';
        preview.src = this.spritesheet.src || ExportUtils._imageToDataURL(this.spritesheet);
        preview.title = `${this.spritesheet.width}x${this.spritesheet.height}`;
        container.appendChild(preview);

        const removeBtn = document.createElement('button');
        removeBtn.className = 'charsheet-remove-btn';
        removeBtn.textContent = 'Remove';
        removeBtn.title = 'Remove character spritesheet';
        removeBtn.addEventListener('click', () => {
            this.spritesheet = null;
            container.innerHTML = '';
            this.app.mapCanvas.render();
        });
        container.appendChild(removeBtn);
    }

    /**
     * Get the source rectangle for a character sprite.
     * Layout: 4 chars * 3 frames = 12 columns, 2 groups * 4 directions = 8 rows
     */
    getSpriteRect(charIndex, direction, frame) {
        if (!this.spritesheet) return null;

        const spriteCols = this.CHAR_COLS * this.FRAMES_PER_ANIM; // 12
        const spriteRows = this.CHAR_GROUPS * this.DIRECTIONS;     // 8
        const charWidth = Math.floor(this.spritesheet.width / spriteCols);
        const charHeight = Math.floor(this.spritesheet.height / spriteRows);

        const groupRow = Math.floor(charIndex / this.CHAR_COLS); // 0 or 1
        const groupCol = charIndex % this.CHAR_COLS;              // 0-3

        const col = groupCol * this.FRAMES_PER_ANIM + (frame || 1); // default to standing frame
        const row = groupRow * this.DIRECTIONS + (direction || 0);

        return {
            sx: col * charWidth,
            sy: row * charHeight,
            sw: charWidth,
            sh: charHeight,
        };
    }

    getMobAt(x, y) {
        return this.mobs.find(m => m.x === x && m.y === y) || null;
    }

    selectMob(mob) {
        this.selectedMob = mob;
        this.renderList();
    }

    addMob(mob) {
        if (!mob.id) mob.id = 'mob_' + (this._nextId++);
        this.mobs.push(mob);
        this.renderList();
        return mob;
    }

    removeMob(id) {
        this.mobs = this.mobs.filter(m => m.id !== id);
    }

    updateMob(id, data) {
        const mob = this.mobs.find(m => m.id === id);
        if (mob) Object.assign(mob, data);
        this.renderList();
    }

    openCreateModal(x, y) {
        this._openModal({
            id: 'mob_' + (this._nextId++),
            name: 'NPC',
            x, y,
            charIndex: 0,
            direction: 0,
            dialogue: ['Hello!'],
            hp: 10,
            maxHp: 10,
            stats: { ATK: 1, DEF: 1, SPD: 1 },
            collision: true,
        }, false);
    }

    openEditModal(mob) {
        this._openModal(mob, true);
    }

    _openModal(mob, isEdit) {
        const modal = document.getElementById('modal-mob');
        modal.classList.remove('hidden');

        document.getElementById('mob-name').value = mob.name;
        document.getElementById('mob-x').value = mob.x;
        document.getElementById('mob-y').value = mob.y;
        document.getElementById('mob-char-index').value = mob.charIndex;
        document.getElementById('mob-direction').value = mob.direction;
        document.getElementById('mob-hp').value = mob.hp;
        document.getElementById('mob-max-hp').value = mob.maxHp;
        document.getElementById('mob-collision').checked = mob.collision;
        document.getElementById('mob-dialogue').value = (mob.dialogue || []).join('\n');

        // Stats
        const statsStr = Object.entries(mob.stats || {}).map(([k, v]) => `${k}:${v}`).join(', ');
        document.getElementById('mob-stats').value = statsStr;

        // Title
        modal.querySelector('h2').textContent = isEdit ? 'Edit Mob/NPC' : 'Add Mob/NPC';

        // Update sprite preview in modal
        this._updateModalSpritePreview(mob.charIndex, mob.direction);

        // Remove old listeners
        const saveBtn = document.getElementById('btn-save-mob');
        const cancelBtn = modal.querySelector('.btn-cancel');
        const newSave = saveBtn.cloneNode(true);
        const newCancel = cancelBtn.cloneNode(true);
        saveBtn.parentNode.replaceChild(newSave, saveBtn);
        cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);

        newCancel.addEventListener('click', () => modal.classList.add('hidden'));

        // Live preview updates when charIndex or direction changes
        const charIndexInput = document.getElementById('mob-char-index');
        const dirSelect = document.getElementById('mob-direction');
        const previewUpdate = () => {
            this._updateModalSpritePreview(
                parseInt(charIndexInput.value) || 0,
                parseInt(dirSelect.value) || 0
            );
        };
        charIndexInput.addEventListener('input', previewUpdate);
        dirSelect.addEventListener('change', previewUpdate);

        newSave.addEventListener('click', () => {
            const data = {
                name: document.getElementById('mob-name').value || 'NPC',
                x: parseInt(document.getElementById('mob-x').value) || 0,
                y: parseInt(document.getElementById('mob-y').value) || 0,
                charIndex: parseInt(document.getElementById('mob-char-index').value) || 0,
                direction: parseInt(document.getElementById('mob-direction').value) || 0,
                hp: parseInt(document.getElementById('mob-hp').value) || 10,
                maxHp: parseInt(document.getElementById('mob-max-hp').value) || 10,
                collision: document.getElementById('mob-collision').checked,
                dialogue: document.getElementById('mob-dialogue').value.split('\n').filter(l => l.trim()),
                stats: {},
            };

            // Parse stats
            const statsRaw = document.getElementById('mob-stats').value;
            if (statsRaw.trim()) {
                statsRaw.split(',').forEach(pair => {
                    const [k, v] = pair.split(':').map(s => s.trim());
                    if (k && v) data.stats[k] = isNaN(Number(v)) ? v : Number(v);
                });
            }

            if (isEdit) {
                this.updateMob(mob.id, data);
            } else {
                data.id = mob.id;
                this.addMob(data);
            }

            modal.classList.add('hidden');
            this.app.mapCanvas.render();
        });
    }

    /**
     * Update sprite preview in the mob modal dialog.
     */
    _updateModalSpritePreview(charIndex, direction) {
        let previewEl = document.getElementById('mob-sprite-preview');
        if (!previewEl) {
            const container = document.createElement('div');
            container.id = 'mob-sprite-preview';
            container.className = 'mob-sprite-preview';
            const modal = document.getElementById('modal-mob').querySelector('.modal-content');
            const firstLabel = modal.querySelector('label');
            modal.insertBefore(container, firstLabel);
            previewEl = container;
        }

        previewEl.innerHTML = '';
        if (!this.spritesheet) {
            previewEl.innerHTML = '<span class="hint">No character sheet loaded</span>';
            return;
        }

        const rect = this.getSpriteRect(charIndex, direction, 1);
        if (!rect) return;

        const canvas = document.createElement('canvas');
        const scale = 2;
        canvas.width = rect.sw * scale;
        canvas.height = rect.sh * scale;
        canvas.style.imageRendering = 'pixelated';
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(
            this.spritesheet,
            rect.sx, rect.sy, rect.sw, rect.sh,
            0, 0, canvas.width, canvas.height
        );
        previewEl.appendChild(canvas);
    }

    renderList() {
        this._listEl.innerHTML = '';
        for (const mob of this.mobs) {
            const li = document.createElement('li');
            li.className = 'mob-item' + (this.selectedMob === mob ? ' active' : '');

            // Sprite thumbnail
            if (this.spritesheet) {
                const rect = this.getSpriteRect(mob.charIndex, mob.direction, 1);
                if (rect) {
                    const thumbCanvas = document.createElement('canvas');
                    thumbCanvas.width = 20;
                    thumbCanvas.height = 20;
                    thumbCanvas.className = 'mob-list-thumb';
                    thumbCanvas.style.imageRendering = 'pixelated';
                    const ctx = thumbCanvas.getContext('2d');
                    ctx.imageSmoothingEnabled = false;
                    const aspect = rect.sw / rect.sh;
                    const drawW = aspect >= 1 ? 20 : 20 * aspect;
                    const drawH = aspect >= 1 ? 20 / aspect : 20;
                    ctx.drawImage(
                        this.spritesheet,
                        rect.sx, rect.sy, rect.sw, rect.sh,
                        (20 - drawW) / 2, (20 - drawH) / 2, drawW, drawH
                    );
                    li.appendChild(thumbCanvas);
                }
            }

            const nameSpan = document.createElement('span');
            nameSpan.className = 'mob-item-name';
            nameSpan.textContent = `${mob.name} (${mob.x},${mob.y})`;
            li.appendChild(nameSpan);

            const editBtn = document.createElement('button');
            editBtn.className = 'mob-edit-btn';
            editBtn.textContent = 'E';
            editBtn.title = 'Edit';
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectMob(mob);
                this.openEditModal(mob);
            });
            li.appendChild(editBtn);

            li.addEventListener('click', () => {
                this.selectMob(mob);
            });

            this._listEl.appendChild(li);
        }
    }

    /**
     * Draw mob markers on the map canvas.
     * If a spritesheet is loaded, draws character sprites; otherwise falls back to markers.
     */
    renderOnCanvas(ctx, zoom, tileSize, camera) {
        const ts = tileSize * zoom;
        for (const mob of this.mobs) {
            const x = mob.x * ts - (camera ? camera.x : 0);
            const y = mob.y * ts - (camera ? camera.y : 0);

            if (this.spritesheet) {
                // Draw character sprite
                const rect = this.getSpriteRect(mob.charIndex, mob.direction, 1);
                if (rect) {
                    const scale = ts / rect.sw;
                    const drawW = rect.sw * scale;
                    const drawH = rect.sh * scale;
                    const drawX = x + (ts - drawW) / 2;
                    const drawY = y + ts - drawH;

                    ctx.imageSmoothingEnabled = false;
                    ctx.drawImage(
                        this.spritesheet,
                        rect.sx, rect.sy, rect.sw, rect.sh,
                        drawX, drawY, drawW, drawH
                    );
                }
            } else {
                // Fallback: diamond marker
                ctx.fillStyle = this.selectedMob === mob ? 'rgba(79, 195, 247, 0.5)' : 'rgba(255, 152, 0, 0.4)';
                ctx.fillRect(x + 2, y + 2, ts - 4, ts - 4);

                ctx.strokeStyle = this.selectedMob === mob ? '#4fc3f7' : '#ff9800';
                ctx.lineWidth = 2;
                ctx.strokeRect(x + 2, y + 2, ts - 4, ts - 4);

                // Mob icon (M)
                ctx.fillStyle = '#fff';
                ctx.font = `bold ${Math.max(10, ts * 0.35)}px monospace`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('M', x + ts / 2, y + ts / 2);
            }

            // Selection highlight
            if (this.selectedMob === mob) {
                ctx.strokeStyle = '#4fc3f7';
                ctx.lineWidth = 2;
                ctx.setLineDash([4, 2]);
                ctx.strokeRect(x + 1, y + 1, ts - 2, ts - 2);
                ctx.setLineDash([]);
            }

            // Name above
            ctx.font = `${Math.max(8, ts * 0.25)}px monospace`;
            ctx.fillStyle = '#ffa726';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText(mob.name, x + ts / 2, y - 2);
        }
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
    }

    toJSON() {
        return this.mobs.map(m => ({
            id: m.id,
            name: m.name,
            x: m.x,
            y: m.y,
            charIndex: m.charIndex,
            direction: m.direction,
            dialogue: m.dialogue,
            hp: m.hp,
            maxHp: m.maxHp,
            stats: m.stats,
            collision: m.collision,
        }));
    }

    fromJSON(arr) {
        this.mobs = [];
        this._nextId = 1;
        if (!Array.isArray(arr)) return;
        for (const m of arr) {
            this.mobs.push({
                id: m.id || 'mob_' + (this._nextId++),
                name: m.name || 'NPC',
                x: m.x || 0,
                y: m.y || 0,
                charIndex: m.charIndex != null ? m.charIndex : 0,
                direction: m.direction != null ? m.direction : 0,
                dialogue: m.dialogue || [],
                hp: m.hp || 10,
                maxHp: m.maxHp || 10,
                stats: m.stats || {},
                collision: m.collision !== false,
            });
            const numId = parseInt((m.id || '').replace('mob_', ''));
            if (!isNaN(numId) && numId >= this._nextId) this._nextId = numId + 1;
        }
        this.renderList();
    }

    clear() {
        this.mobs = [];
        this.selectedMob = null;
        this._nextId = 1;
        this.renderList();
    }
}
