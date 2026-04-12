/**
 * Shared canvas drawing helpers used by all export renderers.
 * Each function takes a CanvasRenderingContext2D as its first argument.
 */

/**
 * Draw text on a canvas context.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} x
 * @param {number} y
 * @param {string} [font]
 * @param {string} [color]
 * @param {string} [align]
 */
export function drawText(ctx, text, x, y, font, color, align) {
    ctx.fillStyle = color || "#fff";
    ctx.font = font || "32px Segoe UI, sans-serif";
    ctx.textAlign = align || "center";
    ctx.fillText(text, x, y);
}

/**
 * Draw a rounded rectangle on a canvas context.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {number} r — corner radius
 * @param {string} [fill] — fill color
 * @param {string} [stroke] — stroke color
 */
export function drawRoundRect(ctx, x, y, w, h, r, fill, stroke) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
}

/**
 * Draw a horizontal divider line.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x1
 * @param {number} x2
 * @param {number} y
 * @param {string} [color]
 */
export function drawDivider(ctx, x1, x2, y, color) {
    ctx.strokeStyle = color || "#222";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.stroke();
}

/**
 * Draw a filled circle (status dot).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx — center x
 * @param {number} cy — center y
 * @param {number} r — radius
 * @param {string} color — fill color
 */
export function drawDot(ctx, cx, cy, r, color) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
}

/**
 * Draw a background image covering the canvas with optional opacity.
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLImageElement} img
 * @param {number} W — canvas width
 * @param {number} H — canvas height
 * @param {number} [opacity=0.15]
 */
export function drawBackgroundImage(ctx, img, W, H, opacity) {
    ctx.save();
    ctx.globalAlpha = opacity ?? 0.15;
    const bAr = img.width / img.height;
    const cAr = W / H;
    let dw, dh, dx, dy;
    if (bAr > cAr) { dh = H; dw = H * bAr; dx = (W - dw) / 2; dy = 0; }
    else { dw = W; dh = W / bAr; dx = 0; dy = (H - dh) / 2; }
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.globalAlpha = 1.0;
    ctx.restore();
}

/**
 * Draw a client logo clipped to a rounded rectangle.
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLImageElement} img
 * @param {number} x
 * @param {number} y
 * @param {number} size — width & height
 * @param {number} [radius=10]
 */
export function drawLogo(ctx, img, x, y, size, radius) {
    const r = radius ?? 10;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, r);
    ctx.clip();
    ctx.drawImage(img, x, y, size, size);
    ctx.restore();
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, r);
    ctx.stroke();
}

/**
 * Draw a gradient-filled progress bar.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} w — total width
 * @param {number} h — bar height
 * @param {number} r — corner radius
 * @param {number} pct — completion percentage (0–100)
 * @param {string[]} gradColors — [fromColor, toColor]
 * @param {string} trackFill — track background color
 * @param {string} trackStroke — track border color
 */
export function drawProgressBar(ctx, x, y, w, h, r, pct, gradColors, trackFill, trackStroke) {
    // Background track
    drawRoundRect(ctx, x, y, w, h, r, trackFill, trackStroke);
    // Gradient fill
    if (pct > 0) {
        const fillW = Math.max(r * 2, w * pct / 100);
        ctx.beginPath();
        ctx.roundRect(x, y, fillW, h, r);
        const grad = ctx.createLinearGradient(x, 0, x + fillW, 0);
        grad.addColorStop(0, gradColors[0]);
        grad.addColorStop(1, gradColors[1]);
        ctx.fillStyle = grad;
        ctx.fill();
    }
}

/**
 * Resize a canvas if content has overflowed its current height.
 * Preserves existing pixel data.
 * @param {HTMLCanvasElement} cv
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} contentBottom — the Y position where content ends
 * @param {number} padding — extra padding below content
 * @param {string} bgColor — background fill for resized area
 * @returns {number} — the new canvas height
 */
export function resizeIfNeeded(cv, ctx, contentBottom, padding, bgColor) {
    const needed = contentBottom + padding;
    if (needed <= cv.height) return cv.height;
    const W = cv.width;
    const oldH = cv.height;
    const imgData = ctx.getImageData(0, 0, W, oldH);
    cv.height = needed;
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, W, needed);
    ctx.putImageData(imgData, 0, 0);
    return needed;
}

/**
 * Export a canvas as a PNG blob and trigger download (or share on mobile).
 * @param {HTMLCanvasElement} cv
 * @param {string} filename — base filename (without timestamp)
 * @param {string} [shareTitle] — title for Web Share API (if supported)
 * @param {function} [onDone] — callback after export completes
 */
export function exportCanvasAsImage(cv, filename, shareTitle, onDone) {
    const ts = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    const fullName = filename + "_" + ts + ".png";

    cv.toBlob(blob => {
        if (shareTitle && navigator.share && navigator.canShare) {
            const file = new File([blob], fullName, { type: "image/png" });
            if (navigator.canShare({ files: [file] })) {
                navigator.share({ title: shareTitle, files: [file] }).catch(() => {});
                if (onDone) onDone();
                return;
            }
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fullName;
        a.click();
        URL.revokeObjectURL(url);
        if (onDone) onDone();
    }, "image/png");
}

/**
 * Format a timestamp string for export headers.
 * @returns {string} e.g. "Sat, 12 Apr 2026, 14:32:08 UK"
 */
export function formatExportTimestamp() {
    return new Date().toLocaleString("en-GB", {
        weekday: "short", day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }) + " UK";
}
