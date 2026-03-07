/**
 * Minimap.js - Small overview of the entire map.
 */
class Minimap {
    constructor(app) {
        this.app = app;
        this.canvas = document.getElementById('minimap-canvas');
        this.ctx = this.canvas.getContext('2d');
    }

    render() {
        const map = this.app.tileMap;
        if (!map) return;

        const maxW = 200;
        const maxH = 150;
        const scale = Math.min(maxW / map.pixelWidth, maxH / map.pixelHeight, 1);
        const w = Math.floor(map.pixelWidth * scale);
        const h = Math.floor(map.pixelHeight * scale);

        this.canvas.width = w;
        this.canvas.height = h;
        this.ctx.imageSmoothingEnabled = false;

        // Draw from the main canvas scaled down
        this.ctx.clearRect(0, 0, w, h);
        this.ctx.drawImage(this.app.mapCanvas.canvas, 0, 0, w, h);
    }
}
