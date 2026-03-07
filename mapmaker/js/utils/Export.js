/**
 * Export.js - Export and import utilities for maps.
 * Supports PNG image export, JSON data export, and project save/load.
 */
class ExportUtils {
    /**
     * Export the map as a PNG image.
     * @param {TileMap} tileMap
     * @param {TilesetManager} tilesetMgr
     * @param {AnimationManager} animMgr
     * @param {AutoTiler} autoTiler
     */
    static exportPNG(tileMap, tilesetMgr, animMgr, autoTiler) {
        const canvas = document.createElement('canvas');
        canvas.width = tileMap.pixelWidth;
        canvas.height = tileMap.pixelHeight;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;

        for (const layer of tileMap.layers) {
            if (!layer.visible) continue;
            ctx.globalAlpha = layer.opacity;

            for (let y = 0; y < layer.height; y++) {
                for (let x = 0; x < layer.width; x++) {
                    const tile = layer.data[y][x];
                    if (!tile) continue;

                    const tsData = tilesetMgr.tilesets[tile.tilesetIndex];
                    if (!tsData) continue;

                    const img = animMgr.getCurrentFrameImage(tile.tilesetIndex, tsData.image);
                    const ts = tileMap.tileSize;

                    let srcX = tile.srcX;
                    let srcY = tile.srcY;

                    if (tile.isAutotile && tile.autotileId !== null) {
                        const variant = autoTiler.getVariantPosition(tile.autotileId);
                        srcX = tile.srcX * 7 + variant.col;
                        srcY = tile.srcY * 7 + variant.row;
                    }

                    ctx.drawImage(
                        img,
                        srcX * ts, srcY * ts, ts, ts,
                        x * ts, y * ts, ts, ts
                    );
                }
            }
        }
        ctx.globalAlpha = 1.0;

        const link = document.createElement('a');
        link.download = 'tilemap.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
    }

    /**
     * Export map data as JSON, including tileset and character spritesheet images.
     */
    static exportJSON(tileMap, tilesetMgr, mobManager, autotileConfig) {
        const tilesetData = tilesetMgr.tilesets.map(ts => ({
            name: ts.name,
            cols: ts.cols,
            rows: ts.rows,
            image: ExportUtils._imageToDataURL(ts.image),
        }));

        const data = {
            version: 2,
            map: tileMap.toJSON(),
            tilesets: tilesetData,
            mobs: mobManager ? mobManager.toJSON() : [],
            autotileDefs: autotileConfig ? autotileConfig.toJSON() : {},
            playerStart: { x: 2, y: 2 },
        };

        // Include character spritesheet if loaded
        if (mobManager && mobManager.spritesheet) {
            data.charSpritesheet = ExportUtils._imageToDataURL(mobManager.spritesheet);
        }

        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const link = document.createElement('a');
        link.download = 'tilemap.json';
        link.href = URL.createObjectURL(blob);
        link.click();
        URL.revokeObjectURL(link.href);
    }

    /**
     * Import map data from JSON (just the map structure, not tileset images).
     */
    static importJSON(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    resolve(data);
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }

    /**
     * Save full project (map + tileset images + character spritesheet as base64).
     */
    static saveProject(tileMap, tilesetMgr, animMgr, mobManager, autotileConfig) {
        const tilesetData = tilesetMgr.tilesets.map((ts, idx) => {
            const frames = [];
            const frameCount = animMgr.getFrameCount(idx);
            if (frameCount > 0) {
                const frameList = animMgr.frames.get(idx);
                for (const frameImg of frameList) {
                    frames.push(ExportUtils._imageToDataURL(frameImg));
                }
            }
            return {
                name: ts.name,
                image: ExportUtils._imageToDataURL(ts.image),
                frames
            };
        });

        const project = {
            version: 2,
            map: tileMap.toJSON(),
            tilesets: tilesetData,
            animSpeed: animMgr.speed,
            mobs: mobManager ? mobManager.toJSON() : [],
            autotileDefs: autotileConfig ? autotileConfig.toJSON() : {},
            playerStart: { x: 2, y: 2 }
        };

        // Include character spritesheet
        if (mobManager && mobManager.spritesheet) {
            project.charSpritesheet = ExportUtils._imageToDataURL(mobManager.spritesheet);
        }

        const json = JSON.stringify(project);
        const blob = new Blob([json], { type: 'application/json' });
        const link = document.createElement('a');
        link.download = 'project.mapmaker';
        link.href = URL.createObjectURL(blob);
        link.click();
        URL.revokeObjectURL(link.href);
    }

    /**
     * Load full project from file.
     */
    static loadProject(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    resolve(data);
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }

    /**
     * Convert an image element to a data URL.
     */
    static _imageToDataURL(img) {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        return canvas.toDataURL('image/png');
    }

    /**
     * Load image from data URL.
     */
    static loadImageFromDataURL(dataURL) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = dataURL;
        });
    }
}
