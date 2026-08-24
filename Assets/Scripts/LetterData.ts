import {Pt} from "./Geometry";

/**
 * One stroke of a letter. `points` are normalised into the letter box:
 * (0,0) = top-left at the ascender line, (1,1) = bottom-right at the baseline.
 * This single structure drives the demo animation, the step pills, the ghost
 * overlay and the scoring — there are no font glyphs anywhere in this Lens.
 */
export interface Stroke {
    id: string;
    points: Pt[];
    hint: string;
}

export interface Letter {
    char: string;
    strokes: Stroke[];
}

export const LETTERS: Letter[] = [
    {
        char: "A",
        strokes: [
            {
                id: "A1",
                points: [[0.5, 0.0], [0.1, 1.0]],
                hint: "left diagonal, top to bottom"
            },
            {
                id: "A2",
                points: [[0.5, 0.0], [0.9, 1.0]],
                hint: "right diagonal, same start"
            },
            {
                id: "A3",
                points: [[0.22, 0.65], [0.78, 0.65]],
                hint: "crossbar, left to right"
            }
        ]
    },
    {
        char: "B",
        strokes: [
            {
                id: "B1",
                points: [[0.15, 0.0], [0.15, 1.0]],
                hint: "stem, straight down"
            },
            {
                id: "B2",
                points: [[0.15, 0.0], [0.60, 0.05], [0.72, 0.25], [0.60, 0.45], [0.15, 0.50]],
                hint: "upper bowl, curve out and back"
            },
            {
                id: "B3",
                points: [[0.15, 0.50], [0.65, 0.55], [0.80, 0.75], [0.65, 0.95], [0.15, 1.0]],
                hint: "lower bowl, wider than the first"
            }
        ]
    },
    {
        char: "C",
        strokes: [
            {
                id: "C1",
                points: [
                    [0.85, 0.15], [0.60, 0.0], [0.30, 0.05], [0.12, 0.30],
                    [0.12, 0.70], [0.30, 0.95], [0.60, 1.0], [0.85, 0.85]
                ],
                hint: "one curve, top right to bottom right"
            }
        ]
    }
];

/** Short human name for a stroke, taken from the leading phrase of its hint. */
export function strokeName(stroke: Stroke): string {
    const comma = stroke.hint.indexOf(",");
    return comma < 0 ? stroke.hint : stroke.hint.substring(0, comma).trim();
}
