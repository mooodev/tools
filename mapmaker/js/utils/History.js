/**
 * History.js - Undo/Redo system.
 * Stores layer snapshots before and after each editing action.
 */
class UndoHistory {
    constructor(maxSize = 50) {
        this.maxSize = maxSize;
        /** @type {{layerIndex: number, before: Array, after: Array}[]} */
        this.undoStack = [];
        this.redoStack = [];
        this._pendingLayerIndex = -1;
        this._pendingSnapshot = null;
    }

    /**
     * Call before starting an edit action.
     * Captures the layer state before changes.
     */
    beginAction(layerIndex, layer) {
        this._pendingLayerIndex = layerIndex;
        this._pendingSnapshot = layer.snapshot();
    }

    /**
     * Call after completing an edit action.
     * Captures the layer state after changes and stores the undo entry.
     */
    endAction(layer) {
        if (this._pendingSnapshot === null) return;

        const afterSnap = layer.snapshot();
        this.undoStack.push({
            layerIndex: this._pendingLayerIndex,
            before: this._pendingSnapshot,
            after: afterSnap
        });

        // Trim if over max size
        while (this.undoStack.length > this.maxSize) {
            this.undoStack.shift();
        }

        // Clear redo stack on new action
        this.redoStack = [];
        this._pendingSnapshot = null;
        this._pendingLayerIndex = -1;
    }

    /**
     * Undo the last action.
     */
    undo(tileMap) {
        if (this.undoStack.length === 0) return false;
        const entry = this.undoStack.pop();
        const layer = tileMap.layers[entry.layerIndex];
        if (layer) {
            layer.restoreSnapshot(entry.before);
        }
        this.redoStack.push(entry);
        return true;
    }

    /**
     * Redo the last undone action.
     */
    redo(tileMap) {
        if (this.redoStack.length === 0) return false;
        const entry = this.redoStack.pop();
        const layer = tileMap.layers[entry.layerIndex];
        if (layer) {
            layer.restoreSnapshot(entry.after);
        }
        this.undoStack.push(entry);
        return true;
    }

    /**
     * Clear all history.
     */
    clear() {
        this.undoStack = [];
        this.redoStack = [];
        this._pendingSnapshot = null;
    }

    get canUndo() { return this.undoStack.length > 0; }
    get canRedo() { return this.redoStack.length > 0; }
}
