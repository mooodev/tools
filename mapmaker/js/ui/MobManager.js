/**
 * MobManager.js - Manages mob/NPC entities on the map.
 * Handles creation, editing, rendering, and serialization of mobs.
 */
class MobManager {
    constructor(app) {
        this.app = app;
        /** @type {{id:string, name:string, x:number, y:number, charIndex:number, direction:number, dialogue:string[], hp:number, maxHp:number, stats:Object, collision:boolean}[]} */
        this.mobs = [];
        this.selectedMob = null;
        this._nextId = 1;

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

        // Remove old listeners
        const saveBtn = document.getElementById('btn-save-mob');
        const cancelBtn = modal.querySelector('.btn-cancel');
        const newSave = saveBtn.cloneNode(true);
        const newCancel = cancelBtn.cloneNode(true);
        saveBtn.parentNode.replaceChild(newSave, saveBtn);
        cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);

        newCancel.addEventListener('click', () => modal.classList.add('hidden'));

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

    renderList() {
        this._listEl.innerHTML = '';
        for (const mob of this.mobs) {
            const li = document.createElement('li');
            li.className = 'mob-item' + (this.selectedMob === mob ? ' active' : '');

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
     */
    renderOnCanvas(ctx, zoom, tileSize, camera) {
        const ts = tileSize * zoom;
        for (const mob of this.mobs) {
            const x = mob.x * ts - (camera ? camera.x : 0);
            const y = mob.y * ts - (camera ? camera.y : 0);

            // Mob marker - diamond shape
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

            // Name above
            ctx.font = `${Math.max(8, ts * 0.25)}px monospace`;
            ctx.fillStyle = '#ffa726';
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
