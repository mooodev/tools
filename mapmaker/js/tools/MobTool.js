/**
 * MobTool.js - Tool for placing and editing mobs/NPCs on the map.
 */
class MobTool extends BaseTool {
    constructor(app) {
        super(app);
        this.name = 'mob';
        this._hoveredMob = null;
    }

    getCursor() { return 'pointer'; }

    onMouseDown(e, tileX, tileY) {
        if (tileX < 0 || tileY < 0 || tileX >= this.map.width || tileY >= this.map.height) return;

        // Check if clicking on existing mob
        const existing = this.app.mobManager.getMobAt(tileX, tileY);
        if (existing) {
            this.app.mobManager.selectMob(existing);
            this.app.mobManager.openEditModal(existing);
        } else {
            // Place new mob
            this.app.mobManager.openCreateModal(tileX, tileY);
        }
    }

    onMouseMove(e, tileX, tileY) {
        this._hoveredMob = this.app.mobManager.getMobAt(tileX, tileY);
    }

    onMouseUp(e, tileX, tileY) {}
}
