import {Pt, dist} from "./Geometry";

/**
 * Accumulates flat 2D shapes (in the XY plane, facing +Z) into a single
 * vertex-coloured mesh, so a whole layer of the panel costs one draw call.
 * Winding is CCW viewed from +Z throughout, matching Lens Studio's back-face cull.
 */

export type RGBA = number[];

const LAYOUT = [
    {name: "position", components: 3},
    {name: "color", components: 4}
];

/**
 * The vertex-colour shader treats incoming colour as linear and writes sRGB, so
 * palette values (authored as sRGB) have to be linearised or everything renders
 * washed out. Converted once per palette entry and memoised on the array itself.
 */
const LINEAR_CACHE: RGBA[][] = [];
const SRGB_KEYS: RGBA[] = [];

function channelToLinear(v: number): number {
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function toLinear(c: RGBA): RGBA {
    for (let i = 0; i < SRGB_KEYS.length; i++) {
        if (SRGB_KEYS[i] === c) {
            return LINEAR_CACHE[i][0];
        }
    }
    const out = [channelToLinear(c[0]), channelToLinear(c[1]), channelToLinear(c[2]), c[3]];
    SRGB_KEYS.push(c);
    LINEAR_CACHE.push([out]);
    return out;
}

export class MeshPainter {
    private verts: number[] = [];
    private indices: number[] = [];
    private count: number = 0;
    private visual: RenderMeshVisual;

    constructor(parent: SceneObject, name: string, material: Material, renderOrder: number) {
        const obj = global.scene.createSceneObject(name);
        obj.setParent(parent);
        this.visual = obj.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        this.visual.mainMaterial = material;
        this.visual.renderOrder = renderOrder;
    }

    clear(): void {
        this.verts.length = 0;
        this.indices.length = 0;
        this.count = 0;
    }

    get isEmpty(): boolean {
        return this.count === 0;
    }

    private vertex(x: number, y: number, z: number, c: RGBA): number {
        this.verts.push(x, y, z, c[0], c[1], c[2], c[3]);
        return this.count++;
    }

    /** Quad from four points given counter-clockwise: bottom-left, bottom-right, top-right, top-left. */
    private quad(p0: Pt, p1: Pt, p2: Pt, p3: Pt, z: number, cIn: RGBA): void {
        const c = toLinear(cIn);
        const i0 = this.vertex(p0[0], p0[1], z, c);
        const i1 = this.vertex(p1[0], p1[1], z, c);
        const i2 = this.vertex(p2[0], p2[1], z, c);
        const i3 = this.vertex(p3[0], p3[1], z, c);
        this.indices.push(i0, i1, i2, i0, i2, i3);
    }

    addRect(x0: number, y0: number, x1: number, y1: number, z: number, c: RGBA): void {
        const lo = Math.min(x0, x1);
        const hi = Math.max(x0, x1);
        const bo = Math.min(y0, y1);
        const to = Math.max(y0, y1);
        this.quad([lo, bo], [hi, bo], [hi, to], [lo, to], z, c);
    }

    /** Rounded rectangle approximated by a centre bar plus four corner fans. */
    addRoundedRect(x0: number, y0: number, x1: number, y1: number, r: number, z: number, c: RGBA): void {
        const lo = Math.min(x0, x1);
        const hi = Math.max(x0, x1);
        const bo = Math.min(y0, y1);
        const to = Math.max(y0, y1);
        const rad = Math.max(0, Math.min(r, (hi - lo) * 0.5, (to - bo) * 0.5));
        if (rad <= 1e-4) {
            this.addRect(lo, bo, hi, to, z, c);
            return;
        }
        this.addRect(lo + rad, bo, hi - rad, to, z, c);
        this.addRect(lo, bo + rad, lo + rad, to - rad, z, c);
        this.addRect(hi - rad, bo + rad, hi, to - rad, z, c);
        this.addCorner(lo + rad, to - rad, rad, Math.PI * 0.5, Math.PI, z, c);
        this.addCorner(hi - rad, to - rad, rad, 0, Math.PI * 0.5, z, c);
        this.addCorner(hi - rad, bo + rad, rad, -Math.PI * 0.5, 0, z, c);
        this.addCorner(lo + rad, bo + rad, rad, Math.PI, Math.PI * 1.5, z, c);
    }

    private addCorner(cx: number, cy: number, r: number, a0: number, a1: number, z: number, cIn: RGBA): void {
        const c = toLinear(cIn);
        const seg = 5;
        const hub = this.vertex(cx, cy, z, c);
        let prev = -1;
        for (let i = 0; i <= seg; i++) {
            const a = a0 + (a1 - a0) * (i / seg);
            const idx = this.vertex(cx + Math.cos(a) * r, cy + Math.sin(a) * r, z, c);
            if (prev >= 0) {
                this.indices.push(hub, prev, idx);
            }
            prev = idx;
        }
    }

    addDisc(cx: number, cy: number, r: number, z: number, cIn: RGBA, seg: number = 16): void {
        const c = toLinear(cIn);
        const hub = this.vertex(cx, cy, z, c);
        const first = this.count;
        for (let i = 0; i < seg; i++) {
            const a = (i / seg) * Math.PI * 2;
            this.vertex(cx + Math.cos(a) * r, cy + Math.sin(a) * r, z, c);
        }
        for (let i = 0; i < seg; i++) {
            this.indices.push(hub, first + i, first + ((i + 1) % seg));
        }
    }

    /** One uniform-width segment as a quad perpendicular to the segment direction. */
    addSegment(a: Pt, b: Pt, width: number, z: number, c: RGBA): void {
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const m = Math.sqrt(dx * dx + dy * dy);
        if (m <= 1e-9) {
            return;
        }
        const nx = (-dy / m) * width * 0.5;
        const ny = (dx / m) * width * 0.5;
        this.quad(
            [a[0] - nx, a[1] - ny],
            [b[0] - nx, b[1] - ny],
            [b[0] + nx, b[1] + ny],
            [a[0] + nx, a[1] + ny],
            z, c
        );
    }

    /** Uniform-width polyline; discs at interior joints keep corners from notching. */
    addPolyline(pts: Pt[], width: number, z: number, c: RGBA, round: boolean = true): void {
        if (pts.length === 1) {
            this.addDisc(pts[0][0], pts[0][1], width * 0.5, z, c, 10);
            return;
        }
        for (let i = 1; i < pts.length; i++) {
            this.addSegment(pts[i - 1], pts[i], width, z, c);
        }
        if (round) {
            for (let i = 1; i < pts.length - 1; i++) {
                this.addDisc(pts[i][0], pts[i][1], width * 0.5, z, c, 8);
            }
        }
    }

    addDashedPolyline(pts: Pt[], width: number, dashLen: number, gapLen: number, z: number, c: RGBA): void {
        let on = true;
        let remaining = dashLen;
        for (let i = 1; i < pts.length; i++) {
            const a = pts[i - 1];
            const b = pts[i];
            const segLen = dist(a, b);
            if (segLen <= 1e-9) {
                continue;
            }
            const ux = (b[0] - a[0]) / segLen;
            const uy = (b[1] - a[1]) / segLen;
            let pos = 0;
            while (pos < segLen - 1e-9) {
                const step = Math.min(remaining, segLen - pos);
                if (on) {
                    this.addSegment(
                        [a[0] + ux * pos, a[1] + uy * pos],
                        [a[0] + ux * (pos + step), a[1] + uy * (pos + step)],
                        width, z, c
                    );
                }
                pos += step;
                remaining -= step;
                if (remaining <= 1e-9) {
                    on = !on;
                    remaining = on ? dashLen : gapLen;
                }
            }
        }
    }

    /** Rebuild the RenderMesh from whatever has been accumulated since the last clear(). */
    commit(): void {
        if (this.count === 0) {
            this.visual.enabled = false;
            return;
        }
        this.visual.enabled = true;
        const builder = new MeshBuilder(LAYOUT);
        builder.topology = MeshTopology.Triangles;
        builder.indexType = MeshIndexType.UInt16;
        builder.appendVerticesInterleaved(this.verts);
        builder.appendIndices(this.indices);
        this.visual.mesh = builder.getMesh();
        builder.updateMesh();
    }
}
