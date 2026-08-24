import {Pt, smoothPath} from "./Geometry";
import {MeshPainter, RGBA} from "./MeshPainter";
import {Stroke} from "./LetterData";
import {C, L, LETTER_HEIGHT, Z} from "./Theme";

/**
 * One ruled writing slate. Geometry is authored directly in panel-local
 * centimetres (the slate's horizontal centre is baked in), so every painter can
 * hang off the panel root with an identity transform.
 *
 * Layers are separate painters so ink, guide and ghost can be rebuilt
 * independently — erasing user ink can never touch the ruled lines.
 */
export class Slate {
    readonly centreX: number;
    readonly left: number;
    readonly right: number;

    private paper: MeshPainter;
    private rules: MeshPainter;
    guide: MeshPainter;
    ink: MeshPainter;
    ghost: MeshPainter;
    overlay: MeshPainter;

    constructor(parent: SceneObject, name: string, centreX: number, material: Material) {
        this.centreX = centreX;
        this.left = centreX - L.slateWidth * 0.5;
        this.right = centreX + L.slateWidth * 0.5;

        this.paper = new MeshPainter(parent, name + "_Paper", material, 10);
        this.rules = new MeshPainter(parent, name + "_Rules", material, 11);
        this.guide = new MeshPainter(parent, name + "_Guide", material, 12);
        this.ink = new MeshPainter(parent, name + "_Ink", material, 13);
        this.ghost = new MeshPainter(parent, name + "_Ghost", material, 14);
        this.overlay = new MeshPainter(parent, name + "_Overlay", material, 15);

        this.drawPaperAndRules();
    }

    /** Normalised letter-box coordinates to panel-local centimetres. */
    toLocal(n: Pt): Pt {
        return [
            this.centreX - L.letterWidth * 0.5 + n[0] * L.letterWidth,
            L.ascenderY - n[1] * LETTER_HEIGHT
        ];
    }

    /** The stroke's control points in panel-local cm, interpolated into a smooth path. */
    strokeToLocal(stroke: Stroke): Pt[] {
        const mapped: Pt[] = [];
        for (let i = 0; i < stroke.points.length; i++) {
            mapped.push(this.toLocal(stroke.points[i]));
        }
        return smoothPath(mapped);
    }

    /** Paper and the four ruled lines. Built once — never rebuilt by erase. */
    private drawPaperAndRules(): void {
        this.paper.clear();
        this.paper.addRoundedRect(this.left, L.slateBottom, this.right, L.slateTop, 0.6, Z.slate, C.slate);
        this.paper.commit();

        const inset = 0.9;
        const x0 = this.left + inset;
        const x1 = this.right - inset;

        this.rules.clear();
        this.rules.addRect(x0, L.ascenderY - L.ruleWidth * 0.5, x1, L.ascenderY + L.ruleWidth * 0.5, Z.rules, C.ruleStrong);
        this.rules.addDashedPolyline([[x0, L.midlineY], [x1, L.midlineY]], L.ruleWidth, 0.55, 0.45, Z.rules, C.ruleMid);
        this.rules.addRect(x0, L.baselineY - L.ruleWidth * 0.5, x1, L.baselineY + L.ruleWidth * 0.5, Z.rules, C.ruleStrong);
        this.rules.addRect(x0, L.descenderY - L.ruleWidth * 0.5, x1, L.descenderY + L.ruleWidth * 0.5, Z.rules, C.ruleFaint);
        this.rules.commit();
    }

    /** Replace the ink layer with these polylines (already in panel-local cm). */
    setInk(strokes: Pt[][], colour: RGBA): void {
        this.ink.clear();
        for (let i = 0; i < strokes.length; i++) {
            if (strokes[i].length > 0) {
                this.ink.addPolyline(strokes[i], L.strokeWidth, Z.ink, colour);
            }
        }
        this.ink.commit();
    }

    clearInk(): void {
        this.ink.clear();
        this.ink.commit();
    }

    clearGuide(): void {
        this.guide.clear();
        this.guide.commit();
    }

    clearGhost(): void {
        this.ghost.clear();
        this.ghost.commit();
    }

    clearOverlay(): void {
        this.overlay.clear();
        this.overlay.commit();
    }

    /** Dashed outline of the target letter, drawn over the user's ink after scoring. */
    setDashedGhost(targets: Pt[][]): void {
        this.ghost.clear();
        for (let i = 0; i < targets.length; i++) {
            this.ghost.addDashedPolyline(targets[i], L.dashWidth, 0.5, 0.38, Z.ghost, C.ghostDash);
        }
        this.ghost.commit();
    }
}
