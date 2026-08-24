/**
 * Pure 2D polyline maths shared by the demo animation, the ghost overlay and the scorer.
 * A point is [x, y]. Callers keep everything in one space (normalised or slate-local cm).
 */

export type Pt = number[];

export function dist(a: Pt, b: Pt): number {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    return Math.sqrt(dx * dx + dy * dy);
}

export function polylineLength(pts: Pt[]): number {
    let sum = 0;
    for (let i = 1; i < pts.length; i++) {
        sum += dist(pts[i - 1], pts[i]);
    }
    return sum;
}

/** Evenly spaced resample by arc length. Always returns exactly n points. */
export function resample(pts: Pt[], n: number): Pt[] {
    const out: Pt[] = [];
    if (pts.length === 0 || n <= 0) {
        return out;
    }
    const total = polylineLength(pts);
    if (pts.length === 1 || total <= 1e-6) {
        for (let i = 0; i < n; i++) {
            out.push([pts[0][0], pts[0][1]]);
        }
        return out;
    }
    if (n === 1) {
        return [[pts[0][0], pts[0][1]]];
    }

    const step = total / (n - 1);
    out.push([pts[0][0], pts[0][1]]);

    let segIndex = 1;
    let travelled = 0;
    let anchor = pts[0];

    for (let i = 1; i < n - 1; i++) {
        const target = step * i;
        let placed = false;
        while (segIndex < pts.length) {
            const next = pts[segIndex];
            const segLen = dist(anchor, next);
            if (travelled + segLen >= target - 1e-9) {
                const t = segLen <= 1e-9 ? 0 : (target - travelled) / segLen;
                out.push([
                    anchor[0] + (next[0] - anchor[0]) * t,
                    anchor[1] + (next[1] - anchor[1]) * t
                ]);
                placed = true;
                break;
            }
            travelled += segLen;
            anchor = next;
            segIndex++;
        }
        if (!placed) {
            const last = pts[pts.length - 1];
            out.push([last[0], last[1]]);
        }
    }

    const last = pts[pts.length - 1];
    out.push([last[0], last[1]]);
    return out;
}

/** Point on the polyline at normalised arc-length position t (0..1). */
export function pointAt(pts: Pt[], t: number): Pt {
    if (pts.length === 0) {
        return [0, 0];
    }
    if (pts.length === 1) {
        return [pts[0][0], pts[0][1]];
    }
    const total = polylineLength(pts);
    if (total <= 1e-6) {
        return [pts[0][0], pts[0][1]];
    }
    const target = Math.max(0, Math.min(1, t)) * total;
    let travelled = 0;
    for (let i = 1; i < pts.length; i++) {
        const segLen = dist(pts[i - 1], pts[i]);
        if (travelled + segLen >= target) {
            const f = segLen <= 1e-9 ? 0 : (target - travelled) / segLen;
            return [
                pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f,
                pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f
            ];
        }
        travelled += segLen;
    }
    const last = pts[pts.length - 1];
    return [last[0], last[1]];
}

/** The leading portion of the polyline up to normalised arc-length t, for progressive drawing. */
export function sliceTo(pts: Pt[], t: number): Pt[] {
    if (pts.length < 2) {
        return pts.slice();
    }
    const total = polylineLength(pts);
    if (total <= 1e-6) {
        return [[pts[0][0], pts[0][1]]];
    }
    const target = Math.max(0, Math.min(1, t)) * total;
    const out: Pt[] = [[pts[0][0], pts[0][1]]];
    let travelled = 0;
    for (let i = 1; i < pts.length; i++) {
        const segLen = dist(pts[i - 1], pts[i]);
        if (travelled + segLen >= target) {
            const f = segLen <= 1e-9 ? 0 : (target - travelled) / segLen;
            out.push([
                pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f,
                pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f
            ]);
            return out;
        }
        travelled += segLen;
        out.push([pts[i][0], pts[i][1]]);
    }
    return out;
}

export function distPointToSegment(p: Pt, a: Pt, b: Pt): number {
    const vx = b[0] - a[0];
    const vy = b[1] - a[1];
    const wx = p[0] - a[0];
    const wy = p[1] - a[1];
    const vv = vx * vx + vy * vy;
    let t = vv <= 1e-12 ? 0 : (wx * vx + wy * vy) / vv;
    t = Math.max(0, Math.min(1, t));
    const cx = a[0] + vx * t;
    const cy = a[1] + vy * t;
    const dx = p[0] - cx;
    const dy = p[1] - cy;
    return Math.sqrt(dx * dx + dy * dy);
}

/** Distance from p to the nearest point anywhere on the polyline. */
export function distToPolyline(p: Pt, poly: Pt[]): number {
    if (poly.length === 0) {
        return Infinity;
    }
    if (poly.length === 1) {
        return dist(p, poly[0]);
    }
    let best = Infinity;
    for (let i = 1; i < poly.length; i++) {
        const d = distPointToSegment(p, poly[i - 1], poly[i]);
        if (d < best) {
            best = d;
        }
    }
    return best;
}

/** Nearest point on the polyline to p — used for signed offset diagnostics. */
export function nearestOnPolyline(p: Pt, poly: Pt[]): Pt {
    if (poly.length === 0) {
        return [p[0], p[1]];
    }
    if (poly.length === 1) {
        return [poly[0][0], poly[0][1]];
    }
    let best = Infinity;
    let bestPt: Pt = [poly[0][0], poly[0][1]];
    for (let i = 1; i < poly.length; i++) {
        const a = poly[i - 1];
        const b = poly[i];
        const vx = b[0] - a[0];
        const vy = b[1] - a[1];
        const vv = vx * vx + vy * vy;
        let t = vv <= 1e-12 ? 0 : ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / vv;
        t = Math.max(0, Math.min(1, t));
        const cx = a[0] + vx * t;
        const cy = a[1] + vy * t;
        const dx = p[0] - cx;
        const dy = p[1] - cy;
        const d = dx * dx + dy * dy;
        if (d < best) {
            best = d;
            bestPt = [cx, cy];
        }
    }
    return bestPt;
}

/** Unit vector from first point to last point. */
export function direction(pts: Pt[]): Pt {
    if (pts.length < 2) {
        return [0, 0];
    }
    const a = pts[0];
    const b = pts[pts.length - 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const m = Math.sqrt(dx * dx + dy * dy);
    return m <= 1e-9 ? [0, 0] : [dx / m, dy / m];
}

/**
 * Catmull-Rom interpolation through the given points. The stroke data is a handful of
 * control points; drawing straight lines between them makes a "C" look like a polygon.
 * The curve still passes exactly through every original point, so the same call is used
 * for the demo, the ghost and the scoring targets — they stay identical to each other.
 */
export function smoothPath(pts: Pt[], perSegment: number = 8): Pt[] {
    if (pts.length < 3 || perSegment < 2) {
        const copy: Pt[] = [];
        for (let i = 0; i < pts.length; i++) {
            copy.push([pts[i][0], pts[i][1]]);
        }
        return copy;
    }

    const out: Pt[] = [];
    const last = pts.length - 1;
    for (let i = 0; i < last; i++) {
        const p0 = pts[i === 0 ? 0 : i - 1];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[i + 2 > last ? last : i + 2];

        const steps = i === last - 1 ? perSegment : perSegment - 1;
        for (let s = 0; s <= steps; s++) {
            const t = s / perSegment;
            const t2 = t * t;
            const t3 = t2 * t;
            out.push([
                0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t
                    + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2
                    + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
                0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t
                    + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2
                    + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
            ]);
        }
    }
    return out;
}
