import { parseSrt } from './SrtParser';

const PLAY_RES_X = 1920;
const PLAY_RES_Y = 1080;
const FONT_SIZE = 48;
const MAX_LINE_WIDTH = 1600;
const TEXT_COLOUR = '&H00000000'; // black (ASS uses BGR colour order)
const OUTLINE_COLOUR = '&H00FFFFFF'; // white

function styleValue(style: string, key: string, fallback: string): string {
    return style.match(new RegExp(`(?:^|,)${key}=([^,]+)`))?.[1] || fallback;
}

function glyphWidth(char: string, fontSize: number): number {
    if (/\s/u.test(char)) return fontSize * 0.3;
    if (/[\u1100-\u11ff\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff\uff01-\uff60]/u.test(char) || /\p{Extended_Pictographic}/u.test(char)) return fontSize;
    return fontSize * 0.55;
}

export function wrapSubtitleText(text: string, fontSize = FONT_SIZE): string {
    const lines: string[] = [];
    for (const sourceLine of text.split(/\r?\n/u)) {
        let remaining = Array.from(sourceLine.trim());
        if (remaining.length === 0) {
            lines.push('');
            continue;
        }
        while (remaining.length > 0) {
            let width = 0;
            let fit = 0;
            let lastSpace = -1;
            for (let i = 0; i < remaining.length; i++) {
                const next = width + glyphWidth(remaining[i], fontSize);
                if (next > MAX_LINE_WIDTH && i > 0) break;
                width = next;
                fit = i + 1;
                if (/\s/u.test(remaining[i])) lastSpace = i;
            }
            if (fit >= remaining.length) {
                lines.push(remaining.join('').trim());
                break;
            }
            const breakAt = lastSpace > 0 ? lastSpace : Math.max(1, fit);
            lines.push(remaining.slice(0, breakAt).join('').trim());
            remaining = remaining.slice(breakAt);
            while (remaining.length > 0 && /\s/u.test(remaining[0])) remaining.shift();
        }
    }
    return lines.join('\\N');
}

function assTime(milliseconds: number): string {
    const totalCentiseconds = Math.max(0, Math.round(milliseconds / 10));
    const hours = Math.floor(totalCentiseconds / 360000);
    const minutes = Math.floor(totalCentiseconds / 6000) % 60;
    const seconds = Math.floor(totalCentiseconds / 100) % 60;
    const centiseconds = totalCentiseconds % 100;
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
}

export function buildAssSubtitles(srtText: string, requestedStyle: string): string {
    const fontName = styleValue(requestedStyle, 'FontName', 'Arial');
    const backColour = styleValue(requestedStyle, 'BackColour', '&H00000000');
    const bold = styleValue(requestedStyle, 'Bold', '0') === '1' ? '-1' : '0';
    const borderStyle = styleValue(requestedStyle, 'BorderStyle', '1');
    const hasBox = borderStyle === '4';
    const scale = PLAY_RES_Y / 288;
    const fontSize = hasBox ? Math.round(Number(styleValue(requestedStyle, 'FontSize', '12.8')) * scale) : FONT_SIZE;
    const textColour = hasBox ? styleValue(requestedStyle, 'PrimaryColour', '&H00FFFFFF') : TEXT_COLOUR;
    const outlineColour = hasBox ? styleValue(requestedStyle, 'OutlineColour', '&H00000000') : OUTLINE_COLOUR;
    const outline = hasBox ? Number(styleValue(requestedStyle, 'Outline', '1')) * scale : 0.6;
    // libass uses Shadow as the rectangular background padding for BorderStyle 4.
    const shadow = Number(styleValue(requestedStyle, 'Shadow', '0')) * (hasBox ? scale : 1);
    // At this layout scale, Yu Gothic's full-width glyphs advance by about 80% of the ASS font size.
    const wrapFontSize = hasBox && fontName === 'Yu Gothic' ? fontSize * 0.8 : fontSize;
    const alignment = styleValue(requestedStyle, 'Alignment', '2');
    // The old SRT style used a 288-line reference grid; preserve the visual bottom margin.
    const marginV = Math.round(Number(styleValue(requestedStyle, 'MarginV', '10')) * scale);
    const header = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${PLAY_RES_X}\nPlayResY: ${PLAY_RES_Y}\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\nStyle: Default,${fontName},${fontSize},${textColour},&H00000000,${outlineColour},${backColour},${bold},0,0,0,100,100,0,0,${borderStyle},${outline},${shadow},${alignment},160,160,${marginV},1\n\n[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n`;
    const events = parseSrt(srtText).map(subtitle => {
        const safeText = wrapSubtitleText(subtitle.text, wrapFontSize)
            .replace(/\{/gu, '｛')
            .replace(/\}/gu, '｝');
        return `Dialogue: 0,${assTime(subtitle.startMs)},${assTime(subtitle.endMs)},Default,,0,0,0,,${safeText}`;
    });
    return header + events.join('\n') + '\n';
}
