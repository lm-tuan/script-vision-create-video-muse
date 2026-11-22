// Render the supplied J5 project without changing its source files.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const base = 'E:/YOUTUBE TOOL/13112026/13112026';
const source = path.join(base, fs.readdirSync(base).find(name => name.startsWith('J5_01.')));
const out = path.resolve('outputs/j5-motion-smooth');
fs.mkdirSync(out, { recursive: true });
const text = fs.readFileSync(path.join(source, 'prompts.txt'), 'utf8');
const matches = [...text.matchAll(/Scene (\d+):Image (\d+) \((\d\d:\d\d:\d\d,\d+) - (\d\d:\d\d:\d\d,\d+)\)/g)];
const images = fs.readdirSync(path.join(source, 'img')).filter(name => /\.png$/i.test(name)).sort();
if (matches.length !== images.length) throw Error(`Image/timing mismatch: ${images.length}/${matches.length}`);
const seconds = s => { const [h,m,sec] = s.replace(',', '.').split(':').map(Number); return h*3600+m*60+sec; };
const limit = process.argv[2] ? Number(process.argv[2]) : images.length;
if (!Number.isInteger(limit) || limit < 1 || limit > images.length) throw Error('Invalid scene count');
function run(args, cwd = out) {
  const result = spawnSync('ffmpeg', ['-hide_banner','-loglevel','error','-y',...args], {cwd, stdio:'inherit'});
  if (result.status !== 0) throw Error(`ffmpeg failed: ${result.status}`);
}
for (let i=0; i<limit; i++) {
  const start = i === 0 ? 0 : seconds(matches[i][3]);
  const end = i+1 < matches.length ? seconds(matches[i+1][3]) : 963.709375;
  const frames = Math.round(end*25)-Math.round(start*25);
  const dest = `segment-${String(i).padStart(3,'0')}.mp4`;
  if (fs.existsSync(path.join(out,dest))) continue;
  const t = `(0.5-0.5*cos(PI*on/${Math.max(1,frames-1)}))`;
  const mode = i%3;
  const z = [`1.002+0.025*${t}`,`1.027-0.025*${t}`,'1.015'][mode];
  const x = mode === 2 ? `0.4+0.2*${t}` : '0.5';
  // zoompan crops at integer coordinates. Oversampling before cropping reduces
  // the visible jumps on slow moves; the final image remains 1080p.
  const vf = `scale=3840:2160:force_original_aspect_ratio=increase,crop=3840:2160,zoompan=z='${z}':x='(iw-iw/zoom)*(${x})':y='(ih-ih/zoom)*0.5':d=${frames}:s=1920x1080:fps=25,setsar=1,format=yuv420p`;
  console.log(`Rendering ${i+1}/${limit}`);
  run(['-i',path.join(source,'img',images[i]),'-vf',vf,'-frames:v',String(frames),'-c:v','libx264','-preset','veryfast','-crf','21','-an',dest]);
}
fs.writeFileSync(path.join(out,'segments.txt'), Array.from({length:limit},(_,i)=>`file 'segment-${String(i).padStart(3,'0')}.mp4'\n`).join(''));
fs.copyFileSync(path.join(source,'subtitles.srt'),path.join(out,'subtitles.srt'));
const duration = limit < matches.length ? seconds(matches[limit][3]) : 963.709375;
const name = limit < images.length ? 'preview.mp4' : 'j5-motion.mp4';
const subtitle = "subtitles=subtitles.srt:force_style='FontName=Yu Gothic,FontSize=19,PrimaryColour=&H00FFFFFF,OutlineColour=&H00202020,BorderStyle=1,Outline=1.5,Shadow=0.5,Alignment=2,MarginV=35'";
run(['-f','concat','-safe','0','-i','segments.txt','-i',path.join(source,'audio.mp3'),'-vf',subtitle,'-t',String(duration),'-c:v','libx264','-preset','veryfast','-crf','21','-c:a','aac','-b:a','192k','-movflags','+faststart',name]);
console.log(`Finished: ${path.join(out,name)}`);
