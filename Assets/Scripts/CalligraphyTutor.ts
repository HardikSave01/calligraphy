import {InteractionManager} from "SpectaclesInteractionKit.lspkg/Core/InteractionManager/InteractionManager";
import {HandInputData} from "SpectaclesInteractionKit.lspkg/Providers/HandInputData/HandInputData";
import TrackedHand from "SpectaclesInteractionKit.lspkg/Providers/HandInputData/TrackedHand";
import {Interactor, InteractorInputType} from "SpectaclesInteractionKit.lspkg/Core/Interactor/Interactor";
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider";
import {RectangleButton} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RectangleButton";

import {Pt, dist, pointAt, polylineLength, sliceTo} from "./Geometry";
import {LETTERS, Letter} from "./LetterData";
import {MeshPainter, RGBA} from "./MeshPainter";
import {ScoreResult, filterStrokes, scoreAttempt} from "./Scoring";
import {Slate} from "./Slate";
import {C, L, LEFT_SLATE_X, LETTER_HEIGHT, RIGHT_SLATE_X, Z, rgba} from "./Theme";

const PANEL_DISTANCE = 50.0;   // cm ahead of the wearer
const PANEL_DROP = -10.0;      // cm below eye level: chest height, glanced down at
const LETTER_LABEL_X = -L.panelWidth * 0.5 + 2.6;
const STATE_LABEL_X = L.panelWidth * 0.5 - 6.5;
const DEMO_SPEED = 9.0;        // cm per second — natural writing pace
const DEMO_PAUSE = 0.38;       // beat between strokes
const MAX_WRITE_DEPTH = 30.0;  // cm; a pinch further than this from the panel is not writing
const CHAR_WIDTH = 0.0111;     // cm of rendered width per character per unit of Text.size
const BUTTON_LOCKOUT = 0.35;   // s after ink before a button press counts again
const MIN_POINT_SPACING = 0.28; // cm between captured ink points

type Mode = "demo" | "practice" | "feedback";

interface Btn {
    root: SceneObject;
    label: Text;
    button: RectangleButton;
    enabled: boolean;
}

@component
export class CalligraphyTutor extends BaseScriptComponent {
    @input material: Material;
    /**
     * Preview-only convenience: the Lens Studio Preview panel cannot simulate a hand pinch,
     * so the Practice box would be untestable on desktop. When on, a mouse/touch drag draws
     * through exactly the same stroke functions as a pinch. Harmless on device — Specs has
     * no screen touch — but switch it off if you want hand input to be the only path.
     */
    @input enableMouseInput: boolean = true;
    @input buttonPrefab: ObjectPrefab;

    private panel: SceneObject;
    private learn: Slate;
    private practice: Slate;

    private pills: MeshPainter;
    private chrome: MeshPainter;
    private learnDot: MeshPainter;

    private letterLabel: Text;
    private stateLabel: Text;
    private pillNum: Text[] = [];
    private pillHint: Text[] = [];
    private learnBadge: Text[] = [];
    private practiceBadge: Text;
    private verdictLabel: Text;
    private diagLabel: Text;

    private bReplay: Btn;
    private bPrev: Btn;
    private bNext: Btn;
    private bUndo: Btn;
    private bErase: Btn;
    private bDone: Btn;
    private bTryAgain: Btn;
    private bNextLetter: Btn;

    private letterIndex: number = 0;
    private guidance: number[] = [1, 1, 1];
    private mode: Mode = "demo";

    private demoStroke: number = 0;
    private demoT: number = 0;
    private demoPause: number = 0;

    private userStrokes: Pt[][] = [];
    private activeStroke: Pt[] | null = null;
    private erasedBuffer: Pt[][] | null = null;
    private wasTriggering: boolean = false;
    private strokeSource: string = "none";

    private guideKey: string = "";
    private lastInkTime: number = -10;
    private result: ScoreResult | null = null;
    private elapsed: number = 0;

    private interactionManager: InteractionManager;
    private leftHand: TrackedHand;
    private rightHand: TrackedHand;
    private camera: WorldCameraFinderProvider;

    // ---------------------------------------------------------------- lifecycle

    onAwake(): void {
        this.interactionManager = InteractionManager.getInstance();
        this.camera = WorldCameraFinderProvider.getInstance();

        const hands = HandInputData.getInstance();
        this.leftHand = hands.getHand("left");
        this.rightHand = hands.getHand("right");

        this.buildPanel();

        this.createEvent("OnStartEvent").bind(() => {
            this.placePanel();
            this.enterLetter(0);
        });

        // Mouse/touch drawing path. Runs alongside the pinch path; whichever starts a
        // stroke first owns the pen until it lifts, so the two can never interleave.
        this.createEvent("TouchStartEvent").bind((e: TouchStartEvent) => {
            this.onScreenDown(e.getTouchPosition());
        });
        this.createEvent("TouchMoveEvent").bind((e: TouchMoveEvent) => {
            this.onScreenMove(e.getTouchPosition());
        });
        this.createEvent("TouchEndEvent").bind(() => {
            this.onScreenUp();
        });

        this.createEvent("UpdateEvent").bind(() => {
            this.elapsed += getDeltaTime();
            this.tickDemo(getDeltaTime());
            this.tickDrawing();
            this.tickGuide();
        });
    }

    /** World-space panel, 50 cm ahead at chest height, tilted back so its face aims at the eyes. */
    private placePanel(): void {
        const camTransform = this.camera.getComponent().getTransform();
        const camPos = camTransform.getWorldPosition();
        const viewDir = camTransform.back; // Transform.back is the direction the wearer faces
        const flat = new vec3(viewDir.x, 0, viewDir.z);
        const ahead = flat.length < 1e-4 ? new vec3(0, 0, -1) : flat.normalize();

        const target = camPos.add(ahead.uniformScale(PANEL_DISTANCE)).add(new vec3(0, PANEL_DROP, 0));

        // quat.lookAt aligns the object's local +Z with the vector it is given, and the
        // panel's artwork faces local +Z — so aim +Z back along the line to the wearer.
        const toUser = camPos.sub(target).normalize();

        const t = this.panel.getTransform();
        t.setWorldPosition(target);
        t.setWorldRotation(quat.lookAt(toUser, vec3.up()));
    }

    // ---------------------------------------------------------------- construction

    private buildPanel(): void {
        this.panel = global.scene.createSceneObject("CalligraphyPanel");
        this.panel.setParent(this.sceneObject);

        const backdrop = new MeshPainter(this.panel, "Backdrop", this.material, 5);
        backdrop.addRoundedRect(
            -L.panelWidth * 0.5, L.panelBottom, L.panelWidth * 0.5, L.panelTop,
            1.2, Z.backdrop, C.backdrop
        );
        backdrop.commit();

        this.learn = new Slate(this.panel, "Learn", LEFT_SLATE_X, this.material);
        this.practice = new Slate(this.panel, "Practice", RIGHT_SLATE_X, this.material);

        this.pills = new MeshPainter(this.panel, "Pills", this.material, 16);
        this.chrome = new MeshPainter(this.panel, "HeaderPlates", this.material, 16);
        this.learnDot = new MeshPainter(this.panel, "LearnDot", this.material, 18);

        this.letterLabel = this.makeText("LetterLabel", LETTER_LABEL_X, L.headerY, 137, C.headerText);
        this.stateLabel = this.makeText("StateLabel", STATE_LABEL_X, L.headerY, 43, C.stateText);

        for (let i = 0; i < 3; i++) {
            this.pillNum.push(this.makeText("PillNum" + i, 0, 0, 53, C.pillTextOn));
            this.pillHint.push(this.makeText("PillHint" + i, 0, 0, 33, C.pillTextOff));
            this.learnBadge.push(this.makeText("LearnBadge" + i, 0, 0, 46, C.badgeText));
        }
        this.practiceBadge = this.makeText("PracticeBadge", 0, 0, 46, C.badgeText);

        this.verdictLabel = this.makeText("Verdict", RIGHT_SLATE_X - 5.6, (L.verdictTop + L.verdictBottom) * 0.5, 38, C.white);
        this.diagLabel = this.makeText("Diagnostic", RIGHT_SLATE_X + 2.6, (L.verdictTop + L.verdictBottom) * 0.5, 28, C.white);

        this.buildButtons();
    }

    /**
     * Opaque backing plates behind the letter label and the attempt/state line, in the
     * same muted style as an inactive step pill. Without these the two header labels sit
     * directly on the world and are only legible when the room behind them is dark. Each
     * plate is centred on its label's existing anchor, so nothing is moved or reflowed.
     */
    private drawHeaderPlates(): void {
        const pad = 0.9;
        this.chrome.clear();

        const letterW = Math.max(2.6, this.letterLabel.text.length * this.letterLabel.size * CHAR_WIDTH + pad * 2);
        const letterH = 3.0;
        this.chrome.addRoundedRect(
            LETTER_LABEL_X - letterW * 0.5, L.headerY - letterH * 0.5,
            LETTER_LABEL_X + letterW * 0.5, L.headerY + letterH * 0.5,
            0.7, Z.guide, C.plate
        );

        const stateW = Math.max(3.0, this.stateLabel.text.length * this.stateLabel.size * CHAR_WIDTH + pad * 2);
        const stateH = 2.2;
        this.chrome.addRoundedRect(
            STATE_LABEL_X - stateW * 0.5, L.headerY - stateH * 0.5,
            STATE_LABEL_X + stateW * 0.5, L.headerY + stateH * 0.5,
            0.7, Z.guide, C.plate
        );

        this.chrome.commit();
    }

    private makeText(name: string, x: number, y: number, size: number, colour: RGBA): Text {
        const obj = global.scene.createSceneObject(name);
        obj.setParent(this.panel);
        obj.getTransform().setLocalPosition(new vec3(x, y, Z.text));
        const t = obj.createComponent("Component.Text") as Text;
        t.text = "";
        t.size = size;
        t.textFill.color = rgba(colour);
        t.horizontalAlignment = HorizontalAlignment.Center;
        t.verticalAlignment = VerticalAlignment.Center;
        t.depthTest = false;
        t.renderOrder = 25;
        return t;
    }

    private buildButtons(): void {
        const step = L.buttonWidth + L.buttonGap;
        this.bReplay = this.makeButton("replay", LEFT_SLATE_X - step, L.buttonY, L.buttonWidth);
        this.bPrev = this.makeButton("prev", LEFT_SLATE_X, L.buttonY, L.buttonWidth);
        this.bNext = this.makeButton("next", LEFT_SLATE_X + step, L.buttonY, L.buttonWidth);

        this.bUndo = this.makeButton("undo", RIGHT_SLATE_X - step, L.buttonY, L.buttonWidth);
        this.bErase = this.makeButton("erase", RIGHT_SLATE_X, L.buttonY, L.buttonWidth);
        this.bDone = this.makeButton("done", RIGHT_SLATE_X + step, L.buttonY, L.buttonWidth);

        const wide = 8.2;
        const half = (wide + L.buttonGap) * 0.5;
        this.bTryAgain = this.makeButton("try again", RIGHT_SLATE_X - half, L.buttonY, wide);
        this.bNextLetter = this.makeButton("next letter", RIGHT_SLATE_X + half, L.buttonY, wide);

        this.createEvent("OnStartEvent").bind(() => {
            this.bind(this.bReplay, () => this.onReplay());
            this.bind(this.bPrev, () => this.onStep(-1));
            this.bind(this.bNext, () => this.onStep(1));
            this.bind(this.bUndo, () => this.onUndo());
            this.bind(this.bErase, () => this.onErase());
            this.bind(this.bDone, () => this.onDone());
            this.bind(this.bTryAgain, () => this.onTryAgain());
            this.bind(this.bNextLetter, () => this.onStep(1));
        });
    }

    private makeButton(caption: string, x: number, y: number, width: number): Btn {
        const root = this.buttonPrefab.instantiate(this.panel);
        root.name = "Btn_" + caption;
        root.getTransform().setLocalPosition(new vec3(x, y, Z.overlay));

        const button = root.getComponent(RectangleButton.getTypeName()) as RectangleButton;
        if (button) {
            button.size = new vec3(width, L.buttonHeight, 0.6);
        }

        let label: Text = null;
        for (let i = 0; i < root.getChildrenCount(); i++) {
            const found = root.getChild(i).getComponent("Component.Text") as Text;
            if (found) {
                label = found;
                break;
            }
        }
        if (label) {
            label.text = caption;
            label.size = 50;
        }

        return {root: root, label: label, button: button, enabled: true};
    }

    private bind(btn: Btn, action: () => void): void {
        if (!btn.button) {
            return;
        }
        btn.button.onTriggerUp.add(() => {
            // The writing hand's targeting ray sweeps across the button row on its way
            // down the slate, so swallow presses that land while (or just after) the user
            // is actually drawing.
            if (this.activeStroke !== null || getTime() - this.lastInkTime < BUTTON_LOCKOUT) {
                return;
            }
            if (btn.enabled && btn.root.enabled) {
                action();
            }
        });
    }

    private setBtnEnabled(btn: Btn, on: boolean): void {
        btn.enabled = on;
        if (btn.label) {
            btn.label.textFill.color = rgba(on ? C.white : C.dimText);
        }
    }

    // ---------------------------------------------------------------- letters

    private get letter(): Letter {
        return LETTERS[this.letterIndex];
    }

    private get level(): number {
        return this.guidance[this.letterIndex];
    }

    /** Panel-local target polylines for a slate, derived from the stroke data. */
    private targetsFor(slate: Slate): Pt[][] {
        const out: Pt[][] = [];
        const strokes = this.letter.strokes;
        for (let i = 0; i < strokes.length; i++) {
            out.push(slate.strokeToLocal(strokes[i]));
        }
        return out;
    }

    private enterLetter(index: number): void {
        this.letterIndex = ((index % LETTERS.length) + LETTERS.length) % LETTERS.length;
        this.clearSlate();
        this.letterLabel.text = this.letter.char;
        this.drawHeaderPlates();
        this.drawPills();
        this.drawLearnBadges();
        this.startDemo();
        this.refreshPractice();
        this.refreshButtons();
    }

    private startDemo(): void {
        this.mode = "demo";
        this.demoStroke = 0;
        this.demoT = 0;
        this.demoPause = 0;
        this.learn.clearInk();
        this.stateLabel.text = "watch";
        this.drawHeaderPlates();
        this.highlightPill(0);
        this.refreshButtons();
    }

    private tickDemo(dt: number): void {
        if (this.mode !== "demo") {
            return;
        }
        const targets = this.targetsFor(this.learn);

        if (this.demoPause > 0) {
            this.demoPause -= dt;
            if (this.demoPause <= 0) {
                this.demoStroke++;
                this.demoT = 0;
                if (this.demoStroke >= targets.length) {
                    this.finishDemo(targets);
                    return;
                }
                this.highlightPill(this.demoStroke);
            }
            return;
        }

        const current = targets[this.demoStroke];
        const len = Math.max(0.001, polylineLength(current));
        this.demoT += (DEMO_SPEED * dt) / len;
        if (this.demoT >= 1) {
            this.demoT = 1;
            this.demoPause = DEMO_PAUSE;
        }

        const drawn: Pt[][] = [];
        for (let i = 0; i < this.demoStroke; i++) {
            drawn.push(targets[i]);
        }
        drawn.push(sliceTo(current, this.demoT));
        this.learn.setInk(drawn, C.guideInk);

        const head = pointAt(current, this.demoT);
        this.learnDot.clear();
        this.learnDot.addDisc(head[0], head[1], 0.45, Z.overlay, C.userInk, 14);
        this.learnDot.commit();
    }

    private finishDemo(targets: Pt[][]): void {
        this.learn.setInk(targets, C.guideInk);
        this.learnDot.clear();
        this.learnDot.commit();
        this.mode = "practice";
        this.highlightPill(this.strokeCursor());
        this.updateStateLabel();
        this.refreshButtons();
    }

    // ---------------------------------------------------------------- pills & badges

    private drawPills(): void {
        const strokes = this.letter.strokes;
        const n = strokes.length;
        const total = n * L.pillWidth + (n - 1) * L.pillGap;
        const startX = -total * 0.5;

        this.pills.clear();
        for (let i = 0; i < 3; i++) {
            const active = i < n;
            this.pillNum[i].enabled = active;
            this.pillHint[i].enabled = active;
            if (!active) {
                continue;
            }
            const x0 = startX + i * (L.pillWidth + L.pillGap);
            const cx = x0 + L.pillWidth * 0.5;
            this.pillNum[i].getTransform().setLocalPosition(
                new vec3(x0 + 1.35, L.pillY, Z.text)
            );
            this.pillNum[i].text = String(i + 1);
            this.pillHint[i].getTransform().setLocalPosition(
                new vec3(cx + 1.1, L.pillY, Z.text)
            );
            this.pillHint[i].text = strokes[i].hint.replace(", ", "\n");
        }
        this.pills.commit();
        this.highlightPill(0);
    }

    private highlightPill(activeIndex: number): void {
        const strokes = this.letter.strokes;
        const n = strokes.length;
        const total = n * L.pillWidth + (n - 1) * L.pillGap;
        const startX = -total * 0.5;

        this.pills.clear();
        for (let i = 0; i < n; i++) {
            const x0 = startX + i * (L.pillWidth + L.pillGap);
            const x1 = x0 + L.pillWidth;
            const on = i === activeIndex;
            this.pills.addRoundedRect(
                x0, L.pillY - L.pillHeight * 0.5, x1, L.pillY + L.pillHeight * 0.5,
                L.pillHeight * 0.5, Z.guide, on ? C.pillOn : C.pillOff
            );
            this.pills.addDisc(x0 + 1.35, L.pillY, 0.82, Z.ink, on ? C.white : C.pillTextOff);
            this.pillNum[i].textFill.color = rgba(on ? C.pillOn : C.pillOff);
            this.pillHint[i].textFill.color = rgba(on ? C.pillTextOn : C.pillTextOff);
        }
        this.pills.commit();
    }

    private drawLearnBadges(): void {
        const targets = this.targetsFor(this.learn);
        const placed: Pt[] = [];
        this.learn.overlay.clear();
        for (let i = 0; i < 3; i++) {
            const on = i < targets.length;
            this.learnBadge[i].enabled = on;
            if (!on) {
                continue;
            }
            const p = targets[i][0];
            let bx = p[0] - 0.95;
            let by = p[1] + 0.95;
            for (let j = 0; j < placed.length; j++) {
                if (dist([bx, by], placed[j]) < 1.5) {
                    bx = placed[j][0] + 1.6;
                    by = placed[j][1];
                }
            }
            placed.push([bx, by]);
            this.learn.overlay.addDisc(bx, by, 0.7, Z.overlay, C.badge, 16);
            this.learnBadge[i].getTransform().setLocalPosition(new vec3(bx, by, Z.text));
            this.learnBadge[i].text = String(i + 1);
        }
        this.learn.overlay.commit();
    }

    // ---------------------------------------------------------------- practice rendering

    /** How many strokes the user has completed — also the index of the stroke they owe next. */
    private strokeCursor(): number {
        const done = filterStrokes(this.userStrokes, LETTER_HEIGHT).length;
        return Math.min(done, this.letter.strokes.length - 1);
    }

    private refreshPractice(): void {
        this.practice.setInk(this.userStrokes, C.userInk);
        this.refreshButtons();
        this.updateStateLabel();
    }

    /** Guidance ladder: level 1 ghost + first badge, level 2 pulsing start dot, level 3 nothing. */
    private tickGuide(): void {
        if (this.mode === "feedback") {
            return;
        }
        const level = this.level;
        const targets = this.targetsFor(this.practice);

        if (level === 1) {
            const key = "1|" + this.letterIndex;
            if (this.guideKey !== key) {
                this.guideKey = key;
                this.practice.guide.clear();
                for (let i = 0; i < targets.length; i++) {
                    this.practice.guide.addPolyline(targets[i], L.ghostWidth, Z.guide, C.ghostSoft);
                }
                this.practice.guide.commit();
                const p = targets[0][0];
                this.practice.overlay.clear();
                this.practice.overlay.addDisc(p[0] - 0.95, p[1] + 0.95, 0.7, Z.overlay, C.badge, 16);
                this.practice.overlay.commit();
                this.practiceBadge.enabled = true;
                this.practiceBadge.getTransform().setLocalPosition(new vec3(p[0] - 0.95, p[1] + 0.95, Z.text));
                this.practiceBadge.text = "1";
            }
            return;
        }

        this.practiceBadge.enabled = false;
        if (!this.practice.overlay.isEmpty) {
            this.practice.clearOverlay();
        }

        if (level === 2) {
            this.guideKey = "2|" + this.letterIndex;
            const p = targets[this.strokeCursor()][0];
            const pulse = 0.42 * (0.78 + 0.22 * Math.sin(this.elapsed * 5.0));
            this.practice.guide.clear();
            this.practice.guide.addDisc(p[0], p[1], pulse, Z.guide, C.guideInk, 16);
            this.practice.guide.commit();
            return;
        }

        this.guideKey = "3|" + this.letterIndex;
        if (!this.practice.guide.isEmpty) {
            this.practice.clearGuide();
        }
    }

    private updateStateLabel(): void {
        this.writeStateLabel();
        this.drawHeaderPlates();
    }

    private writeStateLabel(): void {
        if (this.mode === "demo") {
            this.stateLabel.text = "watch";
            return;
        }
        if (this.mode === "feedback" && this.result) {
            this.stateLabel.text = this.result.incomplete
                ? "incomplete"
                : (this.result.pass ? "pass" : "not yet");
            return;
        }
        const done = filterStrokes(this.userStrokes, LETTER_HEIGHT).length;
        this.stateLabel.text = "your turn  " + done + "/" + this.letter.strokes.length
            + "   guide " + this.level;
    }

    // ---------------------------------------------------------------- ink input

    private tickDrawing(): void {
        if (this.mode === "feedback") {
            this.endStroke();
            this.wasTriggering = false;
            this.strokeSource = "none";
            return;
        }

        // A mouse drag in progress owns the pen; do not let the hand path interrupt it.
        if (this.strokeSource === "mouse") {
            return;
        }

        const pinch = this.pinchPoint();
        const triggering = pinch !== null;

        if (triggering) {
            const local = this.projectPinch(pinch);
            if (local !== null && this.insidePractice(local)) {
                if (!this.wasTriggering) {
                    this.beginStroke(local);
                } else {
                    this.extendStroke(local);
                }
                this.wasTriggering = true;
                this.strokeSource = "hand";
                return;
            }
            // Pinching, but off the slate: treat as a lifted pen.
            if (this.wasTriggering) {
                this.endStroke();
                this.wasTriggering = false;
                this.strokeSource = "none";
            }
            return;
        }

        if (this.wasTriggering) {
            this.endStroke();
            this.wasTriggering = false;
            this.strokeSource = "none";
        }
    }

    // ---------------------------------------------------------------- mouse / touch input

    private onScreenDown(screenPos: vec2): void {
        if (!this.enableMouseInput || this.mode === "feedback") {
            return;
        }
        // The hand is mid-stroke: ignore the screen entirely.
        if (this.strokeSource === "hand") {
            return;
        }
        const local = this.screenToPanel(screenPos);
        // Starting anywhere but the slate — on a button, say — is not a drawing gesture,
        // so the press falls through to whatever it landed on.
        if (local === null || !this.insidePractice(local)) {
            return;
        }
        this.strokeSource = "mouse";
        this.beginStroke(local);
    }

    private onScreenMove(screenPos: vec2): void {
        if (this.strokeSource !== "mouse") {
            return;
        }
        const local = this.screenToPanel(screenPos);
        if (local === null) {
            return;
        }
        if (!this.insidePractice(local)) {
            // Dragged off the slate: same lifted-pen rule the pinch path uses.
            this.endStroke();
            this.strokeSource = "none";
            return;
        }
        this.extendStroke(local);
    }

    private onScreenUp(): void {
        if (this.strokeSource !== "mouse") {
            return;
        }
        this.endStroke();
        this.strokeSource = "none";
    }

    /**
     * Raycast a normalised screen position from the main camera onto the panel plane and
     * convert the hit to panel-local cm. A screen ray is the right mapping for a cursor,
     * where the perpendicular drop used for a real pinch would have no meaning.
     */
    private screenToPanel(screenPos: vec2): Pt | null {
        const cam = this.camera.getComponent();
        if (!cam) {
            return null;
        }
        const origin = cam.getTransform().getWorldPosition();
        const through = cam.screenSpaceToWorldSpace(screenPos, 100);
        const delta = through.sub(origin);
        if (delta.length < 1e-5) {
            return null;
        }
        const ray = delta.normalize();

        const t = this.panel.getTransform();
        const planePos = t.getWorldPosition();
        const normal = t.back;
        const denom = ray.dot(normal);
        if (Math.abs(denom) < 1e-5) {
            return null;
        }
        const travel = planePos.sub(origin).dot(normal) / denom;
        if (travel <= 0) {
            return null;
        }
        return this.worldToPanel(origin.add(ray.uniformScale(travel)));
    }

    /**
     * Where the user is pinching, in world space. The hand is the real signal on Specs —
     * SIK's Interactor only reports a trigger while it is targeting an Interactable, which
     * free-space writing never is. The Interactor is kept as a fallback so the mouse still
     * works in the editor.
     */
    private pinchPoint(): vec3 | null {
        const hands: TrackedHand[] = [this.rightHand, this.leftHand];
        for (let i = 0; i < hands.length; i++) {
            const hand = hands[i];
            if (hand && hand.isTracked() && hand.isPinching()) {
                const index = hand.indexTip.position;
                const thumb = hand.thumbTip.position;
                if (index && thumb) {
                    return index.add(thumb).uniformScale(0.5);
                }
            }
        }

        const all = this.interactionManager.getInteractorsByType(InteractorInputType.All);
        for (let i = 0; i < all.length; i++) {
            const it = all[i];
            if (it.enabled && it.isActive() && it.isTriggering && it.startPoint !== null) {
                return it.startPoint;
            }
        }
        return null;
    }

    /**
     * Drop the pinch position straight onto the panel plane and convert to panel-local
     * cm. Perpendicular projection (rather than ray casting) is what makes this feel like
     * writing on a slate held in front of you; a depth limit stops a pinch made well away
     * from the panel from leaving a mark.
     */
    private projectPinch(origin: vec3): Pt | null {
        const t = this.panel.getTransform();
        const planePos = t.getWorldPosition();
        const normal = t.back;

        const offset = origin.sub(planePos);
        const depth = offset.dot(normal);
        if (Math.abs(depth) > MAX_WRITE_DEPTH) {
            return null;
        }

        const hit = origin.sub(normal.uniformScale(depth));
        return this.worldToPanel(hit);
    }

    private worldToPanel(world: vec3): Pt {
        const local = this.panel.getTransform().getInvertedWorldTransform().multiplyPoint(world);
        return [local.x, local.y];
    }

    private insidePractice(p: Pt): boolean {
        return p[0] >= this.practice.left && p[0] <= this.practice.right
            && p[1] >= L.slateBottom && p[1] <= L.slateTop;
    }

    private beginStroke(p: Pt): void {
        this.lastInkTime = getTime();
        this.activeStroke = [p];
        this.userStrokes.push(this.activeStroke);
        this.erasedBuffer = null;
        this.practice.setInk(this.userStrokes, C.userInk);
    }

    private extendStroke(p: Pt): void {
        if (this.activeStroke === null) {
            this.beginStroke(p);
            return;
        }
        const last = this.activeStroke[this.activeStroke.length - 1];
        if (dist(last, p) < MIN_POINT_SPACING) {
            return;
        }
        this.activeStroke.push(p);
        this.lastInkTime = getTime();
        this.practice.setInk(this.userStrokes, C.userInk);
    }

    private endStroke(): void {
        if (this.activeStroke === null) {
            return;
        }
        const finished = this.activeStroke;
        this.activeStroke = null;
        this.lastInkTime = getTime();

        if (finished.length < 2 || polylineLength(finished) < 0.10 * LETTER_HEIGHT) {
            const at = this.userStrokes.indexOf(finished);
            if (at >= 0) {
                this.userStrokes.splice(at, 1);
            }
        }
        this.practice.setInk(this.userStrokes, C.userInk);
        this.refreshButtons();
        this.updateStateLabel();
        this.highlightPill(this.strokeCursor());

        // Auto-score once the expected number of strokes is on the slate.
        if (filterStrokes(this.userStrokes, LETTER_HEIGHT).length >= this.letter.strokes.length) {
            this.score();
        }
    }

    // ---------------------------------------------------------------- scoring & feedback

    private score(): void {
        // The user can write while the demo is still playing; settle the Learn box to the
        // finished letter first so it is not frozen mid-stroke behind the feedback.
        if (this.mode === "demo") {
            this.finishDemo(this.targetsFor(this.learn));
        }

        const targets = this.targetsFor(this.practice);
        const result = scoreAttempt(
            this.userStrokes, this.letter, targets, LETTER_HEIGHT
        );
        this.result = result;
        this.mode = "feedback";

        this.practice.clearGuide();
        this.guideKey = "";
        this.practice.setDashedGhost(targets);
        this.practiceBadge.enabled = false;
        this.drawVerdictBar(result);

        if (!result.incomplete) {
            const next = result.pass ? this.level + 1 : this.level - 1;
            this.guidance[this.letterIndex] = Math.max(1, Math.min(3, next));
        }

        this.updateStateLabel();
        this.refreshButtons();
    }

    private drawVerdictBar(result: ScoreResult): void {
        const inset = 0.9;
        const x0 = this.practice.left + inset;
        const x1 = this.practice.right - inset;
        const colour = result.incomplete ? C.fail : (result.pass ? C.pass : C.fail);

        this.practice.overlay.clear();
        this.practice.overlay.addRoundedRect(
            x0, L.verdictBottom, x1, L.verdictTop, 0.45, Z.overlay, colour
        );
        this.practice.overlay.commit();

        if (result.incomplete) {
            this.verdictLabel.text = "";
            this.diagLabel.text = "that one looks incomplete";
            this.diagLabel.getTransform().setLocalPosition(
                new vec3(this.practice.centreX, (L.verdictTop + L.verdictBottom) * 0.5, Z.text)
            );
        } else {
            this.verdictLabel.text = result.percent + "%  " + (result.pass ? "pass" : "not yet");
            this.diagLabel.text = result.diagnostic;
            this.verdictLabel.getTransform().setLocalPosition(
                new vec3(this.practice.centreX - 5.5, (L.verdictTop + L.verdictBottom) * 0.5, Z.text)
            );
            this.diagLabel.getTransform().setLocalPosition(
                new vec3(this.practice.centreX + 2.9, (L.verdictTop + L.verdictBottom) * 0.5, Z.text)
            );
        }
        this.verdictLabel.enabled = true;
        this.diagLabel.enabled = true;
    }

    private clearFeedback(): void {
        this.result = null;
        this.verdictLabel.text = "";
        this.diagLabel.text = "";
        this.practice.clearGhost();
        this.practice.clearOverlay();
    }

    /** Clears the user's ink only — ruled lines, ghost guide and the example are untouched. */
    private clearSlate(): void {
        this.userStrokes = [];
        this.activeStroke = null;
        this.erasedBuffer = null;
        this.practice.clearInk();
        this.practice.clearGuide();
        this.guideKey = "";
        this.clearFeedback();
        if (this.mode === "feedback") {
            this.mode = "practice";
        }
    }

    // ---------------------------------------------------------------- buttons

    private refreshButtons(): void {
        const feedback = this.mode === "feedback";
        const hasInk = this.userStrokes.length > 0;

        this.bUndo.root.enabled = !feedback;
        this.bErase.root.enabled = !feedback;
        this.bDone.root.enabled = !feedback;
        this.bTryAgain.root.enabled = feedback;
        this.bNextLetter.root.enabled = feedback;

        this.setBtnEnabled(this.bReplay, this.mode !== "demo");
        this.setBtnEnabled(this.bPrev, true);
        this.setBtnEnabled(this.bNext, true);
        this.setBtnEnabled(this.bUndo, hasInk || this.erasedBuffer !== null);
        this.setBtnEnabled(this.bErase, hasInk);
        this.setBtnEnabled(this.bDone, hasInk);
        this.setBtnEnabled(this.bTryAgain, true);
        this.setBtnEnabled(this.bNextLetter, true);
    }

    private onReplay(): void {
        if (this.mode === "demo") {
            return;
        }
        // Replay never disturbs the user's ink.
        if (this.mode === "feedback") {
            this.clearFeedback();
        }
        this.startDemo();
    }

    private onStep(delta: number): void {
        this.enterLetter(this.letterIndex + delta);
    }

    private onUndo(): void {
        if (this.erasedBuffer !== null) {
            this.userStrokes = this.erasedBuffer;
            this.erasedBuffer = null;
        } else if (this.userStrokes.length > 0) {
            this.userStrokes.pop();
        } else {
            return;
        }
        this.activeStroke = null;
        this.clearFeedback();
        this.refreshPractice();
        this.highlightPill(this.strokeCursor());
    }

    private onErase(): void {
        if (this.userStrokes.length === 0) {
            return;
        }
        this.erasedBuffer = this.userStrokes;
        this.userStrokes = [];
        this.activeStroke = null;
        this.clearFeedback();
        this.refreshPractice();
        this.highlightPill(0);
    }

    private onDone(): void {
        if (this.userStrokes.length === 0) {
            return;
        }
        this.score();
    }

    private onTryAgain(): void {
        this.mode = "practice";
        this.clearSlate();
        this.refreshPractice();
        this.highlightPill(0);
    }
}
