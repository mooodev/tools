/**
 * AnimationManager.js - Manages animated tileset frames.
 *
 * When multiple tileset images with the same layout are uploaded,
 * they are treated as animation frames. The manager cycles through
 * frames at a configurable speed, allowing tiles to animate.
 */
class AnimationManager {
    constructor() {
        /** @type {Map<number, HTMLImageElement[]>} tilesetIndex -> array of frame images */
        this.frames = new Map();
        this.speed = 500; // ms per frame
        this.currentFrame = 0;
        this.playing = false;
        this._timer = null;
        this._onFrameChange = null;
    }

    /**
     * Set callback for frame changes.
     */
    onFrameChange(callback) {
        this._onFrameChange = callback;
    }

    /**
     * Add an animation frame image for a tileset.
     * @param {number} tilesetIndex
     * @param {HTMLImageElement} image
     */
    addFrame(tilesetIndex, image) {
        if (!this.frames.has(tilesetIndex)) {
            this.frames.set(tilesetIndex, []);
        }
        this.frames.get(tilesetIndex).push(image);
    }

    /**
     * Remove all frames for a tileset.
     */
    removeFrames(tilesetIndex) {
        this.frames.delete(tilesetIndex);
    }

    /**
     * Get the current frame image for a tileset.
     * Returns the base image if no animation frames exist.
     * @param {number} tilesetIndex
     * @param {HTMLImageElement} baseImage
     * @returns {HTMLImageElement}
     */
    getCurrentFrameImage(tilesetIndex, baseImage) {
        const frameList = this.frames.get(tilesetIndex);
        if (!frameList || frameList.length === 0) return baseImage;
        const idx = this.currentFrame % frameList.length;
        return frameList[idx];
    }

    /**
     * Get total frame count for a tileset.
     */
    getFrameCount(tilesetIndex) {
        const frameList = this.frames.get(tilesetIndex);
        return frameList ? frameList.length : 0;
    }

    /**
     * Set animation speed.
     */
    setSpeed(ms) {
        this.speed = Math.max(50, ms);
        if (this.playing) {
            this.stop();
            this.play();
        }
    }

    /**
     * Start animation playback.
     */
    play() {
        if (this.playing) return;
        this.playing = true;
        this._timer = setInterval(() => {
            this.currentFrame++;
            if (this._onFrameChange) {
                this._onFrameChange(this.currentFrame);
            }
        }, this.speed);
    }

    /**
     * Stop animation playback.
     */
    stop() {
        this.playing = false;
        if (this._timer) {
            clearInterval(this._timer);
            this._timer = null;
        }
    }

    /**
     * Toggle play/stop.
     */
    toggle() {
        if (this.playing) {
            this.stop();
        } else {
            this.play();
        }
        return this.playing;
    }

    /**
     * Reset to frame 0.
     */
    reset() {
        this.currentFrame = 0;
    }
}
