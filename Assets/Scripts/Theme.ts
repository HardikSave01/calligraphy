import {RGBA} from "./MeshPainter";

/** All panel geometry in panel-local centimetres. Panel faces the user; +x right, +y up. */
export const L = {
    panelWidth: 40.0,
    panelTop: 14.0,
    panelBottom: -13.5,

    headerY: 12.4,

    pillY: 9.6,
    pillHeight: 3.2,
    pillWidth: 11.4,
    pillGap: 0.7,

    slateTop: 7.4,
    slateBottom: -7.6,
    slateWidth: 18.6,
    slateGap: 1.6,

    verdictTop: 7.4,
    verdictBottom: 5.2,

    ascenderY: 4.4,
    midlineY: 0.4,
    baselineY: -3.6,
    descenderY: -6.4,
    letterWidth: 6.4,

    buttonY: -10.0,
    buttonWidth: 5.4,
    buttonHeight: 2.8,
    buttonGap: 0.7,

    strokeWidth: 0.42,
    ruleWidth: 0.09,
    ghostWidth: 0.95,
    dashWidth: 0.16
};

export const LETTER_HEIGHT = L.ascenderY - L.baselineY;
export const LEFT_SLATE_X = -(L.slateGap * 0.5 + L.slateWidth * 0.5);
export const RIGHT_SLATE_X = L.slateGap * 0.5 + L.slateWidth * 0.5;

/** Depth layering inside the panel; large enough gaps to avoid z-fighting at arm's length. */
export const Z = {
    backdrop: -0.2,
    slate: 0.0,
    rules: 0.15,
    guide: 0.30,
    ink: 0.45,
    ghost: 0.60,
    overlay: 0.75,
    text: 0.95
};

export const C: {[key: string]: RGBA} = {
    backdrop: [0.078, 0.086, 0.110, 1],
    slate: [0.953, 0.941, 0.906, 1],
    ruleStrong: [0.55, 0.60, 0.66, 1],
    ruleMid: [0.72, 0.75, 0.79, 1],
    ruleFaint: [0.886, 0.874, 0.839, 1],
    guideInk: [0.157, 0.404, 0.678, 1],
    userInk: [0.780, 0.235, 0.055, 1],
    ghostSoft: [0.874, 0.855, 0.800, 1],
    ghostDash: [0.478, 0.529, 0.616, 1],
    badge: [0.157, 0.404, 0.678, 1],
    badgeText: [1, 1, 1, 1],
    pillOff: [0.200, 0.222, 0.270, 1],
    pillOn: [0.157, 0.404, 0.678, 1],
    pillTextOff: [0.80, 0.83, 0.88, 1],
    pillTextOn: [1, 1, 1, 1],
    pass: [0.086, 0.639, 0.290, 1],
    fail: [0.851, 0.467, 0.024, 1],
    headerText: [0.93, 0.95, 0.97, 1],
    stateText: [0.84, 0.87, 0.92, 1],
    plate: [0.200, 0.222, 0.270, 1],
    dimText: [0.45, 0.49, 0.56, 1],
    white: [1, 1, 1, 1]
};

export function rgba(c: RGBA): vec4 {
    return new vec4(c[0], c[1], c[2], c[3]);
}
