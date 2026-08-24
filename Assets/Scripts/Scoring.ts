import {
    Pt, dist, direction, distToPolyline, nearestOnPolyline, polylineLength, resample
} from "./Geometry";
import {Letter, strokeName} from "./LetterData";

/**
 * Scores an attempt against the letter's stroke data. Everything here works in
 * slate-local centimetres, so `letterHeight` is the ascender-to-baseline distance.
 * Deliberately generous: a false failure is worse than a false pass.
 */

const SAMPLES_PER_STROKE = 20;
const INSIDE_FRACTION = 0.13;      // hit radius, as a fraction of letter height
const START_RADIUS_FRACTION = 0.35; // generous "did you start in the right place"
const MIN_STROKE_FRACTION = 0.10;  // shorter than this is a stray dab, not a stroke
const INCOMPLETE_FRACTION = 0.55;  // total ink far below target => incomplete
const PASS_PERCENT = 70;

export interface ScoreResult {
    incomplete: boolean;
    percent: number;
    pass: boolean;
    diagnostic: string;
    usedStrokes: Pt[][];
}

interface StrokeReport {
    index: number;
    insideRatio: number;
    startOffset: number;
    dirDot: number;
    meanDx: number;
    meanDy: number;
    targetDir: Pt;
}

/** Drop stray dabs so an accidental tap does not count as a stroke. */
export function filterStrokes(strokes: Pt[][], letterHeight: number): Pt[][] {
    const min = MIN_STROKE_FRACTION * letterHeight;
    const out: Pt[][] = [];
    for (let i = 0; i < strokes.length; i++) {
        if (strokes[i].length >= 2 && polylineLength(strokes[i]) >= min) {
            out.push(strokes[i]);
        }
    }
    return out;
}

export function scoreAttempt(
    rawStrokes: Pt[][],
    letter: Letter,
    targets: Pt[][],
    letterHeight: number
): ScoreResult {
    const user = filterStrokes(rawStrokes, letterHeight);

    let targetInk = 0;
    for (let i = 0; i < targets.length; i++) {
        targetInk += polylineLength(targets[i]);
    }
    let userInk = 0;
    for (let i = 0; i < user.length; i++) {
        userInk += polylineLength(user[i]);
    }

    if (user.length === 0 || userInk < INCOMPLETE_FRACTION * targetInk) {
        return {
            incomplete: true,
            percent: 0,
            pass: false,
            diagnostic: "that one looks incomplete",
            usedStrokes: user
        };
    }

    const tolerance = INSIDE_FRACTION * letterHeight;
    const startRadius = START_RADIUS_FRACTION * letterHeight;
    const pairs = Math.min(user.length, targets.length);

    const reports: StrokeReport[] = [];
    let insideTotal = 0;
    let pointsTotal = 0;

    for (let i = 0; i < pairs; i++) {
        const sampled = resample(user[i], SAMPLES_PER_STROKE);
        const target = targets[i];
        let inside = 0;
        let sumDx = 0;
        let sumDy = 0;

        for (let s = 0; s < sampled.length; s++) {
            const p = sampled[s];
            if (distToPolyline(p, target) < tolerance) {
                inside++;
            }
            const near = nearestOnPolyline(p, target);
            sumDx += p[0] - near[0];
            sumDy += p[1] - near[1];
        }

        insideTotal += inside;
        pointsTotal += sampled.length;

        const userDir = direction(user[i]);
        const targetDir = direction(target);
        reports.push({
            index: i,
            insideRatio: sampled.length === 0 ? 0 : inside / sampled.length,
            startOffset: dist(user[i][0], target[0]),
            dirDot: userDir[0] * targetDir[0] + userDir[1] * targetDir[1],
            meanDx: sumDx / Math.max(1, sampled.length),
            meanDy: sumDy / Math.max(1, sampled.length),
            targetDir: targetDir
        });
    }

    // Strokes the user drew beyond the expected count score as pure misses.
    if (user.length > targets.length) {
        pointsTotal += (user.length - targets.length) * SAMPLES_PER_STROKE;
    }

    const percent = pointsTotal === 0 ? 0 : Math.round((insideTotal / pointsTotal) * 100);
    const countOk = user.length === targets.length;

    let startOk = true;
    let dirOk = true;
    for (let i = 0; i < reports.length; i++) {
        if (reports[i].startOffset > startRadius) {
            startOk = false;
        }
        if (reports[i].dirDot <= 0) {
            dirOk = false;
        }
    }

    const pass = percent >= PASS_PERCENT && countOk && startOk && dirOk;

    return {
        incomplete: false,
        percent: percent,
        pass: pass,
        diagnostic: diagnose(letter, reports, countOk, user.length, targets.length, startRadius),
        usedStrokes: user
    };
}

/** One short sentence naming the single biggest problem, from whichever check scored worst. */
function diagnose(
    letter: Letter,
    reports: StrokeReport[],
    countOk: boolean,
    userCount: number,
    targetCount: number,
    startRadius: number
): string {
    if (!countOk) {
        if (userCount < targetCount) {
            return targetCount - userCount === 1
                ? "one stroke is missing"
                : (targetCount - userCount) + " strokes are missing";
        }
        return userCount - targetCount === 1
            ? "that is one stroke too many"
            : "that is " + (userCount - targetCount) + " strokes too many";
    }

    // Worst check first: a reversed stroke beats a misplaced start, which beats drift.
    let reversed: StrokeReport | null = null;
    for (let i = 0; i < reports.length; i++) {
        if (reports[i].dirDot <= 0 && (reversed === null || reports[i].dirDot < reversed.dirDot)) {
            reversed = reports[i];
        }
    }
    if (reversed !== null) {
        const name = strokeName(letter.strokes[reversed.index]);
        const td = reversed.targetDir;
        if (Math.abs(td[1]) >= Math.abs(td[0])) {
            // Slate-local +y is up, so a target heading down has a negative y.
            return td[1] < 0 ? name + " drawn upward" : name + " drawn downward";
        }
        return td[0] > 0 ? name + " drawn right to left" : name + " drawn left to right";
    }

    let farStart: StrokeReport | null = null;
    for (let i = 0; i < reports.length; i++) {
        if (reports[i].startOffset > startRadius && (farStart === null || reports[i].startOffset > farStart.startOffset)) {
            farStart = reports[i];
        }
    }
    if (farStart !== null) {
        return strokeName(letter.strokes[farStart.index]) + " started in the wrong place";
    }

    let worst: StrokeReport | null = null;
    for (let i = 0; i < reports.length; i++) {
        if (worst === null || reports[i].insideRatio < worst.insideRatio) {
            worst = reports[i];
        }
    }
    if (worst === null) {
        return "shapes look close";
    }

    const name = strokeName(letter.strokes[worst.index]);
    if (worst.insideRatio >= 0.95) {
        return "clean work all round";
    }

    if (Math.abs(worst.meanDy) >= Math.abs(worst.meanDx)) {
        return worst.meanDy > 0 ? name + " sits too high" : name + " sits too low";
    }

    // Outward / inward reads better than left / right for a symmetric letter.
    const target = worst.index < letter.strokes.length ? letter.strokes[worst.index] : null;
    if (target !== null) {
        const startX = target.points[0][0];
        const onRight = startX >= 0.5;
        const drifted = worst.meanDx;
        const outward = onRight ? drifted > 0 : drifted < 0;
        return name + (outward ? " drifted outward" : " drifted inward");
    }
    return worst.meanDx > 0 ? name + " drifted right" : name + " drifted left";
}
