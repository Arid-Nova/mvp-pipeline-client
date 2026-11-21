import { CardType } from '../models';
import { composePipeline } from './pipelineComposer';
import { COLUMN_GAP, DEFAULT_LAYOUT_ORIGIN, PipelineLayoutError, ROW_GAP, layoutPipelineSpec } from './pipelineLayout';
import { PipelineSpecV1 } from './pipelineSpec';

/** Collapsed card footprint (PipelineCanvas: `w-80`, i.e. 320 px; collapsed cards stay well under 300 px tall). */
const CARD_WIDTH = 320;
const CARD_HEIGHT_COLLAPSED = 260;

const spec = (nodes: [string, string][], edges: [string, string][]): Pick<PipelineSpecV1, 'nodes' | 'edges'> => ({
    nodes: nodes.map(([key, cardType]) => ({ key, cardType })),
    edges: edges.map(([from, to]) => ({ from, to })),
});

const composed = (types: CardType[]): PipelineSpecV1 => {
    const result = composePipeline({ title: 'Layout test', analysisCardTypes: types });
    if (!result.ok) throw new Error(`Composition failed: ${result.reason}`);
    return result.spec;
};

const at = (layout: ReturnType<typeof layoutPipelineSpec>, key: string) => {
    const position = layout.get(key);
    if (!position) throw new Error(`No position for ${key}`);
    return position;
};

describe('layoutPipelineSpec — layers and rows', () => {
    it.each([
        ['one input, one downstream node', spec([['s', 'SYSTEM_INPUT'], ['v', 'VISUALIZATION']], [['s', 'v']]), { s: [0, 0], v: [1, 0] }],
        [
            'linear chain',
            spec([['s', 'SYSTEM_INPUT'], ['r', 'MULTI_REPO'], ['i', 'IR_HOLDER'], ['v', 'VISUALIZATION']], [['s', 'r'], ['r', 'i'], ['i', 'v']]),
            { s: [0, 0], r: [1, 0], i: [2, 0], v: [3, 0] },
        ],
        [
            'branching: siblings share a layer, in spec order',
            spec([['s', 'SYSTEM_INPUT'], ['r', 'MULTI_REPO'], ['i', 'IR_HOLDER'], ['a', 'AEGIS'], ['v', 'VISUALIZATION']], [['s', 'r'], ['r', 'i'], ['i', 'v'], ['i', 'a']]),
            { s: [0, 0], r: [1, 0], i: [2, 0], a: [3, 0], v: [3, 1] },
        ],
        [
            'merge: longest parent path wins',
            spec(
                [['s', 'SYSTEM_INPUT'], ['r', 'MULTI_REPO'], ['i', 'IR_HOLDER'], ['ci', 'CHANGE_IMPACT'], ['s2', 'SYSTEM_INPUT']],
                [['s', 'r'], ['r', 'i'], ['i', 'ci'], ['s2', 'ci']]
            ),
            { s: [0, 0], s2: [0, 1], r: [1, 0], i: [2, 0], ci: [3, 0] },
        ],
        [
            'multiple inputs stay in layer 0',
            spec([['s1', 'SYSTEM_INPUT'], ['s2', 'SYSTEM_INPUT'], ['v', 'VISUALIZATION']], [['s1', 'v'], ['s2', 'v']]),
            { s1: [0, 0], s2: [0, 1], v: [1, 0] },
        ],
    ])('%s', (_name, input, expected) => {
        const layout = layoutPipelineSpec(input);
        Object.entries(expected).forEach(([key, [layer, row]]) => {
            expect(at(layout, key)).toEqual({
                layer,
                row,
                x: DEFAULT_LAYOUT_ORIGIN.x + layer * COLUMN_GAP,
                y: DEFAULT_LAYOUT_ORIGIN.y + row * ROW_GAP,
            });
        });
        expect(layout.size).toBe(input.nodes.length);
    });

    it('keeps PipelineSpec node order within a layer', () => {
        const forward = spec([['s', 'SYSTEM_INPUT'], ['a', 'VISUALIZATION'], ['b', 'COMPONENT_GENERATE'], ['c', 'MULTI_REPO']], [['s', 'a'], ['s', 'b'], ['s', 'c']]);
        const reversed = spec([['s', 'SYSTEM_INPUT'], ['c', 'MULTI_REPO'], ['b', 'COMPONENT_GENERATE'], ['a', 'VISUALIZATION']], [['s', 'a'], ['s', 'b'], ['s', 'c']]);
        expect(['a', 'b', 'c'].map((k) => at(layoutPipelineSpec(forward), k).row)).toEqual([0, 1, 2]);
        expect(['a', 'b', 'c'].map((k) => at(layoutPipelineSpec(reversed), k).row)).toEqual([2, 1, 0]);
    });

    it('spaces collapsed cards so they never overlap', () => {
        expect(COLUMN_GAP).toBeGreaterThan(CARD_WIDTH);
        expect(ROW_GAP).toBeGreaterThan(CARD_HEIGHT_COLLAPSED);
        const layout = layoutPipelineSpec(composed(['VISUALIZATION', 'FORMAL_VIZ', 'VERIFICATION_COMPARISON', 'AEGIS', 'TEST_EXECUTOR']));
        const boxes = Array.from(layout.values());
        boxes.forEach((a, i) =>
            boxes.slice(i + 1).forEach((b) => {
                const overlapX = Math.abs(a.x - b.x) < CARD_WIDTH;
                const overlapY = Math.abs(a.y - b.y) < CARD_HEIGHT_COLLAPSED;
                expect(overlapX && overlapY).toBe(false);
            })
        );
    });

    it('is deterministic and gives every node exactly one position', () => {
        const input = composed(['VISUALIZATION', 'FORMAL_VIZ', 'VERIFICATION_COMPARISON']);
        const a = Array.from(layoutPipelineSpec(input).entries());
        const b = Array.from(layoutPipelineSpec(input).entries());
        expect(b).toEqual(a);
        expect(a.map(([key]) => key)).toEqual(input.nodes.map((n) => n.key));
        expect(new Set(a.map(([, p]) => `${p.x},${p.y}`)).size).toBe(input.nodes.length);
    });

    it('shifts every node by a custom origin', () => {
        const input = composed(['CHANGE_IMPACT']);
        const base = layoutPipelineSpec(input);
        const shifted = layoutPipelineSpec(input, { x: 0, y: -50 });
        input.nodes.forEach(({ key }) => {
            expect(at(shifted, key).x - at(base, key).x).toBe(-DEFAULT_LAYOUT_ORIGIN.x);
            expect(at(shifted, key).y - at(base, key).y).toBe(-50 - DEFAULT_LAYOUT_ORIGIN.y);
        });
    });

    it('does not mutate the spec', () => {
        const input = composed(['SECURITY_REGRESSION']);
        const snapshot = JSON.stringify(input);
        layoutPipelineSpec(input);
        expect(JSON.stringify(input)).toBe(snapshot);
        expect(input.nodes.some((node) => 'x' in node || 'y' in node)).toBe(false);
    });
});

describe('layoutPipelineSpec — order-sensitive Policy Drift (two Formal Verification inputs)', () => {
    it('places the first-listed (base) Formal Verification above the second', () => {
        const layout = layoutPipelineSpec(
            spec(
                [['fv_base', 'FORMAL_VERIFY'], ['fv_pr', 'FORMAL_VERIFY'], ['sr', 'SECURITY_REGRESSION']],
                [['fv_base', 'sr'], ['fv_pr', 'sr']]
            )
        );
        expect(at(layout, 'fv_base').y).toBeLessThan(at(layout, 'fv_pr').y);
    });

    it('keeps the base chain above the comparison chain for a composed Policy Drift pipeline', () => {
        const input = composed(['SECURITY_REGRESSION', 'VISUALIZATION']);
        const layout = layoutPipelineSpec(input);
        expect(at(layout, 'formal_verify').layer).toBe(at(layout, 'formal_verify_compare').layer);
        expect(at(layout, 'formal_verify').y).toBeLessThan(at(layout, 'formal_verify_compare').y);
        // The runtime picks base vs PR by sorting the two upstream FORMAL_VERIFY cards on y.
        const upstream = input.edges.filter((e) => e.to === 'security_regression').map((e) => e.from);
        const [base, pr] = [...upstream].sort((a, b) => at(layout, a).y - at(layout, b).y);
        expect([base, pr]).toEqual(['formal_verify', 'formal_verify_compare']);
    });
});

describe('layoutPipelineSpec — impossible graphs fail safely', () => {
    it.each([
        ['a cycle', spec([['s', 'SYSTEM_INPUT'], ['a', 'MULTI_REPO'], ['b', 'IR_HOLDER']], [['s', 'a'], ['a', 'b'], ['b', 'a']])],
        ['an unknown edge endpoint', spec([['s', 'SYSTEM_INPUT'], ['v', 'VISUALIZATION']], [['s', 'ghost']])],
        ['duplicate keys', spec([['s', 'SYSTEM_INPUT'], ['s', 'VISUALIZATION']], [])],
    ])('throws PipelineLayoutError for %s instead of placing nodes at (0, 0)', (_name, input) => {
        expect(() => layoutPipelineSpec(input)).toThrow(PipelineLayoutError);
    });
});
